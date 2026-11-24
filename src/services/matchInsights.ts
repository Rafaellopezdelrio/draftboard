// Loads a stored game from Riot and runs the post-game coach on it. Shared by
// the coach screen and the home screen's key points.

import { analyzeMatch, type Insight } from "../engine/coachEngine";
import { getItemMeta, loadItemMeta } from "./itemMeta";
import { getMatchFull, getMatchTimeline, type MatchFull, type MatchTimeline } from "./riotApi";
import { loadSettings } from "./settingsRepo";
import { resolveAccount } from "./accountResolve";
import type { ChampionDb } from "../types/champion";
import { i18n } from "../i18n";

export interface MatchInsights {
  full: MatchFull;
  timeline: MatchTimeline;
  insights: Insight[];
  puuid: string;
}

export async function loadMatchInsights(matchId: string, db: ChampionDb): Promise<MatchInsights> {
  let cfg = await loadSettings();
  // Clean install: nothing saved yet, so read the account from the LoL client.
  if (!cfg?.puuid) cfg = await resolveAccount().catch(() => null);
  if (!cfg || !cfg.puuid) throw new Error(i18n.t("coach.needRiotId"));
  // Games saved from the LoL client are "LCU_<id>"; Riot wants "<PLATFORM>_<id>".
  const riotId = matchId.startsWith("LCU_") ? `${cfg.region.toUpperCase()}_${matchId.slice(4)}` : matchId;
  const [full, timeline] = await Promise.all([
    getMatchFull(cfg, riotId),
    getMatchTimeline(cfg, riotId),
    loadItemMeta(db.patch),
  ]);
  const insights = analyzeMatch({
    match: full,
    timeline,
    myPuuid: cfg.puuid,
    itemTags: (id) => getItemMeta(db.patch, id)?.tags ?? [],
    championName: (id) => db.champions[String(id)]?.name ?? `#${id}`,
  });
  return { full, timeline, insights, puuid: cfg.puuid };
}

/** The few points worth reading first: up to two things to fix (worst first),
 * then what went well, then the rest. A list of only problems discourages. */
export function pickKeyPoints(insights: Insight[], n = 3): Insight[] {
  const problems = insights.filter((i) => i.severity === "bad" || i.severity === "warn");
  const goods = insights.filter((i) => i.severity === "good");
  const picked = [...problems.slice(0, Math.min(2, n)), ...goods];
  for (const i of insights) if (!picked.includes(i)) picked.push(i);
  return picked.slice(0, n);
}
