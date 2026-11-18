import { describe, expect, it } from "vitest";
import { CLIMB_CROWD, CLIMB_TIME, COST, Game, GROUND, LEVEL_THREE_KILL_TARGET, NAPALM_COOLDOWN, NAPALM_DELAY, RETREAT_TIME, setMapSize } from "@/game/engine";

function level2() {
  setMapSize(2);
  const g = new Game(70, { freshCampaign: true });
  g.map.fill(GROUND);
  g.land(16, 16);
  g.phase = "won";
  g.continueToCruiser();
  g.landCruiser(36, 16);
  g.spawns = [];
  g.nextHorde = 10000;
  return g;
}
const wall = (g: Game, tx: number, ty: number) => {
  g.walls.push({ id: g.nid++, jobId: -1, tx, ty, x: tx + 0.5, y: ty + 0.5, angle: 0, built: 1, paid: true });
  g.wallGrid[ty * 64 + tx] = 1;
};
const crowd = (g: Game, x: number, y: number, n: number) => {
  for (let i = 0; i < n; i++) g.bugs.push({ x, y, hp: 1e6, max: 1e6, speed: 0, dmg: 0, r: 0.3, kind: 0, bounty: 0 });
};
function level3() {
  const g = level2();
  g.phase = "won";
  expect(g.continueToSiege()).toBe(true);
  expect(g.phase).toBe("siegeReady");
  expect(g.beginSiege()).toBe(true);
  g.nextHorde = 10000;
  g.spawnAcc = -1e9;
  return g;
}

describe("Level 3 wall siege", () => {
  it("continues from Level 2 victory with the same walls and cruiser", () => {
    const g = level2();
    wall(g, 10, 5);
    g.phase = "won";
    g.continueToSiege();
    expect(g.level).toBe(3);
    expect(g.hasCruiser).toBe(true);
    expect(g.walls).toHaveLength(1);
  });

  it("lets a large crowd climb a wall after a short delay", () => {
    const g = level3();
    wall(g, 10, 5);
    crowd(g, 10.5, 4.5, CLIMB_CROWD);
    expect(g.isEnemyBlocked(10, 5)).toBe(true);
    g.updateWallClimb(CLIMB_TIME / 2);
    expect(g.isEnemyBlocked(10, 5)).toBe(true);
    g.updateWallClimb(CLIMB_TIME);
    expect(g.isEnemyBlocked(10, 5)).toBe(false);
  });

  it("does not let a small crowd climb", () => {
    const g = level3();
    wall(g, 10, 5);
    crowd(g, 10.5, 4.5, CLIMB_CROWD - 1);
    g.updateWallClimb(10);
    expect(g.isEnemyBlocked(10, 5)).toBe(true);
  });

  it("keeps Level 2 walls impassable to crowds", () => {
    const g = level2();
    wall(g, 10, 5);
    crowd(g, 10.5, 4.5, 30);
    g.updateWallClimb(10);
    expect(g.isEnemyBlocked(10, 5)).toBe(true);
  });

  it("napalm costs credits, has a cooldown and kills bugs after the bomb run", () => {
    const g = level3();
    g.credits = 1000;
    g.bugs.push({ x: 5, y: 5, hp: 100, max: 100, speed: 0, dmg: 0, r: 0.3, kind: 0, bounty: 0 });
    expect(g.callNapalm(5, 5)).toBe(true);
    expect(g.credits).toBe(1000 - COST.napalm);
    expect(g.callNapalm(5, 5)).toBe(false);
    expect(g.napalmCooldown()).toBeCloseTo(NAPALM_COOLDOWN);
    g.updateNapalm(0);
    expect(g.bugs[0]!.hp).toBe(100);
    g.t += NAPALM_DELAY;
    g.updateNapalm(0.01);
    expect(g.bugs[0]!.hp).toBeLessThanOrEqual(0);
  });

  it("refuses napalm without enough credits", () => {
    const g = level3();
    g.credits = COST.napalm - 1;
    expect(g.callNapalm(5, 5)).toBe(false);
  });

  it("reaching the hidden kill target makes the swarm retreat and wins the level", () => {
    const g = level3();
    crowd(g, 50, 5, 3);
    g.levelKills = LEVEL_THREE_KILL_TARGET;
    g.update(0.05);
    expect(g.retreatStartedAt).not.toBeNull();
    expect(g.phase).toBe("playing");
    for (let i = 0; i < (RETREAT_TIME + 1) / 0.05; i++) g.update(0.05);
    expect(g.phase).toBe("won");
    expect(g.bugs).toHaveLength(0);
  });
});
