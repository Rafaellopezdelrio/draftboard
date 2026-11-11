// Integration tests for the App shell. Every heavy child panel, lazy view and
// data hook is stubbed at module level; what stays real is the shell itself
// plus the stores (draftStore, prefsStore), TermsGate, HeaderMenu, the
// boundaries, appCommands and the keyboard-shortcut hooks. Stubs record their
// last props in `h.props` so tests can assert the wiring App passes down.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({
  props: {} as Record<string, Record<string, unknown>>,
  boot: {
    db: null as unknown,
    error: null as string | null,
    usingStaleCache: false,
    retry: vi.fn(),
    setDb: vi.fn(),
  },
  lcu: {
    status: { connected: false, reason: null as string | null },
    session: null as unknown,
  },
  gamePhase: { phase: null as string | null },
  live: { inGame: false, snapshot: null as unknown, reason: "not-running" },
  pushToast: vi.fn(),
  invoke: vi.fn(async () => undefined),
  setUiLocale: vi.fn(),
  setRiotProxyUrl: vi.fn(),
  personalStats: vi.fn(async () => [] as unknown[]),
  findMyPlayer: vi.fn(),
  liveChampionKey: vi.fn(),
  liveRosterKeys: vi.fn(() => ({ allyKeys: [] as string[], enemyKeys: [] as string[] })),
}));

// Generic stub: renders a testid'd div and, when the component takes an
// onClose, a "close-<Name>" button so tests can drive the close path.
function stub(name: string) {
  return function Stub(p: Record<string, unknown>) {
    h.props[name] = p;
    return (
      <div data-testid={name}>
        {typeof p.onClose === "function" && (
          <button onClick={p.onClose as () => void}>close-{name}</button>
        )}
      </div>
    );
  };
}

vi.mock("@tauri-apps/api/core", () => ({ invoke: h.invoke }));
vi.mock("./db/client", () => ({
  probeRustRecoveryMarker: vi.fn(async () => {}),
  isTauri: () => false,
  getDb: vi.fn(),
}));
vi.mock("./i18n", async () => {
  const i18next = (await import("i18next")).default;
  return { setUiLocale: h.setUiLocale, i18n: i18next };
});
vi.mock("./services/riotApi", () => ({ setRiotProxyUrl: h.setRiotProxyUrl }));
vi.mock("./services/matchRepo", () => ({ personalStatsByChampion: h.personalStats }));
vi.mock("./services/overlay", () => ({
  setOverlayVisible: vi.fn(),
  setOverlayPosition: vi.fn(),
}));
vi.mock("./services/liveClient", () => ({
  findMyPlayer: h.findMyPlayer,
  liveChampionKey: h.liveChampionKey,
  liveRosterKeys: h.liveRosterKeys,
}));
vi.mock("./services/lcuService", () => ({
  lcuPositionToRole: (p?: string) => (p === "JUNGLE" ? "JUNGLE" : null),
}));

