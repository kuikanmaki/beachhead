/** Campaign roster: ranks, surnames, decorations, and fallen tracking across levels. */

export type RankId =
  | "private"
  | "corporal"
  | "sergeant"
  | "staff_sergeant"
  | "lieutenant"
  | "captain"
  | "major";

export type MedalId = "bronze_star" | "silver_star" | "valor_cross" | "campaign_ribbon";

export type Rank = {
  id: RankId;
  short: string;
  title: string;
  order: number;
};

export type Medal = {
  id: MedalId;
  name: string;
  abbr: string;
  description: string;
};

export type SoldierRecord = {
  id: string;
  surname: string;
  rank: RankId;
  medals: MedalId[];
  /** Battles survived as a living leader or named trooper. */
  battles: number;
  killsCredit: number;
  /** Levels where this soldier fell. */
  fallenOn: number[];
  status: "active" | "fallen" | "retired";
};

export type UnitRosterEntry = {
  unitId: number;
  leaderId: string;
  kind: "team" | "squad";
  deployedOnLevel: number;
  startingStrength: number;
  currentStrength: number;
  lossesThisBattle: number;
  killsThisBattle: number;
};

export type AfterActionAward = {
  soldierId: string;
  surname: string;
  kind: "medal" | "promotion";
  detail: string;
};

export type LevelCasualtyReport = {
  level: number;
  fallen: number;
  awards: AfterActionAward[];
};

export type CampaignRoster = {
  soldiers: SoldierRecord[];
  fallenByLevel: Record<string, number>;
  totalFallen: number;
  lastAwards: AfterActionAward[];
  nextSoldierSerial: number;
};

export const RANKS: Rank[] = [
  { id: "private", short: "Pvt", title: "Private", order: 0 },
  { id: "corporal", short: "Cpl", title: "Corporal", order: 1 },
  { id: "sergeant", short: "Sgt", title: "Sergeant", order: 2 },
  { id: "staff_sergeant", short: "SSgt", title: "Staff Sergeant", order: 3 },
  { id: "lieutenant", short: "Lt", title: "Lieutenant", order: 4 },
  { id: "captain", short: "Capt", title: "Captain", order: 5 },
  { id: "major", short: "Maj", title: "Major", order: 6 },
];

export const MEDALS: Medal[] = [
  {
    id: "bronze_star",
    name: "Bronze Star",
    abbr: "BS",
    description: "Survived an engagement after taking losses.",
  },
  {
    id: "silver_star",
    name: "Silver Star",
    abbr: "SS",
    description: "Held the line through heavy casualties.",
  },
  {
    id: "valor_cross",
    name: "Valor Cross",
    abbr: "VC",
    description: "Led survivors out of a near-wipe engagement.",
  },
  {
    id: "campaign_ribbon",
    name: "Campaign Ribbon",
    abbr: "CR",
    description: "Advanced with the campaign to a later objective.",
  },
];

const SURNAMES = [
  "Rico", "Jenkins", "Havoc", "Diaz", "Nguyen", "Okafor", "Petrov", "Singh",
  "Walsh", "Brennan", "Sato", "Keller", "Morales", "Ikeda", "Hassan", "Brooks",
  "Calloway", "Voss", "Reyes", "Tanaka", "MacLeod", "Ibarra", "Quincy", "Holt",
  "Fletcher", "Adebayo", "Kowalski", "Mercer", "Duval", "Chen", "Abrams", "Torres",
];

const STORAGE_KEY = "beachhead.campaignRoster.v1";

export function rankOf(id: RankId): Rank {
  return RANKS.find((r) => r.id === id) ?? RANKS[0]!;
}

export function medalOf(id: MedalId): Medal {
  return MEDALS.find((m) => m.id === id)!;
}

export function formatLeaderName(soldier: SoldierRecord): string {
  const rank = rankOf(soldier.rank);
  return `${rank.short}. ${soldier.surname}`;
}

export function emptyCampaign(): CampaignRoster {
  return {
    soldiers: [],
    fallenByLevel: {},
    totalFallen: 0,
    lastAwards: [],
    nextSoldierSerial: 1,
  };
}

export function loadCampaign(): CampaignRoster {
  if (typeof window === "undefined") return emptyCampaign();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyCampaign();
    const parsed = JSON.parse(raw) as CampaignRoster;
    if (!parsed?.soldiers || !Array.isArray(parsed.soldiers)) return emptyCampaign();
    return {
      ...emptyCampaign(),
      ...parsed,
      fallenByLevel: parsed.fallenByLevel ?? {},
      lastAwards: parsed.lastAwards ?? [],
    };
  } catch {
    return emptyCampaign();
  }
}

export function saveCampaign(roster: CampaignRoster) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(roster));
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearCampaign() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Deterministic pick that does not consume the combat simulation RNG. */
function nextSurname(roster: CampaignRoster, serial: number): string {
  const used = new Set(roster.soldiers.filter((s) => s.status === "active").map((s) => s.surname));
  const free = SURNAMES.filter((n) => !used.has(n));
  const pool = free.length ? free : SURNAMES;
  return pool[serial % pool.length]!;
}

