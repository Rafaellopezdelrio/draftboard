import { create } from "zustand";
import { getDb, isTauri } from "../db/client";

export interface Preferences {
  // Draft features
  showSuggestions: boolean;
  showDraftWinrate: boolean;
  showCompAnalysis: boolean;
  showBuildPanel: boolean;
  showEnemyScout: boolean;

  // Engine weighting
  usePersonalStats: boolean;
  useMastery: boolean;
  useMetaTier: boolean;

  // Auto-actions tied to LCU events
  autoApplyRunes: boolean;
  showRuneImportButton: boolean;
  autoApplyOnHover: boolean; // apply when intent shown
  notifyOnEnemyHotStreak: boolean;

  // Coach
  coachAfterMatch: boolean;
  coachShowGpi: boolean;

  // Realtime
  liveTimer: boolean;
  liveScoutRefresh: boolean;

  // UI
  compactMode: boolean;

  // AI Coach
  aiProvider: "groq" | "anthropic" | "gemini";
  groqApiKey: string;
  geminiApiKey: string;
  anthropicApiKey: string;
  aiCoachEnabled: boolean;
  aiCoachLanguage: "es" | "en";

  // Safety + onboarding
  safeMode: boolean;
  beginnerMode: boolean;
  onboardingDone: boolean;

  // Voice
  voiceCoachEnabled: boolean;

  // Meta source: where the suggestion engine pulls tier/winrates from.
  // "proplay" = LCK/LEC/LCS/LPL games, "soloq" = Master+ SoloQ, "blend" = mix.
  metaSource: "proplay" | "soloq" | "blend";
  proPlayDaysWindow: number; // last N days of pro games to aggregate
}

export const DEFAULT_PREFS: Preferences = {
  showSuggestions: true,
  showDraftWinrate: true,
  showCompAnalysis: true,
  showBuildPanel: true,
  showEnemyScout: true,

  usePersonalStats: true,
  useMastery: true,
  useMetaTier: true,

  autoApplyRunes: false,
  showRuneImportButton: true,
  autoApplyOnHover: false,
  notifyOnEnemyHotStreak: true,

  coachAfterMatch: true,
  coachShowGpi: true,

  liveTimer: true,
  liveScoutRefresh: true,

  compactMode: false,

  aiProvider: "groq",
  groqApiKey: "",
  geminiApiKey: "",
  anthropicApiKey: "",
  aiCoachEnabled: false,
  aiCoachLanguage: "es",

  safeMode: false,
  beginnerMode: false,
  onboardingDone: false,

  voiceCoachEnabled: false,

  metaSource: "proplay",
  proPlayDaysWindow: 30,
};

interface PrefsState {
  prefs: Preferences;
  loaded: boolean;
  set: <K extends keyof Preferences>(key: K, value: Preferences[K]) => Promise<void>;
  load: () => Promise<void>;
  reset: () => Promise<void>;
}

export const usePrefsStore = create<PrefsState>((set, get) => ({
  prefs: DEFAULT_PREFS,
  loaded: false,
  load: async () => {
    const loaded = await loadAll();
    set({ prefs: { ...DEFAULT_PREFS, ...loaded }, loaded: true });
  },
  set: async (key, value) => {
    const next = { ...get().prefs, [key]: value };
    set({ prefs: next });
    await persistOne(key, value);
  },
  reset: async () => {
    set({ prefs: DEFAULT_PREFS });
    if (!isTauri()) {
      localStorage.removeItem("lol-draft-prefs");
      return;
    }
    const db = await getDb();
    await db.execute("DELETE FROM preferences");
  },
}));

async function loadAll(): Promise<Partial<Preferences>> {
  if (!isTauri()) {
    const raw = localStorage.getItem("lol-draft-prefs");
    return raw ? (JSON.parse(raw) as Partial<Preferences>) : {};
  }
  const db = await getDb();
  const rows = await db.select<Array<{ key: string; value: string }>>(
    "SELECT key, value FROM preferences"
  );
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    try {
      out[r.key] = JSON.parse(r.value);
    } catch {
      // skip
    }
  }
  return out as Partial<Preferences>;
}

async function persistOne<K extends keyof Preferences>(
  key: K,
  value: Preferences[K]
) {
  if (!isTauri()) {
    const raw = localStorage.getItem("lol-draft-prefs");
    const cur = raw ? JSON.parse(raw) : {};
    cur[key] = value;
    localStorage.setItem("lol-draft-prefs", JSON.stringify(cur));
    return;
  }
  const db = await getDb();
  await db.execute(
    `INSERT INTO preferences (key, value) VALUES ($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, JSON.stringify(value)]
  );
}