// Hooks
vi.mock("./state/lcuSync", () => ({ useLcuSync: () => h.lcu }));
vi.mock("./components/ui/ToastContainer", () => ({
  useToast: () => ({ push: h.pushToast }),
}));
vi.mock("./hooks/useChampionDbBoot", () => ({ useChampionDbBoot: () => h.boot }));
vi.mock("./hooks/useNetworkStatus", () => ({
  useNetworkStatus: () => ({ online: true, workerReachable: true }),
}));
vi.mock("./hooks/useTrayHealth", () => ({ useTrayHealth: vi.fn() }));
vi.mock("./state/inGameDetection", () => ({ useGamePhase: () => h.gamePhase }));
vi.mock("./hooks/useLcuPersonalData", () => ({
  useLcuPersonalData: () => ({ masteries: [], rankTier: null }),
}));
vi.mock("./hooks/useAutoOpenCoach", () => ({ useAutoOpenCoach: vi.fn() }));
vi.mock("./state/autoActions", () => ({ useAutoActions: vi.fn() }));
vi.mock("./hooks/useOverlayFollowLol", () => ({ useOverlayFollowLol: vi.fn() }));
vi.mock("./state/scheduledJobs", () => ({ useScheduledJobs: vi.fn() }));
vi.mock("./hooks/useVoiceCoach", () => ({ useVoiceCoach: vi.fn() }));
vi.mock("./hooks/useThemeAccent", () => ({ useThemeAccent: vi.fn() }));
vi.mock("./hooks/useLcuToasts", () => ({
  useLcuConnectToasts: vi.fn(),
  useChampionLockToast: vi.fn(),
}));
vi.mock("./hooks/useViewBreadcrumbs", () => ({ useViewBreadcrumb: vi.fn() }));
vi.mock("./hooks/useSentrySessionTags", () => ({ useSentrySessionTags: vi.fn() }));
vi.mock("./hooks/useTelemetryConsent", () => ({ useTelemetryConsent: vi.fn() }));
vi.mock("./hooks/useSystemToasts", () => ({ useSystemToasts: vi.fn() }));
vi.mock("./hooks/useRoleDerivation", () => ({ useRoleDerivation: vi.fn() }));
vi.mock("./hooks/useSuggestions", () => ({ useSuggestions: () => [] }));
vi.mock("./hooks/useEnemyCounters", () => ({ useEnemyCounters: () => null }));
vi.mock("./hooks/useDraftPrediction", () => ({ useDraftPrediction: () => null }));
vi.mock("./hooks/useDraftLogger", () => ({ useDraftLogger: vi.fn() }));
vi.mock("./hooks/useLiveGame", () => ({ useLiveGame: () => h.live }));

// Eager panels/banners
vi.mock("./components/DraftBoard", () => ({ DraftBoard: stub("DraftBoard") }));
vi.mock("./components/SuggestionPanel", () => ({ SuggestionPanel: stub("SuggestionPanel") }));
vi.mock("./components/DraftCoachPanel", () => ({ DraftCoachPanel: stub("DraftCoachPanel") }));
vi.mock("./components/CompAnalysis", () => ({ CompAnalysis: stub("CompAnalysis") }));
vi.mock("./components/EnemyScoutPanel", () => ({ EnemyScoutPanel: stub("EnemyScoutPanel") }));
vi.mock("./components/BuildPanel", () => ({ BuildPanel: stub("BuildPanel") }));
vi.mock("./components/DraftWinrateBadge", () => ({ DraftWinrateBadge: stub("DraftWinrateBadge") }));
vi.mock("./components/OwnMasteriesPanel", () => ({ OwnMasteriesPanel: stub("OwnMasteriesPanel") }));
vi.mock("./components/PhaseTimer", () => ({ PhaseTimer: stub("PhaseTimer") }));
vi.mock("./components/Toaster", () => ({ Toaster: stub("Toaster") }));
vi.mock("./components/BanSuggestionsPanel", () => ({ BanSuggestionsPanel: stub("BanSuggestionsPanel") }));
vi.mock("./components/LiveGamePanel", () => ({ LiveGamePanel: stub("LiveGamePanel") }));
vi.mock("./components/LobbyScoutPanel", () => ({ LobbyScoutPanel: stub("LobbyScoutPanel") }));
vi.mock("./components/PatchNewBanner", () => ({ PatchNewBanner: stub("PatchNewBanner") }));
vi.mock("./components/UpdateBanner", () => ({ UpdateBanner: stub("UpdateBanner") }));
vi.mock("./components/OverlayCompatBanner", () => ({ OverlayCompatBanner: stub("OverlayCompatBanner") }));
vi.mock("./components/NetworkStatusBanner", () => ({ NetworkStatusBanner: stub("NetworkStatusBanner") }));
vi.mock("./components/FirstRunHealthBanner", () => ({ FirstRunHealthBanner: stub("FirstRunHealthBanner") }));
vi.mock("./components/TrackingStatusBar", () => ({ TrackingStatusBar: stub("TrackingStatusBar") }));
vi.mock("./components/ChangelogModal", () => ({ ChangelogModal: stub("ChangelogModal") }));
vi.mock("./components/AppFooter", () => ({ AppFooter: stub("AppFooter") }));
vi.mock("./components/MatchupTipsPanel", () => ({ MatchupTipsPanel: stub("MatchupTipsPanel") }));
vi.mock("./components/ChampionPoolPanel", () => ({ ChampionPoolPanel: stub("ChampionPoolPanel") }));
vi.mock("./components/InGameTimers", () => ({ InGameTimers: stub("InGameTimers") }));
vi.mock("./components/PatchImpactPanel", () => ({ PatchImpactPanel: stub("PatchImpactPanel") }));
vi.mock("./components/PlaystylePanel", () => ({ PlaystylePanel: stub("PlaystylePanel") }));
vi.mock("./components/WinConditionsPanel", () => ({ WinConditionsPanel: stub("WinConditionsPanel") }));
vi.mock("./components/TipCarousel", () => ({ TipCarousel: stub("TipCarousel") }));
vi.mock("./components/TradeSuggestionPanel", () => ({ TradeSuggestionPanel: stub("TradeSuggestionPanel") }));
// Palette stub exposes each command as a button so tests can run them.
vi.mock("./components/CommandPalette", () => ({
  CommandPalette: (p: { commands: { id: string; action: () => void }[]; onClose: () => void }) => (
    <div data-testid="CommandPalette">
      {p.commands.map((c) => (
        <button key={c.id} onClick={c.action}>
          cmd-{c.id}
        </button>
      ))}
    </div>
  ),
}));

