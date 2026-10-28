// SettingsView contract:
//   - Hydrates API key / region / Riot ID / PUUID from settingsRepo on mount.
//   - Proxy banner shows the proxy host whenever prefs.riotProxyUrl is set.
//   - API key input trims (typed + pasted) and warns on non-RGAPI keys.
//   - Riot-API buttons are gated on "local key OR proxy"; save also needs a
//     full Riot ID. Pro meta + resync are always available.
//   - Save & sync validates the Riot ID (refreshing the stored PUUID) before
//     syncing; resync confirms first and never wipes matches if validation
//     fails.
//   - Auto-detect fills the Riot ID / region / PUUID from the LCU.
//   - Meta syncs report progress + done/error status lines.
//   - Locale / update-channel pickers write their prefs.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import { SettingsView } from "./SettingsView";
import { usePrefsStore, DEFAULT_PREFS, type Preferences } from "../state/prefsStore";
import type { StoredSettings } from "../services/settingsRepo";
import type { SyncProgress, SyncResult } from "../services/personalDataSync";
import type { ChampionDb } from "../types/champion";

vi.mock("../services/riotApi", () => ({
  getAccount: vi.fn(),
  getRiotProxyUrl: vi.fn(),
}));
vi.mock("../services/settingsRepo", () => ({
  loadSettings: vi.fn(),
  saveSettings: vi.fn(),
}));
vi.mock("../services/lcuService", () => ({
  getCurrentSummoner: vi.fn(),
}));
vi.mock("../services/personalDataSync", () => ({
  syncPersonalData: vi.fn(),
}));
vi.mock("../services/matchRepo", () => ({
  clearAllMatches: vi.fn(),
}));
vi.mock("../services/proPlayAggregator", () => ({
  aggregateFromProPlay: vi.fn(),
}));
vi.mock("../services/championDb", () => ({
  loadChampionDb: vi.fn(),
}));
vi.mock("../services/metaAggregator", () => ({
  aggregateFromMaster: vi.fn(),
  aggregateMultiRegion: vi.fn(),
}));
vi.mock("../services/dataDragon", () => ({
  fetchLatestPatch: vi.fn(),
}));

import { getAccount, getRiotProxyUrl } from "../services/riotApi";
import { loadSettings, saveSettings } from "../services/settingsRepo";
import { getCurrentSummoner } from "../services/lcuService";
import { syncPersonalData } from "../services/personalDataSync";
import { clearAllMatches } from "../services/matchRepo";
import { aggregateFromProPlay } from "../services/proPlayAggregator";
import { loadChampionDb } from "../services/championDb";
import { aggregateFromMaster, aggregateMultiRegion } from "../services/metaAggregator";
import { fetchLatestPatch } from "../services/dataDragon";

const SAVED: StoredSettings = {
  apiKey: "RGAPI-saved",
  region: "na1",
  riotIdName: "Faker",
  riotIdTag: "KR1",
  puuid: "puuid-old",
};

const DB = { patch: "16.10.1", champions: {}, counters: [], meta: [], fetchedAt: 0 } as unknown as ChampionDb;

