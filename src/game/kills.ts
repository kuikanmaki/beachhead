/** Campaign-run kill counter helpers: combos, milestones, and short-lived callouts. */

export const KILL_COMBO_WINDOW = 1.15;

export type KillBannerKind = "combo" | "milestone";

export type KillBanner = {
  kind: KillBannerKind;
  text: string;
  detail?: string;
  until: number;
  /** Bumps when a stronger callout replaces a weaker one. */
  pulse: number;
};

const MILESTONES: { at: number; text: string; detail: string }[] = [
  { at: 10, text: "First Blood Tally", detail: "10 bugs down" },
  { at: 25, text: "Skirmish Cleared", detail: "25 confirmed" },
  { at: 50, text: "Half Century", detail: "50 bugs killed" },
  { at: 100, text: "Century Kill", detail: "100 bugs killed" },
  { at: 200, text: "Bug Storm Broken", detail: "200 confirmed" },
  { at: 350, text: "Exterminator", detail: "350 bugs killed" },
  { at: 500, text: "Swarm Apocalypse", detail: "500 bugs killed" },
  { at: 750, text: "Dead Zone", detail: "750 confirmed" },
  { at: 1000, text: "Thousandfold", detail: "1000 bugs killed" },
];

export function comboCallout(combo: number): { text: string; detail: string } | null {
  if (combo < 3) return null;
  if (combo < 5) return { text: "Burst Fire", detail: `${combo} in seconds` };
  if (combo < 8) return { text: "Firestorm", detail: `${combo} rapid kills` };
  if (combo < 12) return { text: "Rampage", detail: `${combo} rapid kills` };
  if (combo < 20) return { text: "Extermination", detail: `${combo} rapid kills` };
  return { text: "Annihilation", detail: `${combo} rapid kills` };
}

export function milestoneCallout(total: number): { text: string; detail: string } | null {
  const hit = MILESTONES.find((m) => m.at === total);
  return hit ? { text: hit.text, detail: hit.detail } : null;
}

export function activeKillBanner(banner: KillBanner | null, now: number): KillBanner | null {
  if (!banner || now >= banner.until) return null;
  return banner;
}
