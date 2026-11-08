import { describe, expect, it } from "vitest";
import { FogOfWar } from "@/game/fog";
import { Game, GROUND, HIGH, setMapSize } from "@/game/engine";

describe("fog of war", () => {
  it("keeps the full map visible by default before landing and after troop movement", () => {
    setMapSize(2);
    const game = new Game(6);
    expect(game.fog.stateAt(0, 0)).toBe(2);
    expect(game.fog.stateAt(63, 31)).toBe(2);
    game.map.fill(GROUND);
    game.land(16, 16);
    game.updateFog();
    expect(game.fog.stateAt(63, 31)).toBe(2);
    expect(game.placeTower(60, 28)).toBe(true);
  });
  it("starts completely unexplored and reveals around ground troops", () => {
    const fog = new FogOfWar(12, 12);
    expect(fog.stateAt(6, 6, false)).toBe(0);

    fog.update([{ x: 6, y: 6 }], []);

    expect(fog.stateAt(6, 6, false)).toBe(2);
    expect(fog.stateAt(0, 0, false)).toBe(0);
  });

  it("keeps explored terrain visible but dimmed after troops move away", () => {
    const fog = new FogOfWar(24, 12);
    fog.update([{ x: 3, y: 6 }], []);
    fog.update([{ x: 20, y: 6 }], []);

    expect(fog.stateAt(3, 6, false)).toBe(1);
    expect(fog.stateAt(20, 6, false)).toBe(2);
  });

  it("lets engineers scout and reveals everything when satellite comms are on", () => {
    const fog = new FogOfWar(12, 12);
    fog.update([], [{ x: 4, y: 4 }]);

    expect(fog.stateAt(4, 4, false)).toBe(2);
    expect(fog.stateAt(10, 10, false)).toBe(0);
    expect(fog.stateAt(10, 10, true)).toBe(2);
  });

  it("shows a central drop-scan landing area before landing with satellite comms off", () => {
    setMapSize(2);
    const game = new Game(6);

    expect(game.phase).toBe("landing");
    expect(game.fog.stateAt(32, 16, false)).toBe(2);
    expect(game.fog.stateAt(0, 0, false)).toBe(0);
    expect(game.fog.stateAt(63, 31, false)).toBe(0);
  });

  it("reveals the exact firing radius around completed ground and high-ground MG towers", () => {
    setMapSize(2);
    const game = new Game(9);
    game.map.fill(GROUND);
    game.towers.push({ id: 1, tx: 8, ty: 16, built: 1, hp: 300, cd: 0 });

    game.updateFog();
    expect(game.fog.stateAt(13.9, 16.5, false)).toBe(2); // 5.4 tiles: inside 5.5 range
    expect(game.fog.stateAt(14.1, 16.5, false)).toBe(0); // 5.6 tiles: outside 5.5 range

    game.map[16 * 64 + 8] = HIGH;
    game.updateFog();
    expect(game.fog.stateAt(15.4, 16.5, false)).toBe(2); // 6.9 tiles: inside 7 range
    expect(game.fog.stateAt(15.6, 16.5, false)).toBe(0); // 7.1 tiles: outside 7 range
  });

  it("reveals the landing zone as soon as the first units land", () => {
    setMapSize(2);
    const game = new Game(7);
    let landed = false;
    for (let y = 2; y < 30 && !landed; y++) for (let x = 2; x < 62 && !landed; x++) landed = game.land(x, y);

    expect(landed).toBe(true);
    expect(game.fog.stateAt(game.core.x, game.core.y, false)).toBe(2);
    const farX = game.core.x < 32 ? 63 : 0, farY = game.core.y < 16 ? 31 : 0;
    expect(game.fog.stateAt(farX, farY, false)).toBe(0);
  });
});