function startingRank(kind: "team" | "squad"): RankId {
  return kind === "squad" ? "sergeant" : "corporal";
}

/** Mint a named leader for a newly deployed infantry unit. */
export function assignLeader(
  roster: CampaignRoster,
  kind: "team" | "squad",
): SoldierRecord {
  const serial = roster.nextSoldierSerial++;
  const soldier: SoldierRecord = {
    id: `ldr-${serial}`,
    surname: nextSurname(roster, serial),
    rank: startingRank(kind),
    medals: [],
    battles: 0,
    killsCredit: 0,
    fallenOn: [],
    status: "active",
  };
  roster.soldiers.push(soldier);
  saveCampaign(roster);
  return soldier;
}

export function recordFallen(roster: CampaignRoster, level: number, count = 1) {
  const key = String(level);
  roster.fallenByLevel[key] = (roster.fallenByLevel[key] ?? 0) + count;
  roster.totalFallen += count;
}

/**
 * After a battle (won or lost), decorate / promote leaders of units that took losses but survived.
 * Also marks wiped leaders as fallen.
 */
export function resolveAfterAction(
  roster: CampaignRoster,
  units: UnitRosterEntry[],
  level: number,
  victory: boolean,
  rand: () => number,
): AfterActionAward[] {
  const awards: AfterActionAward[] = [];

  for (const unit of units) {
    const leader = roster.soldiers.find((s) => s.id === unit.leaderId);
    if (!leader) continue;

    if (unit.currentStrength <= 0) {
      if (leader.status === "active") {
        leader.status = "fallen";
        leader.fallenOn.push(level);
      }
      continue;
    }

    leader.battles += 1;
    leader.killsCredit += unit.killsThisBattle;

    const lossRatio = unit.lossesThisBattle / Math.max(1, unit.startingStrength);
    const survivedHeavy = unit.lossesThisBattle > 0 && unit.currentStrength > 0;

    if (survivedHeavy) {
      let medal: MedalId | null = null;
      if (lossRatio >= 0.6 && unit.currentStrength <= 3) medal = "valor_cross";
      else if (lossRatio >= 0.35) medal = "silver_star";
      else medal = "bronze_star";

      if (medal && !leader.medals.includes(medal)) {
        leader.medals.push(medal);
        awards.push({
          soldierId: leader.id,
          surname: leader.surname,
          kind: "medal",
          detail: `${formatLeaderName(leader)} awarded the ${medalOf(medal).name}`,
        });
      }

      // Promotion chance rises with losses endured and existing decorations.
      const promoteChance = 0.35 + lossRatio * 0.45 + leader.medals.length * 0.05;
      if (rand() < promoteChance) {
        const next = promote(leader.rank);
        if (next !== leader.rank) {
          leader.rank = next;
          awards.push({
            soldierId: leader.id,
            surname: leader.surname,
            kind: "promotion",
            detail: `${formatLeaderName({ ...leader, rank: next })} promoted to ${rankOf(next).title}`,
          });
        }
      }
    } else if (victory && unit.lossesThisBattle === 0 && level >= 1) {
      // Clean victory still earns a campaign ribbon once.
      if (!leader.medals.includes("campaign_ribbon")) {
        leader.medals.push("campaign_ribbon");
        awards.push({
          soldierId: leader.id,
          surname: leader.surname,
          kind: "medal",
          detail: `${formatLeaderName(leader)} awarded the ${medalOf("campaign_ribbon").name}`,
        });
      }
    }
  }

  if (victory) {
    for (const unit of units) {
      if (unit.currentStrength <= 0) continue;
      const leader = roster.soldiers.find((s) => s.id === unit.leaderId);
      if (!leader || leader.medals.includes("campaign_ribbon")) continue;
      // Level completion ribbon for survivors who did not already get one above.
      if (unit.lossesThisBattle > 0) {
        leader.medals.push("campaign_ribbon");
        awards.push({
          soldierId: leader.id,
          surname: leader.surname,
          kind: "medal",
          detail: `${formatLeaderName(leader)} awarded the ${medalOf("campaign_ribbon").name}`,
        });
      }
    }
  }

  roster.lastAwards = awards;
  saveCampaign(roster);
  return awards;
}

function promote(rank: RankId): RankId {
  const order = rankOf(rank).order;
  const next = RANKS.find((r) => r.order === order + 1);
  return next?.id ?? rank;
}

export function activeLeaders(roster: CampaignRoster): SoldierRecord[] {
  return roster.soldiers
    .filter((s) => s.status === "active")
    .sort((a, b) => rankOf(b.rank).order - rankOf(a.rank).order || a.surname.localeCompare(b.surname));
}

export function fallenLeaders(roster: CampaignRoster): SoldierRecord[] {
  return roster.soldiers
    .filter((s) => s.status === "fallen")
    .sort((a, b) => (b.fallenOn[0] ?? 0) - (a.fallenOn[0] ?? 0) || a.surname.localeCompare(b.surname));
}
