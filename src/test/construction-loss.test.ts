import { describe, expect, it } from "vitest";
import { Game, GROUND, setMapSize } from "@/game/engine";

function constructionGame(level: 1 | 2) {
  setMapSize(2);
  const game = new Game(81);
  game.map.fill(GROUND);
  game.land(16, 16);
  if (level === 2) {
    game.phase = "won";
    game.continueToCruiser();
    game.landCruiser(36, 16);
  }
  game.spawns = [];
  game.nextHorde = 10000;
  game.credits = 1000;
  return game;
}

function attackBuilder(game: Game) {
  const engineer = game.engineers[0];
  if (!engineer) throw new Error("Missing engineer");
  game.bugs.push({ x: engineer.x, y: engineer.y, hp: 10000, max: 10000, speed: 0, dmg: 20000, r: 0.32, kind: 0, bounty: 0 });
  game.update(0.01);
  game.bugs = [];
}

describe("construction cancellation on builder death", () => {
  it.each([1, 2] as const)("removes a Level %i unfinished tower and prevents replacement builders resuming it", (level) => {
    const game = constructionGame(level);
    game.placeTower(10, 10);
    const engineer = game.engineers[0];
    const tower = game.towers[0];
    if (!engineer || !tower) throw new Error("Missing construction");
    engineer.x = 10.5; engineer.y = 11.2;
    game.update(0.1);
    expect(engineer.job).toBe(tower.id);
    expect(tower.built).toBeGreaterThan(0);
    tower.built = 0.999; // A dead builder cannot complete it on the same tick.
    attackBuilder(game);
    expect(game.engineers).toHaveLength(0);
    expect(game.towers).toHaveLength(0);
    expect(game.trainEngineer()).toBe(true);
    game.update(1);
    expect(game.towers).toHaveLength(0);
    expect(game.engineers[0]?.job).toBe(null);
  });

  it("removes unfinished and queued wall segments while retaining completed segments and other teams' work", () => {
    const game = constructionGame(2);
    const engineer = game.engineers[0];
    if (!engineer) throw new Error("Missing engineer team");
    game.buildWall(10.5, 10.5, 12.5, 10.5);
    game.buildWall(10.5, 12.5, 12.5, 12.5);
    const finished = game.walls[0];
    if (!finished) throw new Error("Missing wall segment");
    finished.built = 1; finished.paid = true;
    game.wallGrid[10 * 64 + 10] = 1;
    game.trainEngineer();
    game.buildWall(45.5, 10.5, 46.5, 10.5);
    engineer.x = 11.5; engineer.y = 10.5;
    game.update(0.1);
    expect(game.walls.find((wall) => wall.tx === 11 && wall.ty === 10)?.built).toBeGreaterThan(0);
    attackBuilder(game);
    expect(game.walls.map((wall) => [wall.tx, wall.ty])).toEqual([[10, 10], [45, 10], [46, 10]]);
    expect(game.wallGrid[10 * 64 + 10]).toBe(1);
    expect(game.wallJobs).toHaveLength(1);
    expect(game.trainEngineer()).toBe(true);
    game.update(1);
    expect(game.walls.map((wall) => [wall.tx, wall.ty])).toEqual([[10, 10], [45, 10], [46, 10]]);
  });

  it("keeps construction active when some members die but the engineer team survives", () => {
    const game = constructionGame(2);
    game.buildWall(10.5, 10.5, 11.5, 10.5);
    const engineer = game.engineers[0];
    if (!engineer) throw new Error("Missing engineer team");
    engineer.x = 10.5; engineer.y = 10.5;
    engineer.members = 1;
    game.update(0.1);
    expect(game.walls).toHaveLength(2);
    expect(game.walls[0]?.built).toBeGreaterThan(0);
    expect(game.wallJobs).toHaveLength(1);
  });

  it("preserves a finished tower when its former builder dies", () => {
    const game = constructionGame(1);
    game.placeTower(10, 10);
    const engineer = game.engineers[0], tower = game.towers[0];
    if (!engineer || !tower) throw new Error("Missing construction");
    engineer.job = tower.id;
    tower.built = 1;
    attackBuilder(game);
    expect(game.towers).toEqual([tower]);
  });
});