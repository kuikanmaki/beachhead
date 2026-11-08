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
  game.walls.push({ id: game.nid++, jobId: -1, tx, ty, x: tx + 0.5, y: ty + 0.5, angle: 0, built: 1, paid: true });
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

  it("places evenly spaced wall units on the exact drawn line at one shared angle", () => {
    const game = cruiserGame(71);
    const x1 = 5.5, y1 = 5.5, x2 = 9.5, y2 = 8.5;
    const line = game.wallLine(x1, y1, x2, y2);
    const angle = Math.atan2(y2 - y1, x2 - x1);
    expect(line.length).toBeGreaterThan(2);
    expect(line[0]).toMatchObject({ tx: 5, ty: 5, x: x1, y: y1, angle });
    expect(line.at(-1)).toMatchObject({ tx: 9, ty: 8, x: x2, y: y2, angle });
    for (let i = 0; i < line.length; i++) {
      const site = line[i]!;
      expect(site.angle).toBeCloseTo(angle);
      expect((site.x - x1) * (y2 - y1) - (site.y - y1) * (x2 - x1)).toBeCloseTo(0);
      expect(site.tx).toBe(Math.floor(site.x));
      expect(site.ty).toBe(Math.floor(site.y));
      if (i) expect(Math.hypot(site.x - line[i - 1]!.x, site.y - line[i - 1]!.y)).toBeLessThanOrEqual(1.000001);
    }
  });

  it("keeps the drawn angle and straight centers when creating construction jobs", () => {
    const game = cruiserGame(71);
    game.credits = 1000;
    expect(game.buildWall(10.2, 10.8, 14.6, 13.1)).toBe(true);
    const angle = Math.atan2(2.3, 4.4);
    expect(game.walls.length).toBeGreaterThan(2);
    for (const wall of game.walls) {
      expect(wall.angle).toBeCloseTo(angle);
      expect((wall.x - 10.2) * 2.3 - (wall.y - 10.8) * 4.4).toBeCloseTo(0);
    }
  });

  it("rejects an entire line containing sheer rock instead of leaving a gap", () => {
    const game = cruiserGame(72);
    game.map[10 * 64 + 11] = ROCK;
    const plan = game.wallPlan(10.5, 10.5, 12.5, 10.5);
    expect(plan.tiles).toHaveLength(3);
    expect(plan.blocked).toBe(1);
    expect(plan.valid).toBe(false);
    expect(game.buildWall(10.5, 10.5, 12.5, 10.5)).toBe(false);
    expect(game.walls).toHaveLength(0);
    expect(game.wallJobs).toHaveLength(0);
  });

  it("rejects a line that overlaps an existing wall instead of skipping it", () => {
    const game = cruiserGame(72);
    expect(game.buildWall(10.5, 10.5, 12.5, 10.5)).toBe(true);
    const wallCount = game.walls.length;
    const jobCount = game.wallJobs.length;
    const plan = game.wallPlan(9.5, 10.5, 11.5, 10.5);
    expect(plan.blocked).toBe(2);
    expect(plan.valid).toBe(false);
    expect(game.buildWall(9.5, 10.5, 11.5, 10.5)).toBe(false);
    expect(game.walls).toHaveLength(wallCount);
    expect(game.wallJobs).toHaveLength(jobCount);
  });

  it("rejects any line that crosses the map boundary", () => {
    const game = cruiserGame(72);
    const plan = game.wallPlan(-0.5, 10.5, 1.5, 10.5);
    expect(plan.blocked).toBeGreaterThan(0);
    expect(plan.valid).toBe(false);
    expect(game.buildWall(-0.5, 10.5, 1.5, 10.5)).toBe(false);
    expect(game.walls).toHaveLength(0);
    expect(game.wallJobs).toHaveLength(0);
  });

  it("keeps every accepted angled line connected without skipped tiles", () => {
    const game = cruiserGame(72);
    const plan = game.wallPlan(5.2, 5.3, 12.8, 9.1);
    expect(plan.valid).toBe(true);
    expect(plan.continuous).toBe(true);
    for (let i = 1; i < plan.tiles.length; i++) {
      const previous = plan.tiles[i - 1]!;
      const tile = plan.tiles[i]!;
      expect(Math.max(Math.abs(tile.tx - previous.tx), Math.abs(tile.ty - previous.ty))).toBe(1);
      expect(Math.hypot(tile.x - previous.x, tile.y - previous.y)).toBeLessThanOrEqual(1.000001);
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
