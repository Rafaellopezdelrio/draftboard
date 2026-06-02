// Persistent leak memory — feeds the cross-game #1 leak (from leakEngine) into
// the AI's long-term memory so the coach references it across sessions and
// notices when it CHANGES ("your main leak shifted from deaths to vision").
// This continuity is our identity: nobody else ships a personal AI coach that
// remembers your weaknesses over time.

import { saveMemory, memoriesByCategory } from "./aiMemory";
import type { LeakReport } from "../engine/leakEngine";

const CATEGORY = "leak";

export interface LeakMemoryUpdate {
  key: string;
  content: string;
  changed: boolean;
  /** Human note when the top leak changed vs last session, else null. */
  progress: string | null;
  /** Whether this should be persisted (new or changed — never re-save same). */
  shouldSave: boolean;
}

/** Pure: derive the memory line + change detection from a report + the last
 *  stored leak memory content. The `[key]` suffix is machine-parseable so we
 *  can diff sessions without a dedicated column. */
export function buildLeakMemory(
  report: LeakReport,
  prevContent: string | null
): LeakMemoryUpdate {
  const key = report.macro ? "macro" : report.topLeak.key;
  const label = report.macro ? "macro/draft" : report.topLeak.label;
  const detail = report.macro ? report.headline : report.topLeak.insight;
  const content = `Fuga principal: ${label} — ${detail} [${key}]`;

  const prevKey = prevContent
    ? prevContent.match(/\[(\w+)\]\s*$/)?.[1] ?? null
    : null;
  const changed = prevKey !== null && prevKey !== key;
  const progress = changed ? `Tu fuga principal cambió: ${prevKey} → ${key}.` : null;
  const shouldSave = prevKey === null || changed;

  return { key, content, changed, progress, shouldSave };
}

/** Persist the current #1 leak (only when new or changed) and return a progress
 *  note if it shifted since last time. Best-effort — never throws into the UI. */
export async function recordLeak(report: LeakReport): Promise<string | null> {
  try {
    const prev = await memoriesByCategory(CATEGORY, 1);
    const update = buildLeakMemory(report, prev[0]?.content ?? null);
    if (update.shouldSave) {
      await saveMemory({ kind: "pattern", category: CATEGORY, content: update.content });
    }
    return update.progress;
  } catch {
    return null;
  }
}
