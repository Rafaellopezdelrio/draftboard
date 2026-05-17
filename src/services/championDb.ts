import type { ChampionDb, MetaTier } from "../types/champion";
import { fetchChampions, fetchLatestPatch } from "./dataDragon";
import { fetchCounters } from "./murderBridge";
import { buildMetaList } from "../data/metaTierList";
import { loadAggregatedCounters, loadAggregatedMeta } from "./aggregateRepo";
import { fetchOpggMetaAllRoles } from "./opggMeta";
import {
  fetchDpmMeta,
  type DpmTier,
  type DpmPlatform,
  type DpmTimeframe,
} from "./dpmTierlist";
import { CHAMPION_ROLES } from "../data/championRoles";
import { usePrefsStore } from "../state/prefsStore";

// v16: add dpm.lol per-bracket tier list as a meta source. New "S+" tier
// added to the type union. Bump key so users with v15 cache pick up the new
// shape on first launch.
const STORAGE_KEY = "lol-draft-advisor:championDb:v16";
// Reduced from 12h to 1h. Op.gg data updates daily, so 12h was overkill and
// caused stale-cache headaches when worker logic changes.
const STALE_AFTER_MS = 1000 * 60 * 60 * 1;

export async function loadChampionDb(force = false): Promise<ChampionDb> {
  if (!force) {
    const cached = readCache();
    if (cached && Date.now() - cached.fetchedAt < STALE_AFTER_MS) return cached;
  }
  const patch = await fetchLatestPatch();
  const proPatch = `proplay-${patch}`;
  // Champions first so we can build the name→key map for op.gg
  const champions = await fetchChampions(patch);
  const nameToKey = new Map<string, string>();
  for (const c of Object.values(champions)) {
    nameToKey.set(c.id, c.key); // id is "Aatrox" (data dragon convention)
    nameToKey.set(c.name, c.key); // name is "Aatrox" (display)
    // op.gg sometimes uses different naming; alias common ones
    if (c.id === "MonkeyKing") nameToKey.set("Wukong", c.key);
    if (c.id === "Belveth") nameToKey.set("Bel'Veth", c.key);
    if (c.id === "Chogath") nameToKey.set("Cho'Gath", c.key);
    if (c.id === "Khazix") nameToKey.set("Kha'Zix", c.key);
    if (c.id === "KogMaw") nameToKey.set("Kog'Maw", c.key);
    if (c.id === "Velkoz") nameToKey.set("Vel'Koz", c.key);
    if (c.id === "RekSai") nameToKey.set("Rek'Sai", c.key);
    if (c.id === "DrMundo") nameToKey.set("Dr. Mundo", c.key);
    if (c.id === "JarvanIV") nameToKey.set("Jarvan IV", c.key);
    if (c.id === "MissFortune") nameToKey.set("Miss Fortune", c.key);
    if (c.id === "MasterYi") nameToKey.set("Master Yi", c.key);
    if (c.id === "AurelionSol") nameToKey.set("Aurelion Sol", c.key);
    if (c.id === "TahmKench") nameToKey.set("Tahm Kench", c.key);
    if (c.id === "TwistedFate") nameToKey.set("Twisted Fate", c.key);
    if (c.id === "XinZhao") nameToKey.set("Xin Zhao", c.key);
    if (c.id === "LeeSin") nameToKey.set("Lee Sin", c.key);
    if (c.id === "Leblanc") nameToKey.set("LeBlanc", c.key);
    if (c.id === "Kaisa") nameToKey.set("Kai'Sa", c.key);
    if (c.id === "KSante") nameToKey.set("K'Sante", c.key);
  }

  // Read user pref for source. Default opgg.
  const { source, dpmTier, dpmPlatform, dpmTimeframe } = readMetaSourcePref();

  // dpm.lol is only fetched when actually selected — it's a bracket-specific
  // request that varies per (tier, platform, timeframe) so there's no point
  // pre-warming all sources every refresh.
  const dpmPromise: Promise<MetaTier[]> =
    source === "dpm"
      ? fetchDpmMeta(dpmTier, dpmPlatform, dpmTimeframe, nameToKey)
      : Promise.resolve([]);

  const [fallbackCounters, opggMeta, soloqMeta, proplayMeta, aggCounters, dpmMeta] =
    await Promise.all([
      fetchCounters(patch),
      fetchOpggMetaAllRoles(nameToKey), // op.gg MCP — 170 champs with real games data
      loadAggregatedMeta(patch), // SoloQ Master+ (our own sync)
      loadAggregatedMeta(proPatch), // Pro play (our own sync)
      loadAggregatedCounters(patch),
      dpmPromise,
    ]);

  let meta: MetaTier[];
  let metaSourceUsed: NonNullable<ChampionDb["metaSourceUsed"]>;
  // op.gg is the default and most accurate source (live data, millions of
  // games). Only fall back to user-synced data if they explicitly chose it.
  if (source === "dpm" && dpmMeta.length > 0) {
    meta = dpmMeta;
    metaSourceUsed = "dpm";
  } else if (source === "opgg" && opggMeta.length > 0) {
    meta = opggMeta;
    metaSourceUsed = "opgg";
  } else if (source === "proplay" && proplayMeta.length > 0) {
    meta = proplayMeta;
    metaSourceUsed = "proplay";
  } else if (source === "soloq" && soloqMeta.length > 0) {
    meta = soloqMeta;
    metaSourceUsed = "soloq";
  } else if (source === "blend" && (proplayMeta.length > 0 || soloqMeta.length > 0)) {
    meta = blendMetaSources(proplayMeta, soloqMeta);
    metaSourceUsed = "blend";
  } else if (opggMeta.length > 0) {
    // Fallback to op.gg whenever the user-preferred source returns no data
    // (e.g. they chose proplay but never synced).
    meta = opggMeta;
    metaSourceUsed = "opgg";
  } else if (proplayMeta.length > 0) {
    meta = proplayMeta;
    metaSourceUsed = "proplay";
  } else if (soloqMeta.length > 0) {
    meta = soloqMeta;
    metaSourceUsed = "soloq";
  } else {
    meta = buildMetaList(champions);
    metaSourceUsed = "static";
  }

  // OFF-META FILTER: drop entries where the champion isn't legitimately
  // played in that role (Vayne TOP, Shaco SUPPORT, Yasuo ADC, etc.).
  // Authoritative source: CHAMPION_ROLES hand-curated map.
  // If a champion isn't in CHAMPION_ROLES at all (e.g. brand-new release),
  // we keep all their meta entries — fall back to data.
  const keyToDDId = new Map<string, string>();
  for (const c of Object.values(champions)) keyToDDId.set(c.key, c.id);

  const roleFilteredMeta = meta.filter((m) => {
    const ddId = keyToDDId.get(m.championKey);
    if (!ddId) return true; // unknown — keep
    const allowedRoles = CHAMPION_ROLES[ddId];
    if (!allowedRoles) return true; // not in our map — keep (new champ)
    return allowedRoles.includes(m.role);
  });

  // FASE 3: cross-reference with pro play data. If a champion is S-tier in
  // op.gg's plat+ aggregated data BUT pros never pick them (0 games in
  // LCK/LEC/LCS/LPL), they're a low-elo crutch — demote.
  //
  // Pro data is auto-synced in background via startAutoProSync. On first
  // run it may not be present yet; subsequent loads have it.
  const proKeys = new Set(proplayMeta.map((m) => `${m.championKey}|${m.role}`));
  const proGamesByChamp = new Map<string, number>();
  for (const p of proplayMeta) {
    proGamesByChamp.set(
      p.championKey,
      (proGamesByChamp.get(p.championKey) ?? 0) + (p.pickRate * 1000)
    );
  }

  // Pro-play demotion only applies to the plat+ aggregated sources where
  // low-elo crutches are the main failure mode. When the user explicitly
  // picked dpm.lol's Challenger/Master bracket, the data is already
  // high-elo-coherent and there's no reason to override it with pro presence
  // (some champs are SoloQ kings the pros never touch — Yi, Master Yi mid in
  // Challenger KR — and that's fine).
  const skipProDemotion = source === "dpm";
  const filteredMeta = roleFilteredMeta.map((m) => {
    // Only adjust S-tier picks; S+/A/B/C/D stay as-is. S+ is dpm-only and is
    // already a strong signal we don't want to fight.
    if (m.tier !== "S") return m;
    if (skipProDemotion) return m;
    const hasProPresence = proKeys.has(`${m.championKey}|${m.role}`);
    // If we have pro data AND this champ has 0 presence → demote to A
    if (proplayMeta.length > 0 && !hasProPresence) {
      return { ...m, tier: "A" as const };
    }
    return m;
  });

  // eslint-disable-next-line no-console
  console.log(
    `[meta] ${meta.length} total → ${roleFilteredMeta.length} after off-meta filter` +
      (proplayMeta.length > 0
        ? ` → cross-referenced with ${proplayMeta.length} pro entries (${proGamesByChamp.size} unique champs in pro)`
        : " (no pro data yet — will refine after auto-sync)")
  );

  const counters = aggCounters.length > 0 ? aggCounters : fallbackCounters;
  const db: ChampionDb = {
    patch,
    champions,
    counters,
    meta: filteredMeta,
    metaSourceRequested: source,
    metaSourceUsed,
    metaSourceCounts: {
      opgg: opggMeta.length,
      proplay: proplayMeta.length,
      soloq: soloqMeta.length,
      dpm: dpmMeta.length,
    },
    fetchedAt: Date.now(),
  };
  writeCache(db);
  return db;
}

