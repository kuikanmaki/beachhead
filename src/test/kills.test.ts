import { describe, expect, it } from "vitest";
import { Game, setMapSize } from "@/game/engine";
import { comboCallout, milestoneCallout } from "@/game/kills";

describe("kill tally", () => {
  it("labels combos and milestones", () => {
    expect(comboCallout(2)).toBeNull();
    expect(comboCallout(3)?.text).toBe("Burst Fire");
    expect(comboCallout(8)?.text).toBe("Rampage");
    expect(milestoneCallout(100)?.text).toBe("Century Kill");
    expect(milestoneCallout(101)).toBeNull();
  });

  it("keeps kills across the Level 1 to Level 2 handoff", () => {
    setMapSize(1.5);
    const game = new Game(7, { freshCampaign: true });
    game.phase = "playing";
    game.level = 1;
    game.t = 10;
    for (let i = 0; i < 12; i++) game.registerKill();
    expect(game.kills).toBe(12);
    expect(game.killBanner?.kind).toBe("milestone");

    game.phase = "won";
    expect(game.continueToCruiser()).toBe(true);
    expect(game.kills).toBe(12);
    expect(game.level).toBe(2);
  });

  it("chains combos inside the time window", () => {
    setMapSize(1.5);
    const game = new Game(11, { freshCampaign: true });
    game.phase = "playing";
    game.t = 5;
    game.registerKill();
    game.registerKill();
    game.registerKill();
    expect(game.killCombo).toBe(3);
    expect(game.killBanner?.kind).toBe("combo");

    game.t = 20;
    game.registerKill();
    expect(game.killCombo).toBe(1);
  });
});