// Lazy views
vi.mock("./components/SettingsView", () => ({ SettingsView: stub("SettingsView") }));
vi.mock("./components/HistoryView", () => ({ HistoryView: stub("HistoryView") }));
vi.mock("./components/CoachView", () => ({ CoachView: stub("CoachView") }));
vi.mock("./components/TrendsView", () => ({ TrendsView: stub("TrendsView") }));
vi.mock("./components/PreferencesView", () => ({ PreferencesView: stub("PreferencesView") }));
vi.mock("./components/OnboardingView", () => ({ OnboardingView: stub("OnboardingView") }));
vi.mock("./components/DiagnosticsView", () => ({ DiagnosticsView: stub("DiagnosticsView") }));
vi.mock("./components/AiChatView", () => ({ AiChatView: stub("AiChatView") }));
vi.mock("./components/DataPrivacyView", () => ({ DataPrivacyView: stub("DataPrivacyView") }));
vi.mock("./components/TierListView", () => ({ TierListView: stub("TierListView") }));
vi.mock("./components/ChampionGuideView", () => ({ ChampionGuideView: stub("ChampionGuideView") }));
vi.mock("./components/SummonerLookupView", () => ({ SummonerLookupView: stub("SummonerLookupView") }));
vi.mock("./components/ProPlayersView", () => ({ ProPlayersView: stub("ProPlayersView") }));
vi.mock("./components/LessonPlanView", () => ({ LessonPlanView: stub("LessonPlanView") }));
vi.mock("./components/LiveGameView", () => ({ LiveGameView: stub("LiveGameView") }));
vi.mock("./components/AboutModal", () => ({ AboutModal: stub("AboutModal") }));
vi.mock("./components/ShortcutsHelp", () => ({ ShortcutsHelp: stub("ShortcutsHelp") }));

import App from "./App";
import { useDraftStore } from "./state/draftStore";
import { usePrefsStore, DEFAULT_PREFS, type Preferences } from "./state/prefsStore";
import { TERMS_VERSION } from "./config";

const DB = {
  patch: "16.21.1",
  metaSourceUsed: "dpm",
  champions: { Jarvan: { key: "Jarvan", name: "Jarvan IV" } },
};

