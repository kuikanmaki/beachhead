import { describe, expect, it } from "vitest";
import { FogOfWar } from "@/game/fog";
import { Game, setMapSize } from "@/game/engine";

describe("fog of war", () => {
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

  it("reveals the landing zone as soon as the first units land", () => {
    setMapSize(2);
    const game = new Game(7);
    let landed = false;
    for (let y = 2; y < 30 && !landed; y++) for (let x = 2; x < 62 && !landed; x++) landed = game.land(x, y);

    expect(landed).toBe(true);
    expect(game.fog.stateAt(game.core.x, game.core.y, false)).toBe(2);
    expect(game.fog.stateAt(0, 0, false)).toBe(0);
  });
});
