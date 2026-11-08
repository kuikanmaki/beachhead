import { describe, expect, it } from "vitest";
import { CRUISER_HP, Game, GROUND, HOLD_NEEDED, ROCK, SQUAD_SIZE, WIN_AFTER, setMapSize } from "@/game/engine";

function gameWithCruiser() {
  setMapSize(2);
  const game = new Game(21);
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

  it("requires a clear 7×7 landing sector", () => {
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

  it("starts with a smaller horde while retaining stronger second-stage enemies", () => {
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
    expect(second.bugs.length).toBe(20);
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
    expect(game.nextHorde - game.t).toBe(45);
  });

  it("allows 12 enemy-free seconds, then sends scouts before the first horde", () => {
    const game = gameWithCruiser();
    game.t = 1000;
    game.levelStartedAt = 1000;
    game.nextHorde = 1045;
    for (let i = 0; i < 120; i++) game.update(0.1);
    expect(game.bugs).toHaveLength(0);
    expect(game.wave).toBe(0);
    for (let i = 0; i < 180; i++) game.update(0.1);
    expect(game.bugs.length).toBeGreaterThan(0);
    expect(game.wave).toBe(0);
    for (let i = 0; i < 151; i++) game.update(0.1);
    expect(game.wave).toBe(1);
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
    expect(sizes).toEqual([20, 28, 36]);
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
    expect(early.bugs[0]?.hp).toBe(54);
    expect(late.bugs[0]?.hp).toBe(94);
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
});