function setPrefs(over: Partial<Preferences> = {}) {
  usePrefsStore.setState({ prefs: { ...DEFAULT_PREFS, ...over } });
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function syncResult(over: Partial<SyncResult> = {}): SyncResult {
  return { matches: 12, masteries: 0, rank: null, source: "LCU", ...over };
}

const apiKeyInput = () => screen.getByPlaceholderText("RGAPI-...") as HTMLInputElement;
const nameInput = () => screen.getByPlaceholderText("Faker") as HTMLInputElement;
const tagInput = () => screen.getByPlaceholderText("KR1") as HTMLInputElement;
const regionSelect = () =>
  screen.getAllByRole("combobox").find((el) => within(el).queryByText("EU West")) as HTMLSelectElement;
const btn = (name: string | RegExp) => screen.getByRole("button", { name });
const saveBtn = () => screen.getByTitle(/Valida tu cuenta|Completa Riot ID|Necesita API key Riot o proxy$/);

async function renderView(onClose = vi.fn()) {
  const utils = render(<SettingsView onClose={onClose} />);
  await act(async () => {}); // flush loadSettings()
  return { ...utils, onClose };
}

async function click(el: HTMLElement) {
  await act(async () => {
    fireEvent.click(el);
  });
}

async function confirmResync() {
  fireEvent.click(btn("Re-sync"));
  await click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Resincronizar" }));
}

beforeEach(() => {
  setPrefs();
  vi.mocked(getRiotProxyUrl).mockReset().mockReturnValue(null);
  vi.mocked(getAccount).mockReset().mockResolvedValue({ puuid: "puuid-new", gameName: "Faker", tagLine: "KR1" });
  vi.mocked(loadSettings).mockReset().mockResolvedValue(null);
  vi.mocked(saveSettings).mockReset().mockResolvedValue(undefined);
  vi.mocked(getCurrentSummoner).mockReset().mockResolvedValue(null);
  vi.mocked(syncPersonalData).mockReset().mockResolvedValue(syncResult());
  vi.mocked(clearAllMatches).mockReset().mockResolvedValue(undefined);
  vi.mocked(aggregateFromProPlay).mockReset().mockResolvedValue({ games: 40, rows: 120 });
  vi.mocked(loadChampionDb).mockReset().mockResolvedValue(DB);
  vi.mocked(aggregateFromMaster).mockReset().mockResolvedValue(undefined);
  vi.mocked(aggregateMultiRegion).mockReset().mockResolvedValue(undefined);
  vi.mocked(fetchLatestPatch).mockReset().mockResolvedValue("16.10.1");
});

describe("SettingsView — hydration + fields", () => {
  it("fills the form from saved settings", async () => {
    vi.mocked(loadSettings).mockResolvedValue(SAVED);
    await renderView();
    expect(apiKeyInput().value).toBe("RGAPI-saved");
    expect(regionSelect().value).toBe("na1");
    expect(nameInput().value).toBe("Faker");
    expect(tagInput().value).toBe("KR1");
    expect(screen.getByText("PUUID: puuid-old")).toBeInTheDocument();
    expect(screen.getByText("⚠️ Las dev keys caducan cada 24h")).toBeInTheDocument();
  });

  it("keeps defaults when nothing is saved", async () => {
    await renderView();
    expect(apiKeyInput().value).toBe("");
    expect(regionSelect().value).toBe("euw1");
    expect(screen.queryByText(/^PUUID:/)).toBeNull();
    expect(screen.queryByText(/dev keys caducan/)).toBeNull();
  });

  it("trims typed API keys and warns when the key isn't a Riot key", async () => {
    await renderView();
    fireEvent.change(apiKeyInput(), { target: { value: "gsk_groqkey" } });
    expect(screen.getByText(/Las keys Riot empiezan por/)).toBeInTheDocument();

    fireEvent.change(apiKeyInput(), { target: { value: "  RGAPI-123  " } });
    expect(apiKeyInput().value).toBe("RGAPI-123");
    expect(screen.queryByText(/Las keys Riot empiezan por/)).toBeNull();
  });

  it("replaces the key with the trimmed clipboard content on paste", async () => {
    await renderView();
    fireEvent.change(apiKeyInput(), { target: { value: "RGAPI-old" } });
    fireEvent.paste(apiKeyInput(), {
      clipboardData: { getData: (fmt: string) => (fmt === "text" ? "  RGAPI-pasted\n" : "") },
    });
    expect(apiKeyInput().value).toBe("RGAPI-pasted");
  });

  it("trims the Riot ID name and tag on blur", async () => {
    await renderView();
    fireEvent.change(nameInput(), { target: { value: "  Faker " } });
    expect(nameInput().value).toBe("  Faker ");
    fireEvent.blur(nameInput());
    fireEvent.change(tagInput(), { target: { value: " KR1 " } });
    fireEvent.blur(tagInput());
    expect(nameInput().value).toBe("Faker");
    expect(tagInput().value).toBe("KR1");
  });
});

describe("SettingsView — proxy banner + pickers", () => {
  it("shows the proxy host when a proxy URL is configured", async () => {
    setPrefs({ riotProxyUrl: "https://my-proxy.example.dev/some/path" });
    await renderView();
    expect(screen.getByText("🌟 Modo proxy premium activo")).toBeInTheDocument();
    expect(screen.getByText("my-proxy.example.dev")).toBeInTheDocument();
  });

  it("falls back to the raw value for a non-URL proxy string", async () => {
    setPrefs({ riotProxyUrl: "not a url" });
    await renderView();
    expect(screen.getByText("not a url").tagName).toBe("CODE");
  });

  it("hides the banner when the proxy URL is blank", async () => {
    setPrefs({ riotProxyUrl: "   " });
    await renderView();
    expect(screen.queryByText("🌟 Modo proxy premium activo")).toBeNull();
  });

  it("locale and update-channel pickers write their prefs", async () => {
    await renderView();
    const locale = screen.getByRole("combobox", { name: "Idioma de la interfaz de Draftboard" });
    expect(within(locale).getAllByRole("option").map((o) => o.textContent)).toEqual(["Español", "English"]);
    fireEvent.change(locale, { target: { value: "en" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Canal de actualizaciones" }), {
      target: { value: "beta" },
    });
    await act(async () => {});
    expect(usePrefsStore.getState().prefs.uiLocale).toBe("en");
    expect(usePrefsStore.getState().prefs.updateChannel).toBe("beta");
  });
});

describe("SettingsView — button gating", () => {
  it("without key or proxy, Riot-API syncs are disabled but pro meta + resync are not", async () => {
    await renderView();
    expect(btn("Sync meta SoloQ")).toBeDisabled();
    expect(btn("Sync meta SoloQ")).toHaveAttribute("title", "Necesita API key Riot o proxy configurado");
    expect(btn("🌍 Multi-región")).toBeDisabled();
    expect(saveBtn()).toBeDisabled();
    expect(saveBtn()).toHaveAttribute("title", "Necesita API key Riot o proxy");
    expect(btn("🏆 Sync meta PRO")).toBeEnabled();
    expect(btn("Re-sync")).toBeEnabled();
  });

  it("a proxy alone unlocks Riot-API syncs; save still needs a full Riot ID", async () => {
    vi.mocked(getRiotProxyUrl).mockReturnValue("https://proxy.test");
    await renderView();
    expect(btn("Sync meta SoloQ")).toBeEnabled();
    expect(btn("Sync meta SoloQ")).toHaveAttribute("title", "Agrega Master+ SoloQ a la base de datos meta");
    expect(btn("🌍 Multi-región")).toBeEnabled();
    expect(saveBtn()).toBeDisabled();
    expect(saveBtn()).toHaveAttribute("title", "Completa Riot ID + tag arriba");

    fireEvent.change(nameInput(), { target: { value: "Faker" } });
    fireEvent.change(tagInput(), { target: { value: "KR1" } });
    expect(saveBtn()).toBeEnabled();
    expect(saveBtn()).toHaveAttribute("title", "Valida tu cuenta y sincroniza tu historial");
  });
});

describe("SettingsView — save & sync", () => {
  it("validates the Riot ID, stores the fresh PUUID, then syncs with progress", async () => {
    vi.mocked(loadSettings).mockResolvedValue(SAVED);
    const sync = deferred<SyncResult>();
    let progress!: (p: SyncProgress) => void;
    vi.mocked(syncPersonalData).mockImplementation((onProgress) => {
      progress = onProgress!;
      return sync.promise;
    });
    await renderView();
    fireEvent.change(regionSelect(), { target: { value: "kr" } });

    await click(btn("Guardar y sincronizar"));
    const cfg = { apiKey: "RGAPI-saved", region: "kr", riotIdName: "Faker", riotIdTag: "KR1" };
    expect(getAccount).toHaveBeenCalledWith(cfg);
    expect(saveSettings).toHaveBeenCalledWith({ ...cfg, puuid: "puuid-new" });
    expect(screen.getByText("PUUID: puuid-new")).toBeInTheDocument();
    // Busy: every action is disabled and the save button shows an ellipsis.
    expect(btn("...")).toBeDisabled();
    expect(btn("Re-sync")).toBeDisabled();

    act(() => progress({ source: "LCU", done: 3, total: 10 }));
    expect(screen.getByText("LCU: 3/10")).toHaveClass("text-white/70");
    act(() => progress({ source: "Riot API", done: 0, total: 0, message: "rate limited" }));
    expect(screen.getByText("Riot API: rate limited")).toBeInTheDocument();

    await act(async () => sync.resolve(syncResult({ matches: 12, source: "LCU" })));
    expect(screen.getByText("Listo ✓ (12 partidas vía LCU)")).toHaveClass("text-good");
    expect(btn("Guardar y sincronizar")).toBeEnabled();
  });

  it("tells the user to open the client when no source was available", async () => {
    vi.mocked(loadSettings).mockResolvedValue(SAVED);
    vi.mocked(syncPersonalData).mockResolvedValue(syncResult({ source: "none", matches: 0 }));
    await renderView();
    await click(btn("Guardar y sincronizar"));
    expect(screen.getByText(/Abre el cliente de LoL y reintenta/)).toBeInTheDocument();
  });

  it("surfaces a Riot ID validation error and skips the sync", async () => {
    vi.mocked(loadSettings).mockResolvedValue(SAVED);
    vi.mocked(getAccount).mockRejectedValue(new Error("404 not found"));
    await renderView();
    await click(btn("Guardar y sincronizar"));
    expect(screen.getByText("Error: Error: 404 not found")).toHaveClass("text-bad");
    expect(saveSettings).not.toHaveBeenCalled();
    expect(syncPersonalData).not.toHaveBeenCalled();
    expect(screen.getByText("PUUID: puuid-old")).toBeInTheDocument();
  });
});

describe("SettingsView — resync", () => {
  it("asks for confirmation and does nothing on cancel", async () => {
    vi.mocked(loadSettings).mockResolvedValue(SAVED);
    await renderView();
    fireEvent.click(btn("Re-sync"));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("¿Resincronizar todo?");
    fireEvent.click(within(dialog).getAllByRole("button", { name: "Cancelar" })[1]);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(clearAllMatches).not.toHaveBeenCalled();
    expect(syncPersonalData).not.toHaveBeenCalled();
  });

  it("validates + saves first, then wipes and re-downloads matches", async () => {
    vi.mocked(loadSettings).mockResolvedValue(SAVED);
    vi.mocked(syncPersonalData).mockResolvedValue(syncResult({ matches: 5, source: "Riot API" }));
    await renderView();
    await confirmResync();

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(saveSettings).toHaveBeenCalledWith({
      apiKey: "RGAPI-saved",
      region: "na1",
      riotIdName: "Faker",
      riotIdTag: "KR1",
      puuid: "puuid-new",
    });
    const saveOrder = vi.mocked(saveSettings).mock.invocationCallOrder[0];
    const clearOrder = vi.mocked(clearAllMatches).mock.invocationCallOrder[0];
    const syncOrder = vi.mocked(syncPersonalData).mock.invocationCallOrder[0];
    expect(saveOrder).toBeLessThan(clearOrder);
    expect(clearOrder).toBeLessThan(syncOrder);
    expect(screen.getByText("Resincronizado ✓ (5 partidas vía Riot API)")).toHaveClass("text-good");
  });

  it("never wipes matches when the Riot ID fails to validate", async () => {
    vi.mocked(loadSettings).mockResolvedValue(SAVED);
    vi.mocked(getAccount).mockRejectedValue(new Error("bad id"));
    await renderView();
    await confirmResync();
    expect(screen.getByText("Error validando Riot ID: Error: bad id")).toHaveClass("text-bad");
    expect(clearAllMatches).not.toHaveBeenCalled();
    expect(syncPersonalData).not.toHaveBeenCalled();
    expect(btn("Re-sync")).toBeEnabled();
  });

  it("with a key but no Riot ID, saves the current settings without validating", async () => {
    vi.mocked(loadSettings).mockResolvedValue({ ...SAVED, riotIdName: "", riotIdTag: "" });
    await renderView();
    await confirmResync();
    expect(getAccount).not.toHaveBeenCalled();
    expect(saveSettings).toHaveBeenCalledWith({
      apiKey: "RGAPI-saved",
      region: "na1",
      riotIdName: "",
      riotIdTag: "",
      puuid: "puuid-old",
    });
    expect(clearAllMatches).toHaveBeenCalledTimes(1);
  });

  it("with neither key nor proxy, skips saving and reports sync errors", async () => {
    vi.mocked(syncPersonalData).mockRejectedValue(new Error("LCU down"));
    await renderView();
    await confirmResync();
    expect(getAccount).not.toHaveBeenCalled();
    expect(saveSettings).not.toHaveBeenCalled();
    expect(clearAllMatches).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Error: Error: LCU down")).toHaveClass("text-bad");
  });
});

describe("SettingsView — auto-detect", () => {
  it("reports when the client isn't open", async () => {
    await renderView();
    await click(btn(/Auto-detectar/));
    expect(screen.getByText("Cliente no abierto. Abre LoL primero.")).toBeInTheDocument();
  });

  it("fills Riot ID, region and PUUID from the LCU summoner", async () => {
    vi.mocked(getCurrentSummoner).mockResolvedValue({
      puuid: "lcu-puuid",
      gameName: "Caps",
      tagLine: "EUW",
      region: "KR",
    });
    await renderView();
    await click(btn(/Auto-detectar/));
    expect(nameInput().value).toBe("Caps");
    expect(tagInput().value).toBe("EUW");
    expect(regionSelect().value).toBe("kr");
    expect(screen.getByText("PUUID: lcu-puuid")).toBeInTheDocument();
    expect(screen.getByText("Detectado: Caps#EUW")).toBeInTheDocument();
  });

  it("ignores unknown regions and falls back to displayName / ? in the status", async () => {
    vi.mocked(getCurrentSummoner).mockResolvedValue({
      puuid: "",
      displayName: "OldSummoner",
      region: "PBE1",
    });
    await renderView();
    await click(btn(/Auto-detectar/));
    expect(regionSelect().value).toBe("euw1");
    expect(nameInput().value).toBe("");
    expect(screen.queryByText(/^PUUID:/)).toBeNull();
    expect(screen.getByText("Detectado: OldSummoner#?")).toBeInTheDocument();
  });
});

describe("SettingsView — meta syncs", () => {
  it("pro meta uses a forced championDb reload, the latest patch and the days-window pref", async () => {
    setPrefs({ proPlayDaysWindow: 14 });
    const done = deferred<{ games: number; rows: number }>();
    let progress!: (p: { phase: string; done: number; total: number }) => void;
    vi.mocked(aggregateFromProPlay).mockImplementation((_db, _patch, _days, onProgress) => {
      progress = onProgress;
      return done.promise;
    });
    await renderView();
    await click(btn("🏆 Sync meta PRO"));
    expect(loadChampionDb).toHaveBeenCalledWith(true);
    expect(aggregateFromProPlay).toHaveBeenCalledWith(DB, "16.10.1", 14, expect.any(Function));
    act(() => progress({ phase: "leaguepedia", done: 1, total: 2 }));
    expect(screen.getByText("leaguepedia: 1/2")).toBeInTheDocument();
    await act(async () => done.resolve({ games: 40, rows: 120 }));
    expect(
      screen.getByText("Pro meta sincronizado ✓ 40 partidas pro · 120 entradas champ/rol. Recarga.")
    ).toHaveClass("text-good");
  });

  it("pro meta errors are reported", async () => {
    vi.mocked(fetchLatestPatch).mockRejectedValue(new Error("ddragon down"));
    await renderView();
    await click(btn("🏆 Sync meta PRO"));
    expect(screen.getByText("Error pro meta: Error: ddragon down")).toHaveClass("text-bad");
    expect(aggregateFromProPlay).not.toHaveBeenCalled();
  });

  it("SoloQ meta aggregates with the current config and reports progress", async () => {
    vi.mocked(loadSettings).mockResolvedValue(SAVED);
    const done = deferred<void>();
    let progress!: (p: { phase: string; done: number; total: number }) => void;
    vi.mocked(aggregateFromMaster).mockImplementation((_cfg, _patch, onProgress) => {
      progress = onProgress;
      return done.promise;
    });
    await renderView();
    await click(btn("Sync meta SoloQ"));
    expect(aggregateFromMaster).toHaveBeenCalledWith(
      { apiKey: "RGAPI-saved", region: "na1", riotIdName: "Faker", riotIdTag: "KR1" },
      "16.10.1",
      expect.any(Function)
    );
    expect(screen.getByText("Sincronizando meta SoloQ...")).toBeInTheDocument();
    act(() => progress({ phase: "ladder", done: 5, total: 50 }));
    expect(screen.getByText("ladder: 5/50")).toBeInTheDocument();
    await act(async () => done.resolve());
    expect(screen.getByText("Meta SoloQ sincronizado ✓ (recarga la app para usarlo)")).toBeInTheDocument();
  });

  it("SoloQ meta errors are reported", async () => {
    vi.mocked(loadSettings).mockResolvedValue(SAVED);
    vi.mocked(aggregateFromMaster).mockRejectedValue(new Error("429"));
    await renderView();
    await click(btn("Sync meta SoloQ"));
    expect(screen.getByText("Error: Error: 429")).toHaveClass("text-bad");
  });

  it("multi-region works through the proxy without a local key", async () => {
    vi.mocked(getRiotProxyUrl).mockReturnValue("https://proxy.test");
    const done = deferred<void>();
    let progress!: (p: { phase: string; done: number; total: number }) => void;
    vi.mocked(aggregateMultiRegion).mockImplementation((_cfg, _patch, onProgress) => {
      progress = onProgress;
      return done.promise;
    });
    await renderView();
    await click(btn("🌍 Multi-región"));
    expect(aggregateMultiRegion).toHaveBeenCalledWith(
      { apiKey: "", region: "euw1", riotIdName: "", riotIdTag: "" },
      "16.10.1",
      expect.any(Function)
    );
    act(() => progress({ phase: "KR", done: 1, total: 3 }));
    expect(screen.getByText("KR: 1/3")).toBeInTheDocument();
    await act(async () => done.resolve());
    expect(screen.getByText("Meta multi-región sincronizado ✓ (recarga la app)")).toBeInTheDocument();
  });

  it("multi-region errors are reported", async () => {
    vi.mocked(getRiotProxyUrl).mockReturnValue("https://proxy.test");
    vi.mocked(aggregateMultiRegion).mockRejectedValue(new Error("timeout"));
    await renderView();
    await click(btn("🌍 Multi-región"));
    expect(screen.getByText("Error multi-región: Error: timeout")).toHaveClass("text-bad");
  });
});

describe("SettingsView — closing", () => {
  it("Cancel, backdrop click and Escape close; clicks inside don't", async () => {
    const { onClose } = await renderView();
    fireEvent.click(screen.getByRole("heading", { name: "Configuración" }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(btn("Cancelar"));
    fireEvent.click(screen.getByRole("dialog"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
