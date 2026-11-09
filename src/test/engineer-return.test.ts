import { describe, expect, it } from "vitest";
import { Game, GROUND, ROCK, setMapSize } from "@/game/engine";

function setup(team = false) {
  setMapSize(2);
  const game = new Game(81);
  game.map.fill(GROUND);
  game.land(5, 5);
  game.spawns = []; game.nextHorde = 10000; game.credits = 1000;
  const engineer = game.engineers[0];
  if (!engineer) throw new Error("Missing engineer");
  if (team) {
    game.level = 2; game.hasCruiser = true;
    engineer.kind = "team"; engineer.members = 4;
  }
  return { game, engineer };
}

describe("engineer post-construction movement", () => {
  it("returns a Level 1 engineer to the ship after completing a tower, routing around rock", () => {
    const { game, engineer } = setup();
    for (let y = 0; y < 32; y++) if (y !== 10) game.map[y * 64 + 10] = ROCK;
    engineer.x = 15.5; engineer.y = 5.2;
    game.placeTower(15, 4);
    for (let i = 0; i < 125; i++) game.update(0.05);
    expect(game.towers[0]?.built).toBe(1);
    expect(engineer.postBuildMove).toBe(true);
    expect(engineer.path.some((point) => point.y >= 10)).toBe(true);
    for (let i = 0; i < 200; i++) {
      game.update(0.05);
      expect(game.at(Math.floor(engineer.x), Math.floor(engineer.y))).not.toBe(ROCK);
    }
    expect(engineer.x).toBeCloseTo(game.core.x);
    expect(engineer.y).toBeCloseTo(game.core.y);
  });

  it("steps a team two meters toward the ship after every wall segment before starting the next", () => {
    const { game, engineer } = setup(true);
    engineer.x = 15.5; engineer.y = 5.5;
    game.buildWall(15.5, 5.5, 15.5, 6.5);
    game.update(0.75);
    expect(game.walls[0]?.built).toBe(1);
    expect(engineer.tx).toBeCloseTo(13.5);
    expect(engineer.ty).toBeCloseTo(5.5);
    game.update(0.8);
    expect(engineer.x).toBeCloseTo(13.5);
    expect(game.walls[1]?.built).toBe(0);
    for (let i = 0; i < 80 && game.walls[1]?.built !== 1; i++) game.update(0.05);
    expect(game.walls[1]?.built).toBe(1);
    expect(Math.hypot(engineer.tx - engineer.x, engineer.ty - engineer.y)).toBeCloseTo(2);
    for (let i = 0; i < 40; i++) game.update(0.05);
    expect(engineer.x).toBeCloseTo(engineer.tx);
    expect(engineer.y).toBeCloseTo(engineer.ty);
    expect(Math.hypot(engineer.x - game.core.x, engineer.y - game.core.y)).toBeGreaterThan(7);
  });

  it("lets a player's move order override an automatic return", () => {
    const { game, engineer } = setup();
    engineer.x = 15.5; engineer.y = 5.2;
    game.placeTower(15, 4);
    for (let i = 0; i < 121; i++) game.update(0.05);
    expect(engineer.postBuildMove).toBe(true);
    game.selected = engineer.id;
    game.click(18.5, 5.5);
    expect(engineer.postBuildMove).toBe(false);
    for (let i = 0; i < 80; i++) game.update(0.05);
    expect(engineer.x).toBeCloseTo(18.5);
    expect(engineer.y).toBeCloseTo(5.5);
  });
});