const ACCEPTED: Partial<Preferences> = {
  termsAcceptedAt: 1_700_000_000_000,
  termsAcceptedVersion: TERMS_VERSION,
  onboardingDone: true,
  // These suites cover the full panel layout; the simple view has its own.
  simpleView: false,
};

const draftInitial = useDraftStore.getState();
let storage: Map<string, string>;

/** Seed persisted prefs (read by the real prefsStore.load on mount). */
function seedPrefs(p: Partial<Preferences>) {
  storage.set("lol-draft-prefs", JSON.stringify(p));
}

/** Render App and wait for the real prefs load → TermsGate to settle. */
async function renderApp() {
  const utils = render(<App />);
  await waitFor(() => expect(usePrefsStore.getState().loaded).toBe(true));
  return utils;
}

beforeEach(() => {
  storage = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, v),
    removeItem: (k: string) => void storage.delete(k),
  });
  h.props = {};
  h.boot.db = DB;
  h.boot.error = null;
  h.boot.usingStaleCache = false;
  h.lcu.status = { connected: false, reason: null };
  h.lcu.session = null;
  h.gamePhase.phase = null;
  h.live = { inGame: false, snapshot: null, reason: "not-running" };
  h.liveRosterKeys.mockReturnValue({ allyKeys: [], enemyKeys: [] });
  useDraftStore.setState(draftInitial, true);
  usePrefsStore.setState({ prefs: DEFAULT_PREFS, loaded: false });
  seedPrefs(ACCEPTED);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("App — boot states and gates", () => {
  it("shows the DB-load error screen; Reintentar retries and Diagnóstico also opens diagnostics", async () => {
    h.boot.error = "fetch failed: 503";
    await renderApp();

    expect(screen.getByText("No pude cargar los datos")).toBeInTheDocument();
    expect(screen.getByText("fetch failed: 503")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(h.boot.retry).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Diagnóstico" }));
    expect(h.boot.retry).toHaveBeenCalledTimes(2);
    expect(await screen.findByTestId("DiagnosticsView")).toBeInTheDocument();
    fireEvent.click(screen.getByText("close-DiagnosticsView"));
    expect(screen.queryByTestId("DiagnosticsView")).not.toBeInTheDocument();
  });

  it("renders the loading skeleton (not the header) while the champion DB is null", async () => {
    h.boot.db = null;
    await renderApp();
    expect(await screen.findByText("Cargando draft board...")).toBeInTheDocument();
    expect(screen.queryByText("Esperando cliente")).not.toBeInTheDocument();
  });

  it("holds the app behind TermsGate until terms are accepted", async () => {
    seedPrefs({ onboardingDone: true });
    await renderApp();
    expect(await screen.findByText("Aviso legal y privacidad")).toBeInTheDocument();
    expect(screen.queryByTestId("DraftBoard")).not.toBeInTheDocument();
  });

  it("loads prefs after probing the recovery marker, then syncs the locale", async () => {
    const { probeRustRecoveryMarker } = await import("./db/client");
    seedPrefs({ ...ACCEPTED, uiLocale: "en" });
    await renderApp();
    expect(probeRustRecoveryMarker).toHaveBeenCalledTimes(1);
    // Gated on `loaded`: only the persisted locale is ever applied, never the default.
    await waitFor(() => expect(h.setUiLocale).toHaveBeenCalledWith("en"));
    expect(h.setUiLocale).not.toHaveBeenCalledWith("es");
  });

  it("relabels the tray menu via Tauri once prefs load", async () => {
    // setup.ts defines __TAURI_INTERNALS__ on globalThis, so the `in window` guard passes.
    await renderApp();
    await waitFor(() =>
      expect(h.invoke).toHaveBeenCalledWith("set_tray_labels", {
        show: "Mostrar",
        hide: "Ocultar",
        quit: "Salir",
      })
    );
  });

  it("shows OnboardingView until it is closed, persisting onboardingDone", async () => {
    seedPrefs({ ...ACCEPTED, onboardingDone: false });
    await renderApp();
    fireEvent.click(await screen.findByText("close-OnboardingView"));
    await waitFor(() =>
      expect(screen.queryByTestId("OnboardingView")).not.toBeInTheDocument()
    );
    expect(usePrefsStore.getState().prefs.onboardingDone).toBe(true);
    expect(JSON.parse(storage.get("lol-draft-prefs")!).onboardingDone).toBe(true);
  });
});

describe("App — header", () => {
  it("offline: waiting chip, patch label, draft board shown, no tracking bar", async () => {
    await renderApp();
    expect(screen.getByText("Esperando cliente")).toBeInTheDocument();
    expect(screen.getByText("Patch 26.21")).toBeInTheDocument();
    expect(screen.getByTestId("DraftBoard")).toBeInTheDocument();
    expect(h.props.DraftBoard.lcuConnected).toBe(false);
    expect(screen.queryByTestId("TrackingStatusBar")).not.toBeInTheDocument();
    expect(screen.queryByText("Caché")).not.toBeInTheDocument();
    expect(screen.queryByText("Datos básicos")).not.toBeInTheDocument();
  });

  it("connected with an empty (anonymized) roster hides the draft board and shows the tracking bar", async () => {
    h.lcu.status = { connected: true, reason: null };
    await renderApp();
    expect(screen.getByText("Conectado")).toBeInTheDocument();
    expect(screen.queryByTestId("DraftBoard")).not.toBeInTheDocument();
    expect(screen.getByTestId("TrackingStatusBar")).toBeInTheDocument();
  });

  it("connected with roster data keeps the draft board", async () => {
    h.lcu.status = { connected: true, reason: null };
    useDraftStore.getState().setPick("enemy", 0, "Ahri");
    await renderApp();
    expect(screen.getByTestId("DraftBoard")).toBeInTheDocument();
    expect(h.props.CompAnalysis.enemyKeys).toEqual(["Ahri"]);
  });

  it("flags stale cache and static-fallback meta data", async () => {
    h.boot.usingStaleCache = true;
    h.boot.db = { ...DB, metaSourceUsed: "static" };
    await renderApp();
    expect(screen.getByText("Caché")).toBeInTheDocument();
    expect(screen.getByText("Datos básicos")).toBeInTheDocument();
  });

  it("role select writes myRole and reloads personal stats for that position", async () => {
    await renderApp();
    expect(h.personalStats).toHaveBeenLastCalledWith(undefined);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "MIDDLE" } });
    expect(useDraftStore.getState().myRole).toBe("MIDDLE");
    await waitFor(() =>
      expect(h.personalStats).toHaveBeenLastCalledWith({ position: "MIDDLE" })
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "" } });
    expect(useDraftStore.getState().myRole).toBeNull();
  });

  it("language toggle switches uiLocale and pushes it to i18n", async () => {
    await renderApp();
    const group = screen.getByRole("group", { name: "Idioma de la interfaz" });
    const es = group.querySelectorAll("button")[0];
    const en = group.querySelectorAll("button")[1];
    expect(es).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(en);
    await waitFor(() => expect(en).toHaveAttribute("aria-pressed", "true"));
    expect(usePrefsStore.getState().prefs.uiLocale).toBe("en");
    await waitFor(() => expect(h.setUiLocale).toHaveBeenLastCalledWith("en"));
  });

  it.each([
    ["AI Coach", "AiChatView"],
    ["Tier List", "TierListView"],
    ["Buscar", "SummonerLookupView"],
    ["Live", "LiveGameView"],
  ])("header button %s opens and closes %s", async (label, view) => {
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(await screen.findByTestId(view)).toBeInTheDocument();
    fireEvent.click(screen.getByText(`close-${view}`));
    expect(screen.queryByTestId(view)).not.toBeInTheDocument();
  });

  it.each([
    ["Mi juego", "Coach post-partida", "CoachView"],
    ["Mi juego", "Tendencias", "TrendsView"],
    ["Mi juego", "Historial", "HistoryView"],
    ["Mi juego", "Plan 7 días", "LessonPlanView"],
    ["Ajustes", "Preferencias", "PreferencesView"],
    ["Ajustes", "Configuración Riot", "SettingsView"],
    ["Ajustes", "Diagnóstico", "DiagnosticsView"],
  ])("menu %s → %s opens %s", async (menu, item, view) => {
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: menu }));
    fireEvent.click(await screen.findByText(item));
    expect(await screen.findByTestId(view)).toBeInTheDocument();
    fireEvent.click(screen.getByText(`close-${view}`));
    expect(screen.queryByTestId(view)).not.toBeInTheDocument();
  });

  it("picking a champion in the tier list closes it and opens that champion's guide", async () => {
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Tier List" }));
    await screen.findByTestId("TierListView");
    act(() => {
      (h.props.TierListView.onSelectChampion as (k: string) => void)("Jarvan");
    });
    // Guide chunk loads first (shared Suspense boundary keeps the tier list
    // mounted-but-hidden until then).
    expect(await screen.findByTestId("ChampionGuideView")).toBeInTheDocument();
    expect(screen.queryByTestId("TierListView")).not.toBeInTheDocument();
    expect(h.props.ChampionGuideView.championKey).toBe("Jarvan");
    // onDbUpdate is wired straight to the boot hook's setter.
    expect(h.props.TierListView.onDbUpdate).toBe(h.boot.setDb);
    fireEvent.click(screen.getByText("close-ChampionGuideView"));
    expect(screen.queryByTestId("ChampionGuideView")).not.toBeInTheDocument();
  });

  it("opens the champion guide from the window event channel", async () => {
    await renderApp();
    act(() => {
      window.dispatchEvent(
        new CustomEvent("draft:show-champion-guide", { detail: { championKey: "Ahri" } })
      );
    });
    expect(await screen.findByTestId("ChampionGuideView")).toBeInTheDocument();
    expect(h.props.ChampionGuideView.championKey).toBe("Ahri");
  });

  it("footer opens the forced changelog for the running build and diagnostics", async () => {
    await renderApp();
    // Only the auto-mounted changelog (no forceVersion) exists initially.
    expect(h.props.ChangelogModal.forceVersion).toBeUndefined();
    act(() => {
      (h.props.AppFooter.onShowChangelog as () => void)();
    });
    expect(screen.getAllByTestId("ChangelogModal")).toHaveLength(2);
    expect(screen.getByText("close-ChangelogModal")).toBeInTheDocument();
    fireEvent.click(screen.getByText("close-ChangelogModal"));
    expect(screen.getAllByTestId("ChangelogModal")).toHaveLength(1);

    act(() => {
      (h.props.AppFooter.onShowDiagnostics as () => void)();
    });
    expect(await screen.findByTestId("DiagnosticsView")).toBeInTheDocument();
  });
});

