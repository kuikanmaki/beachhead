import { beforeEach, describe, expect, it } from "vitest";
import { Game, TEAM_SIZE } from "@/game/engine";
import {
  activeLeaders,
  clearCampaign,
  formatLeaderName,
  loadCampaign,
  rankOf,
  resolveAfterAction,
  type CampaignRoster,
  type UnitRosterEntry,
} from "@/game/roster";

describe("campaign roster", () => {
  beforeEach(() => {
    clearCampaign();
  });

  it("assigns a ranked surname to each new infantry unit", () => {
    const g = new Game(42, { freshCampaign: true });
    expect(g.land(20, 16)).toBe(true);
    const unit = g.infantry[0];
    expect(unit.leaderId).toBeTruthy();
    const leader = g.campaign.soldiers.find((s) => s.id === unit.leaderId);
    expect(leader).toBeTruthy();
    expect(leader!.surname.length).toBeGreaterThan(1);
    expect(rankOf(leader!.rank).order).toBeGreaterThanOrEqual(1);
    expect(formatLeaderName(leader!)).toMatch(/^[A-Za-z]+\. /);
  });

  it("counts fallen soldiers per level and across the campaign", () => {
    const g = new Game(7, { freshCampaign: true });
    g.land(18, 14);
    const unit = g.infantry[0];
    const before = unit.soldiers;
    g.killSoldier(unit);
    expect(unit.soldiers).toBe(before - 1);
    expect(g.campaign.fallenByLevel["1"]).toBe(1);
    expect(g.campaign.totalFallen).toBe(1);
    // Persist on outcome resolution
    g.resolveCampaignOutcome(false);
    expect(loadCampaign().totalFallen).toBe(1);
  });

  it("decorates and may promote survivors after a costly engagement", () => {
    const roster: CampaignRoster = {
      soldiers: [
        {
          id: "ldr-1",
          surname: "Rico",
          rank: "corporal",
          medals: [],
          battles: 0,
          killsCredit: 0,
          fallenOn: [],
          status: "active",
        },
      ],
      fallenByLevel: { "1": 2 },
      totalFallen: 2,
      lastAwards: [],
      nextSoldierSerial: 2,
    };
    const units: UnitRosterEntry[] = [
      {
        unitId: 1,
        leaderId: "ldr-1",
        kind: "team",
        deployedOnLevel: 1,
        startingStrength: TEAM_SIZE,
        currentStrength: 2,
        lossesThisBattle: 2,
        killsThisBattle: 5,
      },
    ];
    const awards = resolveAfterAction(roster, units, 1, true, () => 0); // always promote
    expect(awards.some((a) => a.kind === "medal")).toBe(true);
    expect(awards.some((a) => a.kind === "promotion")).toBe(true);
    expect(roster.soldiers[0]!.medals.length).toBeGreaterThan(0);
    expect(rankOf(roster.soldiers[0]!.rank).order).toBeGreaterThan(rankOf("corporal").order);
    expect(activeLeaders(roster)[0]!.surname).toBe("Rico");
  });

  it("carries the campaign roster into level 2", () => {
    const g = new Game(99, { freshCampaign: true });
    g.land(22, 15);
    const leaderId = g.infantry[0]!.leaderId;
    g.phase = "won";
    g.resolveCampaignOutcome(true);
    expect(g.continueToCruiser()).toBe(true);
    expect(g.level).toBe(2);
    expect(g.campaign.soldiers.some((s) => s.id === leaderId)).toBe(true);
  });
});
