import { describe, expect, it } from "vitest";
import { COST, Game, GROUND, infantryFormation, SQUAD_FIRE_TEAMS, SQUAD_SIZE, TEAM_SIZE, setMapSize } from "@/game/engine";

function landedGame(seed = 40) {
  setMapSize(2);
  const game = new Game(seed);
  game.map.fill(GROUND);
  game.land(16, 16);
  return game;
}

function cruiserGame() {
  const game = landedGame(41);
  game.phase = "won";
  game.continueToCruiser();
  game.landCruiser(36, 16);
  return game;
}

describe("infantry organisation", () => {
  it("lands a four-person team in Level 1", () => {
    const game = landedGame();
    expect(game.infantry).toHaveLength(1);
    expect(game.infantry[0]!.kind).toBe("team");
    expect(game.infantry[0]!.fireTeams).toBe(1);
    expect(game.infantry[0]!.soldiers).toBe(TEAM_SIZE);
    expect(TEAM_SIZE).toBe(4);
  });

  it("replaces team deployment with a thirteen-person squad in Level 2", () => {
    const game = cruiserGame();
    game.credits = 1000;

    expect(game.dropTeam(45.5, 22.5)).toBe(false);
    expect(game.dropInfantry(45.5, 22.5)).toBe(true);
    const squad = game.infantry.at(-1)!;
    expect(squad.kind).toBe("squad");
    expect(squad.fireTeams).toBe(SQUAD_FIRE_TEAMS);
    expect(squad.soldiers).toBe(SQUAD_SIZE);
    expect(SQUAD_SIZE).toBe(13);
    expect(game.credits).toBe(1000 - COST.squad);
  });

  it("does not allow squad deployment before the cruiser arrives", () => {
    const game = landedGame(42);
    game.credits = 1000;
    expect(game.dropSquad(20.5, 20.5)).toBe(false);
    expect(game.infantry).toHaveLength(1);
  });

  it("forms three close four-person teams plus one leader under a single squad command", () => {
    const game = cruiserGame();
    game.credits = 1000;
    game.dropSquad(45.5, 22.5);
    const squad = game.infantry.at(-1)!;
    const formation = infantryFormation(squad.kind);

    expect(formation).toHaveLength(13);
    for (const fireTeam of [0, 1, 2]) expect(formation.filter((slot) => slot.fireTeam === fireTeam)).toHaveLength(4);
    expect(formation.filter((slot) => slot.fireTeam === null)).toHaveLength(1);
    for (const slot of formation) expect(Math.hypot(slot.x, slot.y)).toBeLessThan(1.5);

    expect(game.commandInfantry(squad, 40.5, 22.5)).toBe(true);
    expect(squad.tx).toBe(40.5);
    expect(squad.ty).toBe(22.5);
    expect(game.selected).toBe(squad.id);
    expect(game.infantry.filter((unit) => unit.id === squad.id)).toHaveLength(1);
  });
});