describe("App — keyboard shortcuts and palette", () => {
  it("Ctrl+K opens the palette, Esc closes it, and palette commands open views", async () => {
    await renderApp();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.getByTestId("CommandPalette")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("CommandPalette")).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    fireEvent.click(screen.getByText("cmd-privacy"));
    expect(await screen.findByTestId("DataPrivacyView")).toBeInTheDocument();
    fireEvent.click(screen.getByText("cmd-pro"));
    expect(await screen.findByTestId("ProPlayersView")).toBeInTheDocument();
    fireEvent.click(screen.getByText("cmd-about"));
    expect(await screen.findByTestId("AboutModal")).toBeInTheDocument();
    fireEvent.click(screen.getByText("close-AboutModal"));
    expect(screen.queryByTestId("AboutModal")).not.toBeInTheDocument();
  });

  it("Ctrl+/ opens the shortcuts help", async () => {
    await renderApp();
    fireEvent.keyDown(window, { key: "/", ctrlKey: true });
    expect(await screen.findByTestId("ShortcutsHelp")).toBeInTheDocument();
    fireEvent.click(screen.getByText("close-ShortcutsHelp"));
    expect(screen.queryByTestId("ShortcutsHelp")).not.toBeInTheDocument();
  });

  it("number keys pick a role and R resets the draft board", async () => {
    useDraftStore.getState().setPick("ally", 0, "Garen");
    await renderApp();
    fireEvent.keyDown(window, { key: "2" });
    expect(useDraftStore.getState().myRole).toBe("JUNGLE");
    expect(screen.getByRole("combobox")).toHaveValue("JUNGLE");

    fireEvent.keyDown(window, { key: "r" });
    expect(useDraftStore.getState().ally[0].championKey).toBeNull();
  });
});

