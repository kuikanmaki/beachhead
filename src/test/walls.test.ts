import { describe, expect, it } from "vitest";
import { COST, ENGINEER_TEAM_SIZE, Game, GROUND, ROCK, setMapSize } from "@/game/engine";

function cruiserGame(seed = 70) {
  setMapSize(2);
  const game = new Game(seed);
  game.map.fill(GROUND);
  game.land(16, 16);
  game.phase = "won";
  game.continueToCruiser();
  game.landCruiser(36, 16);
  game.spawns = [];
  game.nextHorde = 10000;
  return game;
}

function finishWall(game: Game, tx: number, ty: number) {
  if (game.wallGrid[ty * 64 + tx]) return;
  game.walls.push({ id: game.nid++, jobId: -1, tx, ty, built: 1, paid: true });
  game.wallGrid[ty * 64 + tx] = 1;
}

function sealCruiser(game: Game, rockSide = false) {
  const cx = Math.floor(game.core.x), cy = Math.floor(game.core.y);
  for (let y = cy - 4; y <= cy + 4; y++) for (let x = cx - 4; x <= cx + 4; x++) {
    if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== 4) continue;
    if (rockSide && x === cx - 4) game.map[y * 64 + x] = ROCK;
    else finishWall(game, x, y);
  }
  game.computeFlow();
}

describe("Level 2 engineer teams and walls", () => {
  it("replaces new Level 2 engineers with a four-person engineer team", () => {
    const game = cruiserGame();
    game.credits = 1000;
    const existing = game.engineers[0]!;
    expect(existing.kind).toBe("team");
    expect(existing.members).toBe(ENGINEER_TEAM_SIZE);
    expect(ENGINEER_TEAM_SIZE).toBe(4);

    expect(game.trainEngineer()).toBe(true);
    const trained = game.engineers.at(-1)!;
    expect(trained.kind).toBe("team");
    expect(trained.members).toBe(4);
    expect(game.credits).toBe(1000 - COST.engineerTeam);
  });

  it("rasterizes a drag as an ordered four-connected line without diagonal gaps", () => {
    const game = cruiserGame(71);
    const line = game.wallLine(5.5, 5.5, 9.5, 8.5);
    expect(line[0]).toEqual({ tx: 5, ty: 5 });
    expect(line.at(-1)).toEqual({ tx: 9, ty: 8 });
    for (let i = 1; i < line.length; i++) {
      expect(Math.abs(line[i]!.tx - line[i - 1]!.tx) + Math.abs(line[i]!.ty - line[i - 1]!.ty)).toBe(1);
    }
  });

  it("builds in drag order and charges once for each completed segment", () => {
    const game = cruiserGame(72);
    game.credits = 1000;
    expect(game.buildWall(10.5, 10.5, 12.5, 10.5)).toBe(true);
    const engineer = game.engineers[0]!;
    engineer.x = 10.5; engineer.y = 10.5;

    game.update(0.01);
    expect(game.walls.map((w) => [w.tx, w.ty])).toEqual([[10, 10], [11, 10], [12, 10]]);
    expect(game.walls[0]!.paid).toBe(true);
    expect(game.walls.slice(1).every((w) => !w.paid && w.built === 0)).toBe(true);
    expect(game.credits).toBeCloseTo(1000 + 0.04 - COST.wall);

    for (let i = 0; i < 100 && game.walls.some((w) => w.built < 1); i++) game.update(0.05);
    expect(game.walls.every((w) => w.built === 1 && w.paid)).toBe(true);
  });

  it("pauses before an unaffordable segment instead of charging partial credits", () => {
    const game = cruiserGame(73);
    game.credits = COST.wall;
    game.buildWall(10.5, 10.5, 11.5, 10.5);
    const engineer = game.engineers[0]!;
    engineer.x = 10.5; engineer.y = 10.5;

    game.update(0.75);
    expect(game.walls[0]!.built).toBe(1);
    expect(game.walls[1]!.built).toBe(0);
    expect(game.walls[1]!.paid).toBe(false);
    expect(game.credits).toBeLessThan(COST.wall);
  });

  it("makes only completed wall segments impassable to enemies", () => {
    const game = cruiserGame(74);
    game.credits = 1000;
    game.buildWall(12.5, 16.5, 12.5, 16.5);
    const wall = game.walls[0]!;
    expect(game.isEnemyBlocked(12, 16)).toBe(false);
    wall.built = 1; wall.paid = true; game.wallGrid[16 * 64 + 12] = 1;
    game.computeFlow();
    expect(game.isEnemyBlocked(12, 16)).toBe(true);

    const team = game.infantry[0]!;
    team.x = 12.9; team.y = 16.5; team.path = [];
    game.bugs.push({ x: 11.4, y: 16.5, hp: 10000, max: 10000, speed: 5, dmg: 0, r: 0.32, kind: 0, bounty: 0 });
    for (let i = 0; i < 5; i++) {
      game.update(0.1);
      expect(game.bugs[0]!.x).toBeLessThan(12);
    }
    expect(game.bugs[0]!.x).toBeGreaterThan(11.4);
  });
});

describe("Level 2 perimeter objective", () => {
  it("recognizes a perimeter made from both walls and impenetrable terrain", () => {
    const game = cruiserGame(75);
    sealCruiser(game, true);
    expect(game.perimeterStatus()).toEqual({ sealed: true, enemiesInside: 0 });
  });

  it("does not complete while any live enemy remains inside the sealed perimeter", () => {
    const game = cruiserGame(76);
    sealCruiser(game);
    game.bugs.push({ x: game.core.x + 1, y: game.core.y, hp: 100, max: 100, speed: 0, dmg: 0, r: 0.32, kind: 0, bounty: 0 });
    game.update(0.01);
    expect(game.perimeter).toEqual({ sealed: true, enemiesInside: 1 });
    expect(game.phase).toBe("playing");
  });

  it("completes with a sealed, clear perimeter even when live enemies remain outside", () => {
    const game = cruiserGame(77);
    sealCruiser(game);
    game.bugs.push({ x: 1.5, y: 1.5, hp: 100, max: 100, speed: 0, dmg: 0, r: 0.32, kind: 0, bounty: 0 });
    game.update(0.01);
    expect(game.perimeter).toEqual({ sealed: true, enemiesInside: 0 });
    expect(game.phase).toBe("won");
    expect(game.bugs).toHaveLength(1);
  });

  it("keeps Level 2 running while the cruiser still has an open route to the map edge", () => {
    const game = cruiserGame(78);
    game.update(0.01);
    expect(game.perimeter.sealed).toBe(false);
    expect(game.phase).toBe("playing");
  });
});
