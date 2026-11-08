import { describe, expect, it } from "vitest";
import { Game, GROUND, setMapSize } from "@/game/engine";

function landedGame(seed = 90) {
  setMapSize(2);
  const game = new Game(seed);
  game.map.fill(GROUND);
  game.land(16, 16);
  game.spawns = [];
  game.nextHorde = 1000;
  game.credits = 1000;
  return game;
}

function cruiserGame() {
  const game = landedGame(91);
  game.phase = "won";
  game.continueToCruiser();
  game.landCruiser(36, 16);
  game.spawns = [];
  game.nextHorde = 1000;
  game.credits = 1000;
  return game;
}

describe("unit selection", () => {
  it("selects the initial team and each newly dropped team, replacing the old selection", () => {
    const game = landedGame();
    const initial = game.infantry[0]!;
    expect(game.selected).toBe(initial.id);

    expect(game.dropTeam(20.5, 16.5)).toBe(true);
    const dropped = game.infantry.at(-1)!;
    expect(game.selected).toBe(dropped.id);
    expect(game.selected).not.toBe(initial.id);
  });

  it("selects newly trained engineers and keeps them selected during simulation", () => {
    const game = landedGame(92);
    expect(game.trainEngineer()).toBe(true);
    const engineer = game.engineers.at(-1)!;
    expect(game.selected).toBe(engineer.id);

    game.update(0.05);
    expect(game.selected).toBe(engineer.id);
  });

  it("selects a new Level 2 squad and then a new engineer team", () => {
    const game = cruiserGame();
    expect(game.dropSquad(45.5, 22.5)).toBe(true);
    const squad = game.infantry.at(-1)!;
    expect(game.selected).toBe(squad.id);

    expect(game.trainEngineer()).toBe(true);
    const engineerTeam = game.engineers.at(-1)!;
    expect(engineerTeam.kind).toBe("team");
    expect(game.selected).toBe(engineerTeam.id);
    expect(game.selected).not.toBe(squad.id);
    game.update(0.05);
    expect(game.selected).toBe(engineerTeam.id);
  });

  it("moves the selected team with a ground click and keeps it selected", () => {
    const game = landedGame(93);
    const team = game.infantry[0]!;
    game.click(20.5, 18.5);

    expect(game.selected).toBe(team.id);
    expect(team.tx).toBe(20.5);
    expect(team.ty).toBe(18.5);
    expect(team.path.at(-1)).toEqual({ x: 20.5, y: 18.5 });
  });

  it("selects engineers by clicking and unselects only through an explicit command", () => {
    const game = landedGame(94);
    const engineer = game.engineers[0]!;
    game.unselect();
    expect(game.selected).toBeNull();

    game.click(engineer.x, engineer.y);
    expect(game.selected).toBe(engineer.id);
    game.click(2.5, 2.5);
    expect(game.selected).toBe(engineer.id);

    const team = game.infantry[0]!;
    game.click(team.x, team.y);
    expect(game.selected).toBe(team.id);
    game.unselect();
    expect(game.selected).toBeNull();
  });
});
