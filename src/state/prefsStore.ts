import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { getDb, isTauri } from "../db/client";

// ── At-rest encryption of BYO AI keys (Windows DPAPI) ──
// These pref values are secrets; on disk they're stored as "dpapi:<base64>"
// (encrypted via the dpapi_protect command — only this Windows user on this
// machine can decrypt). In-memory the store always holds plaintext, so every
// consumer stays unchanged. Legacy plaintext rows load as-is and get
// re-encrypted on their next save.
const SECRET_PREF_KEYS = new Set(["groqApiKey", "geminiApiKey", "anthropicApiKey"]);
const DPAPI_PREFIX = "dpapi:";

async function protectSecret(plaintext: string): Promise<string> {
  try {
    const blob = await invoke<string>("dpapi_protect", { plaintext });
    return DPAPI_PREFIX + blob;
  } catch (e) {
    // Fail open on encryption: a persisted plaintext key beats a lost key.
    // eslint-disable-next-line no-console
    console.warn("[prefs] dpapi_protect failed — storing plaintext:", e);
    return plaintext;
  }
}

async function unprotectSecret(stored: string): Promise<string> {
  if (!stored.startsWith(DPAPI_PREFIX)) return stored; // legacy plaintext
  try {
    return await invoke<string>("dpapi_unprotect", {
      ciphertextB64: stored.slice(DPAPI_PREFIX.length),
    });
  } catch (e) {
    // Fail closed on decryption: an undecryptable blob (user profile change,
    // tampering) yields an empty key — the UI simply asks for the key again.
    // eslint-disable-next-line no-console
    console.warn("[prefs] dpapi_unprotect failed — key reset:", e);
    return "";
  }
}

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
  /** Show a button in the build panel to write recommended summoner spells. */
  showSpellImportButton: boolean;
  /** Auto-apply spells on lock-in (mirrors autoApplyRunes for spells). */
  autoApplySpells: boolean;
  /**
   * Auto-push a recommended item set to the LCU on lock-in so it shows
   * up directly in the in-game shop. Non-destructive — Riot keeps the
   * user's other sets, this is just an extra one we add.
   */
  autoApplyItemSet: boolean;
  /**
   * Show the transparent in-game overlay window (corner widget with timer,
   * scores, drake/baron ETAs). Off → only the embedded panel inside the
   * main Draftboard window. ON by default — it's the killer feature.
   */
  showInGameOverlay: boolean;
  /**
   * Last patch the user has acknowledged (dismissed the "patch nuevo"
   * banner). Compared against the live DDragon patch each launch — when
   * different, the banner shows. Empty string = first launch / never seen.
   */
  lastSeenPatch: string;
  notifyOnEnemyHotStreak: boolean;

  // Coach
  coachAfterMatch: boolean;
  coachShowGpi: boolean;

  // Realtime
  liveTimer: boolean;
  liveScoutRefresh: boolean;

  // UI
  compactMode: boolean;

  /** UI locale for the Draftboard interface (Spanish / English). Distinct
   * from `aiCoachLanguage` — that one controls what the AI coach replies
   * in. A user might want Spanish UI + English AI for translation
   * practice, or vice versa. Default: es. */
  uiLocale: "es" | "en";

  /** Auto-update release channel. "stable" = official tagged releases
   * only (slow, vetted). "beta" = pre-release builds opt-in for early
   * testing (faster but rough edges). The updater check at boot reads
   * this and points at a different manifest URL per channel. Default
   * "stable" — beta is opt-in. */
  updateChannel: "stable" | "beta";

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
  /** True once the user has dismissed the "switch to Borderless" warning
   * with "No mostrar más". Suppresses the banner permanently for that user
   * — they've made an informed choice to stay in fullscreen-exclusive. */
  fullscreenWarningAck: boolean;

  /** Unix-ms timestamp when the user accepted the terms-and-privacy gate.
   * `null` = never accepted, gate is shown. Legal requirement for EU
   * distribution (GDPR consent record). */
  termsAcceptedAt: number | null;
  /** Last app version (semver string) we showed the "What's new" modal
   * for. When `__APP_VERSION__` differs from this we surface the
   * changelog once. Null = never seen (typical first install — we
   * suppress the modal so we don't greet brand-new users with a
   * release note dump). */
  lastChangelogVersionShown: string | null;
  /** When true, anonymised crash reports are sent to Sentry. Default
   * `true` — disclosed in TermsGate so it's covered by consent. User can
   * flip this off from Preferences → Privacy at any moment. GDPR Art. 7:
   * consent must be as easy to withdraw as to give. */
  telemetryEnabled: boolean;
  /** Which terms VERSION the user accepted (see `TERMS_VERSION` in
   * config.ts). When we materially change wording — new data sources,
   * new permissions, new disclaimers — we bump the constant and the gate
   * re-prompts. GDPR best practice: each change of substance requires a
   * fresh consent record. */
  termsAcceptedVersion: number | null;

  /** Overlay's manual offset from the LoL window's top-left corner. We
   * anchor the overlay to LoL by default, but if the user drags it, we
   * remember the delta so the next match opens at the same relative spot.
   * Null = first-time placement (defaults to a small padding). */
  overlayOffsetX: number | null;
  overlayOffsetY: number | null;
  /** Whether the overlay should track LoL window movement at all. Off ->
   * overlay stays where the user dragged it, regardless of where LoL is. */
  overlayFollowLol: boolean;

  // Voice
  voiceCoachEnabled: boolean;

  // Accent theme variant. Brand color is mint by default but power users
  // sometimes want a different vibe — we ship 3 curated variants. CSS
  // applies via a data-attribute on <html> so the change is instant and
  // affects every accent-colored element.
  accentTheme: "mint" | "sapphire" | "amber" | "rose";

  // Meta source: where the suggestion engine pulls tier/winrates from.
  //   "opgg"    = live op.gg data (millions of games, broad, default)
  //   "proplay" = LCK/LEC/LCS/LPL games (your own sync, pro-focused)
  //   "soloq"   = Master+ SoloQ (your own sync, high elo)
  //   "blend"   = pro + soloq combined
  //   "dpm"     = dpm.lol bracket-filtered tier list (Iron through Challenger)
  metaSource: "opgg" | "proplay" | "soloq" | "blend" | "dpm";
  proPlayDaysWindow: number; // last N days of pro games to aggregate

  // dpm.lol-specific filters. Only meaningful when metaSource === "dpm".
  // See src/services/dpmTierlist.ts for the full value enums.
  dpmTier:
    | "all" | "iron" | "bronze" | "silver" | "silver_plus" | "gold" | "gold_plus"
    | "platinum" | "platinum_plus" | "emerald" | "emerald_plus" | "diamond"
    | "diamond_plus" | "master" | "master_plus" | "grandmaster" | "challenger";
  dpmPlatform:
    | "euw1" | "kr" | "na1" | "eun1" | "br1" | "la1" | "la2" | "oc1"
    | "tr1" | "ru" | "jp1";
  dpmTimeframe: "7days" | "30days";

  // Riot proxy URL — when set, app routes Riot API calls through this URL
  // instead of api.riotgames.com directly. Lets the user use a hosted proxy
  // that holds a production key, eliminating the need for a personal dev key.
  riotProxyUrl: string;
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

  // Auto-apply runes/spells ON by default — competing apps (Blitz,
  // Mobalytics) ship this on, and users expect "lock-in champion -> my
  // runes are ready". Previously off meant the user had to discover +
  // toggle to get the killer feature.
  autoApplyRunes: true,
  showRuneImportButton: true,
  autoApplyOnHover: false,
  showSpellImportButton: true,
  autoApplySpells: true,
  autoApplyItemSet: true,
  // Overlay OFF por defecto — current Win32 transparent topmost
  // approach has UX issues (click-through edge cases, positioning
  // drift). User can re-enable from PreferencesView. Will polish a
  // v2 overlay in a future tanda.
  showInGameOverlay: false,
  lastSeenPatch: "",
  notifyOnEnemyHotStreak: true,

  coachAfterMatch: true,
  coachShowGpi: true,

  liveTimer: true,
  liveScoutRefresh: true,

  compactMode: false,

  uiLocale: "es",
  updateChannel: "stable",

  aiProvider: "groq",
  groqApiKey: "",
  geminiApiKey: "",
  anthropicApiKey: "",
  aiCoachEnabled: false,
  aiCoachLanguage: "es",

  safeMode: false,
  beginnerMode: false,
  onboardingDone: false,
  fullscreenWarningAck: false,
  termsAcceptedAt: null,
  termsAcceptedVersion: null,
  lastChangelogVersionShown: null,
  telemetryEnabled: true,
  overlayOffsetX: null,
  overlayOffsetY: null,
  overlayFollowLol: true,

  // Voice coach on by default — competing apps ship voice on, and the
  // events are sparse enough (only hot-streak enemy warnings + draft
  // turn announcements) that it stays useful without being noisy. User
  // can mute via Settings if unwanted.
  voiceCoachEnabled: true,
  // Mint default — user's brand color preference (see App.css).
  accentTheme: "mint",

  // Default: dpm.lol — cleaner per-bracket data, user preferred over
  // op.gg's plat+ aggregate. op.gg still works as fallback if synced
  // separately, but new installs start with dpm.
  metaSource: "dpm",
  proPlayDaysWindow: 30,

  // dpm.lol defaults — emerald+ on EUW matches their own UI's default and
  // gives the user a reasonable view immediately on first dpm switch.
  dpmTier: "emerald_plus",
  dpmPlatform: "euw1",
  dpmTimeframe: "7days",

  // Default proxy URL — Draftboard's hosted Cloudflare Worker. New installs
  // get premium mode automatically: no API key needed, the worker holds the
  // production Riot key server-side. Power users can override this in Prefs
  // (e.g. point to their own self-hosted proxy or set "" for direct mode with
  // their own dev key).
  riotProxyUrl:
    "https://draftboard-riot-proxy.rafael-lopez-serrano-99.workers.dev",
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
    // ALWAYS flip `loaded` to true within ~3s, no matter what. The
    // downstream championDb load is gated on `loaded` so a hang here
    // (SQLite not ready, tauri plugin not initialised, anything) would
    // leave the user staring at "Cargando datos de campeones..." forever.
    // Better to boot with DEFAULT_PREFS than to brick the app.
    const timeout = new Promise<Partial<Preferences>>((_, reject) =>
      setTimeout(() => reject(new Error("prefs load timeout 3s")), 3000)
    );
    try {
      const loaded = await Promise.race([loadAll(), timeout]);
      // Migration: existing users with metaSource="opgg" auto-migrate to
      // "dpm" (current default). Op.gg source deprecated for new installs
      // — dpm.lol gives cleaner per-bracket data. Users who explicitly
      // re-select op.gg in Settings stay there (no forced override).
      const migrated = { ...loaded };
      if (migrated.metaSource === "opgg") {
        migrated.metaSource = "dpm";
      }
      set({ prefs: { ...DEFAULT_PREFS, ...migrated }, loaded: true });
      // Persist the migration so the next boot doesn't re-trigger.
      if (loaded.metaSource === "opgg") {
        persistOne("metaSource", "dpm").catch(() => {});
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[prefs] load failed, booting with defaults:", e);
      set({ prefs: DEFAULT_PREFS, loaded: true });
    }
  },
  set: async (key, value) => {
    // Idempotency guard: skip the write + subscriber notify when the
    // value didn't actually change. Avoids:
    //   - Unnecessary disk I/O on rapid toggles (settings checkbox spam)
    //   - Re-render cascades through every component subscribed to prefs
    //   - Spurious persistOne calls during boot when DEFAULT_PREFS is
    //     compared against a loaded value that happens to match.
    // Uses Object.is so NaN === NaN (matters for nullable numeric prefs).
    const current = get().prefs[key];
    if (Object.is(current, value)) return;
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
    if (!raw) return {};
    // Corruption recovery: if the blob is malformed (power loss mid-write,
    // antivirus mangled the file, manual edit), JSON.parse throws and the
    // whole app fails to boot. Catch + warn + reset to defaults so the user
    // can keep using the app instead of being stuck at a blank screen.
    try {
      return JSON.parse(raw) as Partial<Preferences>;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[prefsStore] corrupt localStorage — resetting to defaults", e);
      try {
        localStorage.removeItem("lol-draft-prefs");
      } catch {
        // localStorage write can fail in private mode — ignore.
      }
      return {};
    }
  }
  const db = await getDb();
  const rows = await db.select<Array<{ key: string; value: string }>>(
    "SELECT key, value FROM preferences"
  );
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    try {
      const parsed = JSON.parse(r.value);
      out[r.key] =
        SECRET_PREF_KEYS.has(r.key) && typeof parsed === "string"
          ? await unprotectSecret(parsed)
          : parsed;
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
    // Same corruption-recovery posture as loadAll: if the existing blob
    // can't be parsed, start fresh rather than throwing during a write
    // (which would leave the user unable to persist any pref at all).
    let cur: Record<string, unknown> = {};
    if (raw) {
      try {
        cur = JSON.parse(raw);
      } catch {
        cur = {};
      }
    }
    cur[key as string] = value;
    localStorage.setItem("lol-draft-prefs", JSON.stringify(cur));
    return;
  }
  const db = await getDb();
  const toStore =
    SECRET_PREF_KEYS.has(key as string) && typeof value === "string" && value !== ""
      ? await protectSecret(value)
      : value;
  await db.execute(
    `INSERT INTO preferences (key, value) VALUES ($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, JSON.stringify(toStore)]
  );
}
