import { getDb, isTauri } from "../db/client";
import type { Region, RiotConfig } from "./riotApi";

export interface StoredSettings extends RiotConfig {
  puuid?: string;
}

export async function loadSettings(): Promise<StoredSettings | null> {
  if (!isTauri()) {
    const raw = localStorage.getItem("riot-config");
    return raw ? (JSON.parse(raw) as StoredSettings) : null;
  }
  const db = await getDb();
  const rows = await db.select<
    Array<{
      api_key: string;
      region: string;
      riot_id_name: string;
      riot_id_tag: string;
      puuid: string | null;
    }>
  >("SELECT api_key, region, riot_id_name, riot_id_tag, puuid FROM riot_config WHERE id = 1");
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    apiKey: r.api_key,
    region: r.region as Region,
    riotIdName: r.riot_id_name,
    riotIdTag: r.riot_id_tag,
    puuid: r.puuid ?? undefined,
  };
}

export async function saveSettings(s: StoredSettings): Promise<void> {
  if (!isTauri()) {
    localStorage.setItem("riot-config", JSON.stringify(s));
    return;
  }
  const db = await getDb();
  await db.execute(
    `INSERT INTO riot_config (id, api_key, region, riot_id_name, riot_id_tag, puuid)
     VALUES (1, $1, $2, $3, $4, $5)
     ON CONFLICT(id) DO UPDATE SET
       api_key = excluded.api_key,
       region = excluded.region,
       riot_id_name = excluded.riot_id_name,
       riot_id_tag = excluded.riot_id_tag,
       puuid = excluded.puuid`,
    [s.apiKey, s.region, s.riotIdName, s.riotIdTag, s.puuid ?? null]
  );
}