/**
 * Blend pro-play winrate + SoloQ Master winrate. Pro-play has small sample
 * but high signal; SoloQ has volume. Weighted average favors pro for picks
 * with >5 pro games, otherwise leans SoloQ.
 */
function blendMetaSources(pro: MetaTier[], soloq: MetaTier[]): MetaTier[] {
  const map = new Map<string, MetaTier>();
  for (const s of soloq) map.set(`${s.championKey}|${s.role}`, { ...s });
  for (const p of pro) {
    const k = `${p.championKey}|${p.role}`;
    const existing = map.get(k);
    if (!existing) {
      map.set(k, { ...p });
      continue;
    }
    // Pro-weight scales with sample size: 5+ pro games = 60% weight, 10+ = 75%
    const proGames = (p as MetaTier & { games?: number }).pickRate ?? 0;
    const proWeight = Math.min(0.75, 0.4 + proGames * 5);
    const blended: MetaTier = {
      championKey: p.championKey,
      role: p.role,
      tier: p.tier, // pro-play tier label takes priority
      winRate: p.winRate * proWeight + existing.winRate * (1 - proWeight),
      pickRate: Math.max(p.pickRate, existing.pickRate),
      banRate: Math.max(p.banRate, existing.banRate),
    };
    map.set(k, blended);
  }
  return Array.from(map.values());
}

