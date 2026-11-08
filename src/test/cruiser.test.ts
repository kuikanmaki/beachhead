import { describe, expect, it } from "vitest";
import { CRUISER_HP, Game, GROUND, HOLD_NEEDED, ROCK, WIN_AFTER, setMapSize } from "@/game/engine";

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
    const platoons = game.platoons, engineers = game.engineers, towers = game.towers;

    expect(game.continueToCruiser()).toBe(false);
    game.phase = "won";
    expect(game.continueToCruiser()).toBe(true);
    expect(game.level).toBe(2);
    expect(game.phase).toBe("shipLanding");
    expect(game.platoons).toBe(platoons);
    expect(game.engineers).toBe(engineers);
    expect(game.towers).toBe(towers);
    expect(game.credits).toBe(345);

    expect(game.landCruiser(36, 16)).toBe(true);
    expect(game.hasCruiser).toBe(true);
    expect(game.phase).toBe("playing");
    expect(game.core.max).toBe(CRUISER_HP);
    expect(game.platoons).toBe(platoons);
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

  it("produces every new platoon and engineer at the cruiser before moving to the rally point", () => {
    const game = gameWithCruiser();
    game.credits = 1000;

    expect(game.dropPlatoon(45.5, 22.5)).toBe(true);
    const platoon = game.platoons.at(-1)!;
    expect(platoon.x).toBe(game.core.x);
    expect(platoon.y).toBe(game.core.y);
    expect(platoon.tx).toBe(45.5);
    expect(platoon.ty).toBe(22.5);
    expect(platoon.path.length).toBeGreaterThan(0);

    expect(game.trainEngineer()).toBe(true);
    const engineer = game.engineers.at(-1)!;
    expect(engineer.x).toBe(game.core.x);
    expect(engineer.y).toBe(game.core.y);
  });

  it("increases both horde volume and enemy strength in the second stage", () => {
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
    expect(second.bugs.length).toBeGreaterThan(first.bugs.length);

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
