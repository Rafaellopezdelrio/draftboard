// One buy order out of two sources: the matchup build (what works against my
// lane opponent) and the comp adaptations (what the whole enemy team calls
// for). Early buys follow the lane — that is who you face first; boots and
// the later core slots give way to the team, because games are won as five.

import type { BuildAdaptation } from "./adaptiveBuildEngine";
import type { MatchupBuild } from "../services/opggMatchupBuild";

export type PlanSlot = "start" | "first" | "boots" | "second" | "third";

export interface PlanStep {
  slot: PlanSlot;
  ids: number[];
  /** "lane": from the matchup build. "team": swapped in for the enemy comp. */
  source: "lane" | "team";
  /** Team steps only: the adaptation's own reason text. */
  reason?: string;
}

export interface MatchupPlan {
  steps: PlanStep[];
  /** Adaptations that did not take a slot — still worth knowing. */
  situational: BuildAdaptation[];
}

/** Finished boots (tier 2). Adaptations name them like any other item. */
const BOOT_IDS = new Set([3006, 3009, 3010, 3020, 3047, 3111, 3117, 3158]);

export function buildMatchupPlan(build: MatchupBuild, adaptations: BuildAdaptation[]): MatchupPlan {
  const steps: PlanStep[] = [];
  const used = new Set<BuildAdaptation>();
  const starter = build.starterItems[0];
  if (starter) steps.push({ slot: "start", ids: starter.ids, source: "lane" });

  const core = build.coreItems[0]?.ids ?? [];
  if (core[0]) steps.push({ slot: "first", ids: [core[0]], source: "lane" });

  // Boots: the comp decides when it asks for a specific pair.
  const teamBoots =
    adaptations.find((a) => BOOT_IDS.has(a.itemId) && a.priority === "core") ??
    adaptations.find((a) => BOOT_IDS.has(a.itemId));
  const laneBoots = build.boots[0];
  if (teamBoots) {
    used.add(teamBoots);
    const same = laneBoots?.ids[0] === teamBoots.itemId;
    steps.push({
      slot: "boots",
      ids: [teamBoots.itemId],
      source: same ? "lane" : "team",
      ...(same ? {} : { reason: teamBoots.reason }),
    });
  } else if (laneBoots) {
    steps.push({ slot: "boots", ids: laneBoots.ids.slice(0, 1), source: "lane" });
  }

  // Later core slots: "core" adaptations the lane build lacks take over,
  // third slot first — the first item never moves.
  const later: PlanStep[] = [];
  if (core[1]) later.push({ slot: "second", ids: [core[1]], source: "lane" });
  if (core[2]) later.push({ slot: "third", ids: [core[2]], source: "lane" });
  const mustBuy = adaptations.filter(
    (a) => a.priority === "core" && !BOOT_IDS.has(a.itemId) && !core.includes(a.itemId)
  );
  for (let i = later.length - 1, n = 0; i >= 0 && n < mustBuy.length; i--, n++) {
    const a = mustBuy[n];
    used.add(a);
    later[i] = { slot: later[i].slot, ids: [a.itemId], source: "team", reason: a.reason };
  }
  steps.push(...later);

  // Already in the lane build = already covered, not a leftover.
  for (const a of adaptations) if (core.includes(a.itemId)) used.add(a);
  return { steps, situational: adaptations.filter((a) => !used.has(a)) };
}
