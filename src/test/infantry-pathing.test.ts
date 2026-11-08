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

  it.each(["engineer", "team"] as const)("routes a selected %s around rock using infantry movement and stops at the destination", (kind) => {
    setMapSize(2);
    const game = new Game(11);
    game.map.fill(GROUND);
    for (let y = 0; y < 32; y++) if (y !== 20) game.map[y * 64 + 10] = ROCK;
    game.phase = "playing"; game.spawns = []; game.nextHorde = 10000;
    const engineer = game.newEngineer(kind);
    engineer.x = 5.5; engineer.y = 5.5;
    game.engineers.push(engineer); game.selected = engineer.id;
    game.click(15.5, 5.5);
    expect(engineer.path.some((waypoint) => waypoint.y > 15)).toBe(true);
    for (let i = 0; i < 400; i++) {
      game.update(0.05);
      expect(game.at(Math.floor(engineer.x), Math.floor(engineer.y))).not.toBe(ROCK);
    }
    expect(engineer.x).toBeCloseTo(15.5, 5);
    expect(engineer.y).toBeCloseTo(5.5, 5);
    game.update(1);
    expect(engineer.x).toBeCloseTo(15.5, 5);
  });

  it.each(["engineer", "team"] as const)("rejects unreachable and rock destinations for a selected %s", (kind) => {
    setMapSize(2);
    const game = new Game(12);
    game.map.fill(GROUND);
    for (let y = 0; y < 32; y++) game.map[y * 64 + 10] = ROCK;
    const engineer = game.newEngineer(kind);
    engineer.x = 5.5; engineer.y = 5.5;
    game.engineers.push(engineer); game.selected = engineer.id;
    game.click(15.5, 5.5);
    expect(engineer.path).toHaveLength(0);
    expect(engineer.manualMove).toBe(false);
    game.click(10.5, 5.5);
    expect(engineer.path).toHaveLength(0);
  });

  it.each(["tower", "wall"] as const)("routes automatic %s construction around rock", (construction) => {
    setMapSize(2);
    const game = new Game(11);
    game.map.fill(GROUND);
    game.land(5, 5);
    for (let y = 0; y < 32; y++) if (y !== 20) game.map[y * 64 + 10] = ROCK;
    game.spawns = []; game.nextHorde = 10000; game.credits = 1000;
    const engineer = game.engineers[0];
    if (!engineer) throw new Error("Missing engineer");
    if (construction === "wall") {
      game.level = 2; game.hasCruiser = true; engineer.kind = "team"; engineer.members = 4;
      game.buildWall(15.5, 5.5, 15.5, 5.5);
    } else game.placeTower(15, 5);
    let crossedGap = false;
    for (let i = 0; i < 650; i++) {
      game.update(0.05);
      expect(game.at(Math.floor(engineer.x), Math.floor(engineer.y))).not.toBe(ROCK);
      crossedGap ||= Math.floor(engineer.x) === 10 && Math.floor(engineer.y) === 20;
    }
    expect(crossedGap).toBe(true);
    expect(construction === "wall" ? game.walls[0]?.built : game.towers[0]?.built).toBe(1);
  });
});