interface MetaSourcePref {
  source: "opgg" | "proplay" | "soloq" | "blend" | "dpm";
  dpmTier: DpmTier;
  dpmPlatform: DpmPlatform;
  dpmTimeframe: DpmTimeframe;
}

// Read prefs from the zustand store FIRST (works in Tauri, where prefs live
// in SQLite via tauri-plugin-sql), then fall back to localStorage for
// browser/dev mode AND for the very first load before the store has
// hydrated. The early-bootstrap case is why we keep both paths instead of
// only the store — if loadChampionDb runs before usePrefsStore.load()
// completes, the store still contains DEFAULT_PREFS and our selector
// changes would be invisible to the very next refresh.
function readMetaSourcePref(): MetaSourcePref {
  const defaults: MetaSourcePref = {
    source: "opgg",
    dpmTier: "emerald_plus",
    dpmPlatform: "euw1",
    dpmTimeframe: "7days",
  };

  const state = usePrefsStore.getState();
  if (state.loaded) {
    return {
      source: state.prefs.metaSource,
      dpmTier: state.prefs.dpmTier,
      dpmPlatform: state.prefs.dpmPlatform,
      dpmTimeframe: state.prefs.dpmTimeframe,
    };
  }

  try {
    const raw = localStorage.getItem("lol-draft-prefs");
    if (!raw) return defaults;
    const j = JSON.parse(raw);
    return {
      source: j.metaSource ?? defaults.source,
      dpmTier: j.dpmTier ?? defaults.dpmTier,
      dpmPlatform: j.dpmPlatform ?? defaults.dpmPlatform,
      dpmTimeframe: j.dpmTimeframe ?? defaults.dpmTimeframe,
    };
  } catch {
    return defaults;
  }
}

function readCache(): ChampionDb | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ChampionDb) : null;
  } catch {
    return null;
  }
}

function writeCache(db: ChampionDb) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // ignore quota errors; we'll refetch next launch
  }
}
