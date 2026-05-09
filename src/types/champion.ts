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
  tier: "S" | "A" | "B" | "C" | "D";
  winRate: number;
  pickRate: number;
  banRate: number;
}

export interface ChampionDb {
  patch: string;
  champions: Record<string, Champion>;
  counters: CounterEntry[];
  meta: MetaTier[];
  fetchedAt: number;
}
