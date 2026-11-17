export type Role = "TOP" | "JUNGLE" | "MIDDLE" | "BOTTOM" | "UTILITY";

export type Archetype =
  | "engage"
  | "peel"
  | "frontline"
  | "poke"
  | "burst"
  | "sustain-dps"
  | "splitpush"
  | "pick"
  | "wave-clear";

export interface Champion {
  id: string;
  key: string;
  name: string;
  title: string;
  iconUrl: string;
  splashUrl: string;
  tags: string[];
  roles: Role[];
  archetypes: Archetype[];
}

export interface CounterEntry {
  championKey: string;
  vsChampionKey: string;
  role: Role;
  winRate: number;
  sampleSize: number;
}

export interface MetaTier {
  championKey: string;
  role: Role;
  tier: "S+" | "S" | "A" | "B" | "C" | "D";
  winRate: number;
  pickRate: number;
  banRate: number;
  /** Games behind the row, when the source says (op.gg per rank). */
  games?: number;
}

export interface ChampionDb {
  patch: string;
  champions: Record<string, Champion>;
  counters: CounterEntry[];
  meta: MetaTier[];
  fetchedAt: number;
  /**
   * Which source actually ended up populating `meta`. May differ from the
   * user's requested source when their preferred source had no data and the
   * pipeline fell back (e.g. user picked "proplay" but never synced → we
   * fall back to opgg silently). UI uses this to show the truth.
   */
  metaSourceUsed?:
    | "opgg"
    | "proplay"
    | "soloq"
    | "blend"
    | "dpm"
    | "opggRank" // op.gg for one rank bracket (stands in for dpm while it is paused)
    | "static"; // hard-coded list, when even opgg failed
  /** What the user asked for in prefs. */
  metaSourceRequested?: "opgg" | "proplay" | "soloq" | "blend" | "dpm";
  /** Sample-size signals so the UI can flag empty sources. */
  metaSourceCounts?: {
    opgg: number;
    proplay: number;
    soloq: number;
    dpm: number;
  };
}
