import { describe, expect, it } from "vitest";
import { Game, GROUND, ROCK, setMapSize } from "@/game/engine";

describe("infantry pathing", () => {
  it("routes around a sheer rock wall instead of walking straight through it", () => {
    setMapSize(2);
    const game = new Game(11);
    game.map.fill(GROUND);
    for (let y = 0; y < 32; y++) if (y !== 20) game.map[y * 64 + 10] = ROCK;
    game.phase = "playing";
    const platoon = game.newPlatoon(5.5, 5.5);
    platoon.x = 5.5; platoon.y = 5.5;
    game.platoons.push(platoon);

    expect(game.commandPlatoon(platoon, 15.5, 5.5)).toBe(true);
    expect(platoon.path.some((waypoint) => waypoint.y > 15)).toBe(true);

    for (let i = 0; i < 400; i++) {
      game.update(0.05);
      expect(game.at(Math.floor(platoon.x), Math.floor(platoon.y))).not.toBe(ROCK);
    }
    expect(platoon.x).toBeCloseTo(15.5, 5);
    expect(platoon.y).toBeCloseTo(5.5, 5);
  });

  it("rejects a destination sealed off by rock", () => {
    setMapSize(1);
    const game = new Game(12);
    game.map.fill(GROUND);
    const startX = Math.floor(game.core.x), startY = Math.floor(game.core.y);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      game.map[(startY + dy) * 64 + startX + dx] = ROCK;
    }
    const platoon = game.newPlatoon(game.core.x, game.core.y);
    expect(game.commandPlatoon(platoon, game.core.x + 5, game.core.y)).toBe(false);
    expect(platoon.path).toHaveLength(0);
  });
});
