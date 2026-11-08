import { describe, expect, it } from "vitest";
import { Game, GROUND, ROCK, setMapSize } from "@/game/engine";

describe("infantry pathing", () => {
  it("routes around a sheer rock wall instead of walking straight through it", () => {
    setMapSize(2);
    const game = new Game(11);
    game.map.fill(GROUND);
    for (let y = 0; y < 32; y++) if (y !== 20) game.map[y * 64 + 10] = ROCK;
    game.phase = "playing";
    const team = game.newInfantry(5.5, 5.5);
    team.x = 5.5; team.y = 5.5;
    game.infantry.push(team);

    expect(game.commandInfantry(team, 15.5, 5.5)).toBe(true);
    expect(team.path.some((waypoint) => waypoint.y > 15)).toBe(true);

    for (let i = 0; i < 400; i++) {
      game.update(0.05);
      expect(game.at(Math.floor(team.x), Math.floor(team.y))).not.toBe(ROCK);
    }
    expect(team.x).toBeCloseTo(15.5, 5);
    expect(team.y).toBeCloseTo(5.5, 5);
  });

  it("rejects a destination sealed off by rock", () => {
    setMapSize(2);
    const game = new Game(12);
    game.map.fill(GROUND);
    game.core.x = 10.5; game.core.y = 10.5;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (dx || dy) game.map[(10 + dy) * 64 + 10 + dx] = ROCK;
    }
    const team = game.newInfantry(game.core.x, game.core.y);
    team.path = [];
    expect(game.commandInfantry(team, game.core.x + 5, game.core.y)).toBe(false);
    expect(team.path).toHaveLength(0);
  });
});
