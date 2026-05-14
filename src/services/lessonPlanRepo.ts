import { getDb, isTauri } from "../db/client";

export interface LessonPlan {
  id?: number;
  createdTsMs: number;
  weakestArea: string | null;
  archetype: string | null;
  planText: string;
  completed: boolean;
}

export async function saveLessonPlan(plan: Omit<LessonPlan, "id">): Promise<number> {
  if (!isTauri()) return 0;
  const db = await getDb();
  const result = await db.execute(
    `INSERT INTO lesson_plans (created_ts_ms, weakest_area, archetype, plan_text, completed)
     VALUES ($1,$2,$3,$4,$5)`,
    [
      plan.createdTsMs,
      plan.weakestArea,
      plan.archetype,
      plan.planText,
      plan.completed ? 1 : 0,
    ]
  );
  return Number(result.lastInsertId ?? 0);
}

export async function recentLessonPlans(limit = 10): Promise<LessonPlan[]> {
  if (!isTauri()) return [];
  const db = await getDb();
  const rows = await db.select<
    Array<{
      id: number;
      created_ts_ms: number;
      weakest_area: string | null;
      archetype: string | null;
      plan_text: string;
      completed: number;
    }>
  >(`SELECT * FROM lesson_plans ORDER BY created_ts_ms DESC LIMIT $1`, [limit]);
  return rows.map((r) => ({
    id: r.id,
    createdTsMs: r.created_ts_ms,
    weakestArea: r.weakest_area,
    archetype: r.archetype,
    planText: r.plan_text,
    completed: r.completed === 1,
  }));
}

export async function markLessonPlanCompleted(id: number): Promise<void> {
  if (!isTauri()) return;
  const db = await getDb();
  await db.execute("UPDATE lesson_plans SET completed = 1 WHERE id = $1", [id]);
}