describe("App — center tabs", () => {
  const tab = (name: string) => screen.getByRole("button", { name });

  it("defaults to Picks with the picks panels", async () => {
    await renderApp();
    expect(tab("Picks")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("SuggestionPanel")).toBeInTheDocument();
    expect(screen.getByTestId("BanSuggestionsPanel")).toBeInTheDocument();
    expect(screen.queryByTestId("BuildPanel")).not.toBeInTheDocument();
  });

  it("auto-jumps to Build on lock and renders coach + build for the locked champion", async () => {
    useDraftStore.getState().setMyRole("JUNGLE");
    await renderApp();
    act(() => useDraftStore.getState().setLocalSelection(1, null, "Jarvan"));

    expect(tab("Build")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("DraftCoachPanel")).toBeInTheDocument();
    expect(h.props.BuildPanel.championKey).toBe("Jarvan");
    expect(h.props.BuildPanel.role).toBe("JUNGLE");
    expect(h.props.TipCarousel.champion).toEqual(DB.champions.Jarvan);

    // Manual tab click wins after the auto-jump.
    fireEvent.click(tab("Picks"));
    expect(tab("Picks")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByTestId("BuildPanel")).not.toBeInTheDocument();
  });

  it("Build tab without a role shows the empty hint; losing the champion falls back to Picks", async () => {
    await renderApp();
    act(() => useDraftStore.getState().setLocalSelection(1, "Jarvan", null));
    fireEvent.click(tab("Build"));
    expect(
      screen.getByText("Bloquea tu campeón para ver build, runas y consejos.")
    ).toBeInTheDocument();

    act(() => useDraftStore.getState().setLocalSelection(1, null, null));
    await waitFor(() => expect(tab("Picks")).toHaveAttribute("aria-pressed", "true"));
  });
});

