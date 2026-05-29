import { getDb, isTauri } from "../db/client";
import type { Region, RiotConfig } from "./riotApi";

export interface StoredSettings extends RiotConfig {
  puuid?: string;
}

export async function loadSettings(): Promise<StoredSettings | null> {
  if (!isTauri()) {
    const raw = localStorage.getItem("riot-config");
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StoredSettings;
    } catch {
      // Corrupt blob — treat as no settings rather than throwing into every
      // caller (EnemyScoutPanel, useLcuPersonalData, …) that fire-and-forgets
      // loadSettings(). Same recovery posture as prefsStore.
      return null;
    }
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
  // Sanitize: strip whitespace from text fields. A trailing newline in the
  // API key is the #1 cause of mysterious 401 "invalid key" errors.
  const clean: StoredSettings = {
    ...s,
    apiKey: s.apiKey.trim(),
    riotIdName: s.riotIdName.trim(),
    riotIdTag: s.riotIdTag.trim(),
  };
  if (!isTauri()) {
    localStorage.setItem("riot-config", JSON.stringify(clean));
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
    [clean.apiKey, clean.region, clean.riotIdName, clean.riotIdTag, clean.puuid ?? null]
  );
}
