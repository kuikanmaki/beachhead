import { describe, expect, it } from "vitest";
import { CRUISER_HP, ENGINEER_TEAM_SIZE, Game, GROUND, HOLD_NEEDED, ROCK, SQUAD_SIZE, WIN_AFTER, setMapSize } from "@/game/engine";

function gameWithCruiser(seed = 21) {
  setMapSize(2);
  const game = new Game(seed);
  game.map.fill(GROUND);
  game.land(16, 16);
  game.phase = "won";
  expect(game.continueToCruiser()).toBe(true);
  expect(game.landCruiser(36, 16)).toBe(true);
  return game;
}

describe("second-stage command cruiser", () => {
  it("unlocks only after victory and preserves the surviving army and defenses", () => {
    setMapSize(2);
    const game = new Game(20);
    game.map.fill(GROUND);
    game.land(16, 16);
    game.towers.push({ id: 90, tx: 20, ty: 20, built: 1, hp: 300, cd: 0 });
    game.credits = 345;
    const infantry = game.infantry, engineers = game.engineers, towers = game.towers;

    expect(game.continueToCruiser()).toBe(false);
    game.phase = "won";
    expect(game.continueToCruiser()).toBe(true);
    expect(game.level).toBe(2);
    expect(game.phase).toBe("shipLanding");
    expect(game.infantry).toBe(infantry);
    expect(game.engineers).toBe(engineers);
    expect(game.towers).toBe(towers);
    expect(game.credits).toBe(345);

    expect(game.landCruiser(36, 16)).toBe(true);
    expect(game.hasCruiser).toBe(true);
    expect(game.phase).toBe("playing");
    expect(game.core.max).toBe(CRUISER_HP);
    expect(game.infantry).toBe(infantry);
    expect(game.towers).toBe(towers);
  });

  it("requires a rock-free 7×7 landing sector", () => {
    setMapSize(2);
    const game = new Game(22);
    game.map.fill(GROUND);
    game.land(16, 16);
    game.phase = "won";
    game.continueToCruiser();
    game.map[16 * 64 + 36] = ROCK;

    expect(game.canLandCruiser(36, 16)).toBe(false);
    expect(game.landCruiser(36, 16)).toBe(false);
    expect(game.phase).toBe("shipLanding");
    game.map[16 * 64 + 36] = GROUND;
    expect(game.canLandCruiser(36, 16)).toBe(true);
  });

  it("lands over the original ship without removing surviving troops", () => {
    setMapSize(2);
    const game = new Game(22);
    game.map.fill(GROUND);
    game.land(16, 16);
    const oldShip = game.core;
    const infantry = game.infantry, engineers = game.engineers;
    game.phase = "won";
    game.continueToCruiser();
    expect(game.landCruiser(16, 16)).toBe(true);
    expect(game.core).not.toBe(oldShip);
    expect(game.core).toEqual({ x: 16.5, y: 16.5, hp: CRUISER_HP, max: CRUISER_HP });
    expect(game.infantry).toBe(infantry);
    expect(game.engineers).toBe(engineers);
  });

  it("deletes covered installations and construction jobs but preserves those outside the footprint", () => {
    setMapSize(2);
    const game = new Game(22);
    game.map.fill(GROUND);
    game.land(16, 16);
    game.towers.push(
      { id: 90, tx: 33, ty: 13, built: 1, hp: 300, cd: 0 },
      { id: 91, tx: 39, ty: 19, built: 0.5, hp: 300, cd: 0 },
      { id: 92, tx: 40, ty: 19, built: 1, hp: 300, cd: 0 },
    );
    game.walls.push(
      { id: 93, jobId: 95, tx: 36, ty: 16, x: 36.5, y: 16.5, angle: 0, built: 1, paid: true },
      { id: 94, jobId: 96, tx: 32, ty: 16, x: 32.5, y: 16.5, angle: 0, built: 1, paid: true },
    );
    game.wallGrid[16 * 64 + 36] = 1;
    game.wallGrid[16 * 64 + 32] = 1;
    game.wallJobs.push(
      { id: 95, engineerId: null, wallIds: [93] },
      { id: 96, engineerId: null, wallIds: [93, 94] },
    );
    const engineer = game.engineers[0];
    if (!engineer) throw new Error("Missing starting engineer");
    engineer.job = 91;
    const credits = game.credits;
    game.phase = "won";
    game.continueToCruiser();
    expect(game.canLandCruiser(36, 16)).toBe(true);
    expect(game.landCruiser(36, 16)).toBe(true);
    expect(game.towers.map((tower) => tower.id)).toEqual([92]);
    expect(game.walls.map((wall) => wall.id)).toEqual([94]);
    expect(game.wallGrid[16 * 64 + 36]).toBe(0);
    expect(game.wallGrid[16 * 64 + 32]).toBe(1);
    expect(game.wallJobs).toEqual([{ id: 96, engineerId: null, wallIds: [94] }]);
    expect(engineer.job).toBe(null);
    expect(game.credits).toBe(credits);
  });

  it("produces every new squad and engineer at the cruiser before moving to the rally point", () => {
    const game = gameWithCruiser();
    game.credits = 1000;

    expect(game.dropInfantry(45.5, 22.5)).toBe(true);
    const squad = game.infantry.at(-1)!;
    expect(squad.kind).toBe("squad");
    expect(squad.soldiers).toBe(SQUAD_SIZE);
    expect(squad.x).toBe(game.core.x);
    expect(squad.y).toBe(game.core.y);
    expect(squad.tx).toBe(45.5);
    expect(squad.ty).toBe(22.5);
    expect(squad.path.length).toBeGreaterThan(0);

    expect(game.trainEngineer()).toBe(true);
    const engineer = game.engineers.at(-1)!;
    expect(engineer.x).toBe(game.core.x);
    expect(engineer.y).toBe(game.core.y);
  });

  it("opens with a larger horde while retaining stronger second-stage enemies", () => {
    setMapSize(2);
    const first = new Game(30), second = new Game(30);
    for (const game of [first, second]) {
      game.map.fill(GROUND);
      game.land(16, 16);
      game.nextHorde = 0;
    }
    second.level = 2;
    second.hasCruiser = true;

    first.update(0.01);
    second.update(0.01);
    expect(second.wave).toBe(1);
    expect(second.bugs.length).toBe(42);
    expect(first.bugs.length).toBe(22);

    const levelOne = new Game(31), levelTwo = new Game(31);
    for (const game of [levelOne, levelTwo]) { game.spawns = [0]; game.t = 200; }
    levelTwo.level = 2;
    levelTwo.hasCruiser = true;
    levelOne.spawnBug(0);
    levelTwo.spawnBug(0);
    const firstBug = levelOne.bugs[0]!, secondBug = levelTwo.bugs[0]!;
    expect(secondBug.hp).toBeGreaterThan(firstBug.hp);
    expect(secondBug.dmg).toBeGreaterThan(firstBug.dmg);
    expect(secondBug.speed).toBeGreaterThan(firstBug.speed);
  });

  it("clears leftover enemies and resets the wave counter when Level 2 begins", () => {
    setMapSize(2);
    const game = new Game(32);
    game.map.fill(GROUND);
    game.land(16, 16);
    game.t = 900;
    game.wave = 15;
    game.spawnAcc = 0.9;
    game.spawnBug(0);
    expect(game.bugs).toHaveLength(1);
    game.phase = "won";
    game.continueToCruiser();
    expect(game.bugs).toHaveLength(0);
    game.landCruiser(36, 16);
    expect(game.bugs).toHaveLength(0);
    expect(game.wave).toBe(0);
    expect(game.spawnAcc).toBe(0);
    expect(game.nextHorde).toBe(game.t);
  });

  it("sends the first horde immediately with no quiet period", () => {
    const game = gameWithCruiser();
    expect(game.bugs).toHaveLength(0);
    expect(game.wave).toBe(0);

    game.update(0.01);

    expect(game.wave).toBe(1);
    expect(game.bugs).toHaveLength(42);
    expect(game.nextHorde - game.t).toBeCloseTo(60, 1);
  });

  it("grows successive hordes and shortens their intervals gradually", () => {
    const game = gameWithCruiser();
    const sizes: number[] = [];
    const intervals: number[] = [];
    for (let wave = 0; wave < 3; wave++) {
      game.bugs = [];
      game.spawnAcc = 0;
      game.t = game.nextHorde;
      game.update(0.01);
      sizes.push(game.bugs.length);
      intervals.push(Math.round(game.nextHorde - game.t));
    }
    expect(sizes).toEqual([42, 54, 66]);
    expect(intervals).toEqual([60, 55, 50]);
  });

  it("scales enemy health with Level 2 time rather than previous mission duration", () => {
    const early = gameWithCruiser(), late = gameWithCruiser();
    early.t = 1012;
    early.levelStartedAt = 1000;
    late.t = 1312;
    late.levelStartedAt = 1000;
    early.spawnBug(0);
    late.spawnBug(0);
    expect(early.bugs[0]?.hp).toBeCloseTo(55.6);
    expect(late.bugs[0]?.hp).toBeCloseTo(95.6);
  });

  it("keeps the second stage running beyond the first-stage victory condition", () => {
    const game = gameWithCruiser();
    game.spawns = [];
    game.bugs = [];
    game.t = WIN_AFTER + HOLD_NEEDED + 30;
    game.lastDeath = 0;
    game.nextHorde = game.t + 100;

    game.update(0.01);

    expect(game.t).toBeGreaterThan(WIN_AFTER + HOLD_NEEDED);
    expect(game.phase).toBe("playing");
  });

  it("lets forward-deployed squads protect wall construction with troop sacrifices", () => {
    const game = gameWithCruiser(20);
    game.credits = 1000;
    for (const [dx, dy] of [[-6, 0], [6, 0], [0, -6], [0, 6]] as const) {
      expect(game.dropSquad(game.core.x + dx, game.core.y + dy)).toBe(true);
    }
    const cx = Math.floor(game.core.x), cy = Math.floor(game.core.y), r = 4;
    game.buildWall(cx - r + 0.5, cy - r + 0.5, cx + r + 0.5, cy - r + 0.5);
    game.buildWall(cx + r + 0.5, cy - r + 0.5, cx + r + 0.5, cy + r + 0.5);
    game.buildWall(cx + r + 0.5, cy + r + 0.5, cx - r + 0.5, cy + r + 0.5);
    game.buildWall(cx - r + 0.5, cy + r + 0.5, cx - r + 0.5, cy - r + 0.5);

    for (let i = 0; i < 2400 && game.phase === "playing"; i++) game.update(0.05);

    expect(game.phase).toBe("won");
    expect(game.walls.filter((wall) => wall.built >= 1)).toHaveLength(32);
    expect(game.deaths).toBeGreaterThan(0);
    expect(game.kills).toBeGreaterThan(0);
  });

  it("defeats wall construction that has no forward squad protection", () => {
    const game = gameWithCruiser(23);
    game.credits = 1000;
    const cx = Math.floor(game.core.x), cy = Math.floor(game.core.y), r = 4;
    game.buildWall(cx - r + 0.5, cy - r + 0.5, cx + r + 0.5, cy - r + 0.5);
    game.buildWall(cx + r + 0.5, cy - r + 0.5, cx + r + 0.5, cy + r + 0.5);
    game.buildWall(cx + r + 0.5, cy + r + 0.5, cx - r + 0.5, cy + r + 0.5);
    game.buildWall(cx - r + 0.5, cy + r + 0.5, cx - r + 0.5, cy - r + 0.5);

    for (let i = 0; i < 2400 && game.phase === "playing"; i++) game.update(0.05);

    expect(game.phase).toBe("lost");
    expect(game.walls.filter((wall) => wall.built >= 1).length).toBeLessThan(32);
    expect(game.engineers.reduce((sum, engineer) => sum + engineer.members, 0)).toBeLessThan(ENGINEER_TEAM_SIZE);
  });

  it("overwhelms an undefended cruiser during the escalating attacks", () => {
    const game = gameWithCruiser(20);
    for (let i = 0; i < 1800 && game.phase === "playing"; i++) game.update(0.05);
    expect(game.phase).toBe("lost");
    expect(game.core.hp).toBeLessThanOrEqual(0);
  });
});