describe("App — in-game wiring", () => {
  it("adopts the Live Client champion, role and roster while in game", async () => {
    const me = { championName: "JarvanIV", position: "JUNGLE" };
    h.findMyPlayer.mockReturnValue(me);
    h.liveChampionKey.mockReturnValue("Jarvan");
    h.liveRosterKeys.mockReturnValue({ allyKeys: ["Jarvan", "Lux"], enemyKeys: ["Zed"] });
    h.live = {
      inGame: true,
      snapshot: { activePlayer: { summonerName: "me" }, allPlayers: [me] },
      reason: "in-game",
    };
    h.gamePhase.phase = "InProgress";
    await renderApp();

    expect(screen.getByTestId("InGameTimers")).toBeInTheDocument();
    expect(screen.getByTestId("TrackingStatusBar")).toBeInTheDocument();
    await waitFor(() => expect(useDraftStore.getState().myRole).toBe("JUNGLE"));
    expect(h.props.MatchupTipsPanel.myChampionKey).toBe("Jarvan");
    expect(h.props.CompAnalysis.allyKeys).toEqual(["Jarvan", "Lux"]);
    expect(h.props.CompAnalysis.enemyKeys).toEqual(["Zed"]);
  });

  it("ARAM in-game (champ-select gameMode already cleared, no role): Build tab still shows BuildPanel with the primary role, no ban panel", async () => {
    h.boot.db = {
      ...DB,
      champions: { Jarvan: { key: "Jarvan", id: "JarvanIV", name: "Jarvan IV" } },
    };
    const me = { championName: "JarvanIV", position: "" };
    h.findMyPlayer.mockReturnValue(me);
    h.liveChampionKey.mockReturnValue("Jarvan");
    h.live = {
      inGame: true,
      snapshot: {
        activePlayer: { summonerName: "me" },
        allPlayers: [me],
        gameData: { gameMode: "ARAM", mapNumber: 12 },
      },
      reason: "in-game",
    };
    await renderApp();
    expect(useDraftStore.getState().gameMode).toBeNull();
    expect(screen.queryByTestId("BanSuggestionsPanel")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    expect(h.props.BuildPanel.championKey).toBe("Jarvan");
    expect(h.props.BuildPanel.role).toBe("JUNGLE");
    expect(screen.queryByTestId("DraftCoachPanel")).not.toBeInTheDocument();
  });

  it("ignores the live snapshot when the local player can't be found", async () => {
    h.findMyPlayer.mockReturnValue(null);
    h.live = { inGame: true, snapshot: { activePlayer: {}, allPlayers: [] }, reason: "in-game" };
    await renderApp();
    expect(h.props.MatchupTipsPanel.myChampionKey).toBeNull();
    expect(useDraftStore.getState().myRole).toBeNull();
  });
});

describe("App — Riot proxy URL validation", () => {
  it.each([
    ["https://proxy.example.com/", "https://proxy.example.com"],
    ["http://insecure.example.com", null],
    ["not a url", null],
    ["", null],
  ])("pref %j → client proxy %j", async (url, expected) => {
    seedPrefs({ ...ACCEPTED, riotProxyUrl: url });
    await renderApp();
    await waitFor(() => expect(h.setRiotProxyUrl).toHaveBeenLastCalledWith(expected));
  });
});

vi.mock("./components/SimpleDraftView", () => ({ SimpleDraftView: stub("SimpleDraftView") }));

describe("App — simple view (default)", () => {
  beforeEach(() => seedPrefs({ ...ACCEPTED, simpleView: true }));

  it("shows the three-step screen and four header entries instead of the panels", async () => {
    await renderApp();
    expect(screen.getByTestId("SimpleDraftView")).toBeInTheDocument();
    expect(screen.queryByTestId("DraftBoard")).not.toBeInTheDocument();
    for (const name of ["Partida", "Coach", "Buscar", "Ajustes"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: "Tier List" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mi juego" })).not.toBeInTheDocument();
  });

  it("the moved entries still open their views from the menus", async () => {
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Ajustes" }));
    fireEvent.click(await screen.findByText("Tier List"));
    expect(await screen.findByTestId("TierListView")).toBeInTheDocument();
    fireEvent.click(screen.getByText("close-TierListView"));
    fireEvent.click(screen.getByRole("button", { name: "Coach" }));
    fireEvent.click(await screen.findByText("Coach post-partida"));
    expect(await screen.findByTestId("CoachView")).toBeInTheDocument();
  });

  it("'more details' opens the full layout and Partida returns to the simple one", async () => {
    await renderApp();
    act(() => (h.props.SimpleDraftView.onShowDetails as () => void)());
    expect(screen.getByTestId("DraftBoard")).toBeInTheDocument();
    expect(screen.queryByTestId("SimpleDraftView")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Partida" }));
    expect(screen.getByTestId("SimpleDraftView")).toBeInTheDocument();
    expect(screen.queryByTestId("DraftBoard")).not.toBeInTheDocument();
  });

  it("in game the full layout stays (live panel has no simple twin yet)", async () => {
    h.gamePhase.phase = "InProgress";
    await renderApp();
    expect(screen.queryByTestId("SimpleDraftView")).not.toBeInTheDocument();
    expect(screen.getByTestId("LiveGamePanel")).toBeInTheDocument();
  });
});
