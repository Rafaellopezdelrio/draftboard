// A clean install has no saved Riot account: the riot_config row is only
// written when the user presses save in Settings. These helpers let features
// work anyway by reading the account from the LoL client and asking Riot
// (through Draftboard's server) for the matching puuid.

import { getCurrentSummoner } from "./lcuService";
import { getAccount, getRiotProxyUrl, type Region } from "./riotApi";
import { loadSettings, saveSettings, type StoredSettings } from "./settingsRepo";

const CLIENT_REGION: Record<string, Region> = {
  euw: "euw1", euw1: "euw1",
  eune: "eun1", eun1: "eun1",
  na: "na1", na1: "na1",
  kr: "kr",
  br: "br1", br1: "br1",
  lan: "la1", la1: "la1",
  las: "la2", la2: "la2",
  oce: "oc1", oc1: "oc1",
  tr: "tr1", tr1: "tr1",
  ru: "ru",
  jp: "jp1", jp1: "jp1",
};

/** The LoL client reports "EUW", "NA", "LA1"…; map it to a Riot platform. */
export function regionFromClient(raw: string | undefined | null): Region | null {
  const v = raw?.trim().toLowerCase();
  return v ? (CLIENT_REGION[v] ?? null) : null;
}

/**
 * Saved settings, or a usable default for lookups that don't need the user's
 * own account (scouting rivals, searching a player): the client's region, with
 * EUW as the last resort.
 */
export async function settingsOrDefault(): Promise<StoredSettings> {
  const saved = await loadSettings();
  if (saved) return saved;
  const me = await getCurrentSummoner().catch(() => null);
  return { apiKey: "", region: regionFromClient(me?.region) ?? "euw1", riotIdName: "", riotIdTag: "" };
}

const sameText = (a: string | undefined, b: string | undefined) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The account logged into the LoL client is the app's account: log into a
 * smurf and the app switches to it (its games are stored apart, see
 * matchRepo). Returns the settings to use. Unchanged when the client is
 * closed, it is the same account, or Riot can't be asked right now.
 */
export async function followClientAccount(): Promise<StoredSettings | null> {
  const saved = await loadSettings();
  const me = await getCurrentSummoner().catch(() => null);
  const region = regionFromClient(me?.region);
  if (!me?.gameName || !me.tagLine || !region) return saved;
  if (
    saved?.puuid &&
    sameText(saved.riotIdName, me.gameName) &&
    sameText(saved.riotIdTag, me.tagLine) &&
    saved.region === region
  )
    return saved;
  if (!saved?.apiKey && !getRiotProxyUrl()) return saved;
  const next = { apiKey: saved?.apiKey ?? "", region, riotIdName: me.gameName, riotIdTag: me.tagLine };
  try {
    const account = await getAccount(next);
    const full = { ...next, puuid: account.puuid };
    await saveSettings(full);
    return full;
  } catch {
    return saved;
  }
}

let inFlight: Promise<StoredSettings | null> | null = null;

/**
 * Settings with a Riot-format puuid. When none is saved yet, reads the account
 * from the LoL client, resolves it with Riot and saves it. Returns null when
 * that isn't possible right now (client closed, no server, unknown region).
 * The client's own puuid is never stored: it is a different format.
 */
export function resolveAccount(): Promise<StoredSettings | null> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const cfg = await loadSettings();
    if (cfg?.puuid) return cfg;
    if (!cfg?.apiKey && !getRiotProxyUrl()) return null;
    const me = await getCurrentSummoner().catch(() => null);
    const name = cfg?.riotIdName || me?.gameName;
    const tag = cfg?.riotIdTag || me?.tagLine;
    const region = (cfg?.riotIdName ? cfg.region : null) ?? regionFromClient(me?.region) ?? cfg?.region;
    if (!name || !tag || !region) return null;
    const next = { apiKey: cfg?.apiKey ?? "", region, riotIdName: name, riotIdTag: tag };
    try {
      const account = await getAccount(next);
      const full = { ...next, puuid: account.puuid };
      await saveSettings(full);
      return full;
    } catch {
      return null;
    }
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}
