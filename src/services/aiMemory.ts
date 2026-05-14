// Persistent AI memory — stores observations across sessions so the AI
// references past patterns ("you struggled with this 5 games ago").

import { getDb, isTauri } from "../db/client";

export type MemoryKind = "observation" | "advice" | "pattern" | "goal";

export interface AiMemory {
  id?: number;
  kind: MemoryKind;
  category?: string;
  content: string;
  matchId?: string;
  championId?: number;
  createdTsMs: number;
  expiresTsMs?: number;
}

export async function saveMemory(m: Omit<AiMemory, "id" | "createdTsMs"> & { createdTsMs?: number }): Promise<void> {
  if (!isTauri()) return;
  const db = await getDb();
  await db.execute(
    `INSERT INTO ai_memory (kind, category, content, match_id, champion_id, created_ts_ms, expires_ts_ms)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      m.kind,
      m.category ?? null,
      m.content,
      m.matchId ?? null,
      m.championId ?? null,
      m.createdTsMs ?? Date.now(),
      m.expiresTsMs ?? null,
    ]
  );
}

export async function recentMemories(limit = 30): Promise<AiMemory[]> {
  if (!isTauri()) return [];
  const db = await getDb();
  const now = Date.now();
  const rows = await db.select<
    Array<{
      id: number;
      kind: string;
      category: string | null;
      content: string;
      match_id: string | null;
      champion_id: number | null;
      created_ts_ms: number;
      expires_ts_ms: number | null;
    }>
  >(
    `SELECT * FROM ai_memory
     WHERE expires_ts_ms IS NULL OR expires_ts_ms > $1
     ORDER BY created_ts_ms DESC
     LIMIT $2`,
    [now, limit]
  );
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as MemoryKind,
    category: r.category ?? undefined,
    content: r.content,
    matchId: r.match_id ?? undefined,
    championId: r.champion_id ?? undefined,
    createdTsMs: r.created_ts_ms,
    expiresTsMs: r.expires_ts_ms ?? undefined,
  }));
}

export async function memoriesByCategory(category: string, limit = 10): Promise<AiMemory[]> {
  if (!isTauri()) return [];
  const db = await getDb();
  const rows = await db.select<
    Array<{
      id: number;
      kind: string;
      category: string | null;
      content: string;
      created_ts_ms: number;
    }>
  >(
    `SELECT id, kind, category, content, created_ts_ms FROM ai_memory
     WHERE category = $1
     ORDER BY created_ts_ms DESC
     LIMIT $2`,
    [category, limit]
  );
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as MemoryKind,
    category: r.category ?? undefined,
    content: r.content,
    createdTsMs: r.created_ts_ms,
  }));
}

export async function clearOldMemories(): Promise<void> {
  if (!isTauri()) return;
  const db = await getDb();
  // Keep only last 200 memories total
  await db.execute(
    `DELETE FROM ai_memory
     WHERE id NOT IN (SELECT id FROM ai_memory ORDER BY created_ts_ms DESC LIMIT 200)`
  );
}

/**
 * Build a compact context string from recent memories that the AI can prepend
 * to its system prompt — gives it persistent memory across sessions.
 */
export async function buildMemoryContext(maxItems = 8): Promise<string> {
  const memories = await recentMemories(maxItems);
  if (memories.length === 0) return "";
  const lines = memories.map((m) => {
    const prefix =
      m.kind === "pattern"
        ? "PATRÓN"
        : m.kind === "goal"
          ? "OBJETIVO"
          : m.kind === "advice"
            ? "CONSEJO PASADO"
            : "OBSERVACIÓN";
    return `- [${prefix}${m.category ? `/${m.category}` : ""}] ${m.content}`;
  });
  return `\nMEMORIA DE SESIONES PASADAS (refiérete a ella si es relevante):\n${lines.join("\n")}`;
}
