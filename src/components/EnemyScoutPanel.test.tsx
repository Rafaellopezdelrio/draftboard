// EnemyScoutPanel: LCU summoner lookup, Riot scout and settings are mocked at
// the module boundary; threat synthesis (scoutInsights), prefs store, toast
// store and Panel are real. voiceCoach is spied (jsdom has no speechSynthesis).
//   - Renders nothing until at least one enemy summoner id is known
//   - Per-slot states: empty / loading / error / scout card
//   - Card: rank badge, recent WR, main + spam champs, mastery, threat note
//   - Team summary line from the per-player threats
//   - notifyOnEnemyHotStreak gates toasts, voice alerts and streak chips
//   - Re-scouts on champion lock, not on identical re-renders
//   - liveScoutRefresh interval picks up a late Riot config; cleared on unmount

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ChampionDb } from "../types/champion";
import type { ScoutResult } from "../services/enemyScout";

const m = vi.hoisted(() => ({
  getSummonerById: vi.fn(),
  scoutPlayer: vi.fn(),
  loadSettings: vi.fn(),
}));
vi.mock("../services/lcuService", () => ({ getSummonerById: m.getSummonerById }));
vi.mock("../services/enemyScout", () => ({ scoutPlayer: m.scoutPlayer }));
vi.mock("../services/settingsRepo", () => ({ loadSettings: m.loadSettings }));

import { EnemyScoutPanel } from "./EnemyScoutPanel";
import { usePrefsStore, DEFAULT_PREFS } from "../state/prefsStore";
import { useToastStore } from "./Toaster";
import { voiceCoach } from "../services/voiceCoach";

const speak = vi.spyOn(voiceCoach, "speak").mockImplementation(() => {});

const CFG = { apiKey: "RGAPI-test", region: "euw1", riotIdName: "Me", riotIdTag: "EUW" };

function champ(key: string, name: string) {
  return {
    key,
    id: name,
    name,
    title: "",
    iconUrl: `https://cdn.test/${name}.png`,
    splashUrl: "",
    tags: [],
    roles: [],
    archetypes: [],
  };
}

const db = {
  patch: "14.10.1",
  champions: { "266": champ("266", "Aatrox"), "103": champ("103", "Ahri") },
  counters: [],
  meta: [],
  fetchedAt: 0,
} as unknown as ChampionDb;

function mkScout(over: Partial<ScoutResult> = {}): ScoutResult {
  return {
    puuid: "p",
    summonerLevel: 200,
    rank: "GOLD II",
    lp: 45,
    recentWins: 5,
    recentLosses: 5,
    hotStreak: false,
    coldStreak: false,
    topChampionIds: [],
    topMasteries: [],
    mainChampionId: null,
    mostPlayedRecent: null,
    pickedChampionMastery: null,
    ...over,
  };
}

function setPrefs(over: Partial<typeof DEFAULT_PREFS>) {
  usePrefsStore.setState({ prefs: { ...DEFAULT_PREFS, ...over } });
}

const flush = () => act(async () => {});

// Node's experimental global localStorage shadows jsdom's here (see
// prefsStore.test.ts); stub an in-memory Storage so Panel can persist state.
function stubLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
  } satisfies Storage);
}

describe("EnemyScoutPanel", () => {
  beforeEach(() => {
    stubLocalStorage();
    // Open the collapsible panel so slot bodies render.
    localStorage.setItem("panel-open:enemyScout", "1");
    setPrefs({ liveScoutRefresh: false, notifyOnEnemyHotStreak: true });
    useToastStore.setState({ toasts: [] });
    speak.mockClear();
    m.loadSettings.mockReset().mockResolvedValue(CFG);
    m.getSummonerById.mockReset().mockImplementation(async (sid: number) => ({
      puuid: `puuid-${sid}`,
    }));
    m.scoutPlayer.mockReset().mockResolvedValue(mkScout());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("renders nothing and scouts nobody when no enemy summoner is known", async () => {
    const { container } = render(
      <EnemyScoutPanel db={db} enemySummonerIds={[0, 0, -1]} enemyChampionIds={[null, null, null]} />
    );
    await flush();
    expect(container).toBeEmptyDOMElement();
    expect(m.loadSettings).not.toHaveBeenCalled();
  });

  it("starts collapsed with the filled-slot count and expands on click", async () => {
    localStorage.removeItem("panel-open:enemyScout");
    const user = userEvent.setup();
    render(
      <EnemyScoutPanel db={db} enemySummonerIds={[11, 0, 22, 0, 0]} enemyChampionIds={[]} />
    );
    await flush();
    const header = screen.getByRole("button", { name: /Scout enemigos/ });
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(within(header).getByText("2/5")).toBeInTheDocument();
    expect(screen.queryByText("Slot 2 vacío")).toBeNull();

    await user.click(header);
    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Slot 2 vacío")).toBeInTheDocument();
  });

  it("scouts each enemy with its own locked champion and renders the cards + summary", async () => {
    m.scoutPlayer.mockImplementation(async (_cfg: unknown, puuid: string) =>
      puuid === "puuid-11"
        ? mkScout({
            recentWins: 7,
            recentLosses: 3,
            mainChampionId: 266,
            mostPlayedRecent: { championId: 103, games: 5, wins: 3 },
            topMasteries: [
              { championId: 266, level: 7, points: 150_000 },
              { championId: 103, level: 5, points: 40_000 },
            ],
            pickedChampionMastery: { championId: 266, level: 7, points: 150_000 },
          })
        : mkScout({ rank: null, lp: null, recentWins: 2, recentLosses: 3 })
    );
    render(
      <EnemyScoutPanel
        db={db}
        enemySummonerIds={[11, 0, 22, 0, 0]}
        enemyChampionIds={[266, null, 103, null, null]}
      />
    );

    expect(await screen.findByText("70%")).toBeInTheDocument();
    await screen.findByText("40%");

    expect(m.scoutPlayer).toHaveBeenCalledTimes(2);
    expect(m.scoutPlayer).toHaveBeenCalledWith(CFG, "puuid-11", 266);
    expect(m.scoutPlayer).toHaveBeenCalledWith(CFG, "puuid-22", 103);

    // Empty slots keep their position label.
    expect(screen.getByText("Slot 2 vacío")).toBeInTheDocument();
    expect(screen.getByText("Slot 4 vacío")).toBeInTheDocument();
    expect(screen.getByText("Slot 5 vacío")).toBeInTheDocument();

    // Enemy #1: main on Aatrox with 150k on the locked champ -> danger.
    expect(screen.getByText("7W·3L")).toBeInTheDocument();
    expect(screen.getByTitle("Main: Aatrox")).toHaveAttribute("src", "https://cdn.test/Aatrox.png");
    expect(screen.getByTitle("GOLD II 45LP")).toBeInTheDocument();
    expect(screen.getByText("Ahri")).toBeInTheDocument(); // "Spam:" champion
    expect(screen.getByText("M7 · 150k")).toBeInTheDocument();
    expect(screen.getByText(/main$/)).toBeInTheDocument();
    expect(screen.queryByText(/one-trick/)).toBeNull();
    expect(screen.getByTitle("Aatrox · M7 · 150k")).toBeInTheDocument();
    expect(screen.getByTitle("Ahri · M5 · 40k")).toBeInTheDocument();
    expect(
      screen.getByText("Juega su main (Aatrox). Respeta sus picks de poder.")
    ).toBeInTheDocument();

    // Enemy #2: unranked, 40% over 5 games -> neutral, standard note.
    expect(screen.getByText("2W·3L")).toBeInTheDocument();
    expect(screen.getByText("Sin rango")).toBeInTheDocument();
    expect(screen.getByText("Oponente estándar. Ejecuta tu plan de carril.")).toBeInTheDocument();

    expect(
      screen.getByText("1 amenaza: juega seguro y coordina vs ellos.")
    ).toBeInTheDocument();

    // Danger read is spoken; no hot-streak / one-trick toasts.
    expect(speak).toHaveBeenCalledWith(
      "Amenaza: Juega su main (Aatrox). Respeta sus picks de poder.",
      "threat-11"
    );
    expect(speak).toHaveBeenCalledTimes(1);
    expect(useToastStore.getState().toasts).toEqual([]);
  });

  it("shows the safe summary when no enemy is a threat", async () => {
    render(<EnemyScoutPanel db={db} enemySummonerIds={[11]} enemyChampionIds={[null]} />);
    expect(await screen.findByText("Sin amenazas claras — ejecuta tu plan.")).toBeInTheDocument();
    expect(m.scoutPlayer).toHaveBeenCalledWith(CFG, "puuid-11", undefined);
  });

  it("counts elevated enemies as threats and alerts a hot streak with no locked champion", async () => {
    m.scoutPlayer.mockImplementation(async (_cfg: unknown, puuid: string) =>
      puuid === "puuid-11"
        ? mkScout({ recentWins: 6, recentLosses: 4, hotStreak: true })
        : mkScout({ recentWins: 13, recentLosses: 7 })
    );
    render(<EnemyScoutPanel db={db} enemySummonerIds={[11, 22]} enemyChampionIds={[null, null]} />);

    expect(
      await screen.findByText("2 amenazas: juega seguro y coordina vs ellos.")
    ).toBeInTheDocument();
    const hotNote = screen.getByText("En racha (60%). Confiado — castiga sus overextends.");
    expect(hotNote.parentElement).toHaveClass("text-meh");

    expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual([
      expect.stringMatching(/^🔥 Enemigo en racha \(GOLD II\)\s*$/),
    ]);
    // Elevated (not danger) -> only the streak line is spoken.
    expect(speak.mock.calls).toEqual([["Cuidado, enemigo en racha", "hot-11"]]);
  });

  it("marks a slot as error when the LCU has no puuid or the scout throws", async () => {
    m.getSummonerById.mockImplementation(async (sid: number) =>
      sid === 11 ? null : { puuid: `puuid-${sid}` }
    );
    m.scoutPlayer.mockRejectedValue(new Error("429"));
    render(<EnemyScoutPanel db={db} enemySummonerIds={[11, 22]} enemyChampionIds={[null, null]} />);

    expect(await screen.findByText("Slot 1: sin datos")).toBeInTheDocument();
    expect(await screen.findByText("Slot 2: sin datos")).toBeInTheDocument();
    // Only the summoner with a puuid reached the Riot scout.
    expect(m.scoutPlayer).toHaveBeenCalledTimes(1);
    expect(m.scoutPlayer).toHaveBeenCalledWith(CFG, "puuid-22", undefined);
    // No loaded scouts -> no team summary.
    expect(screen.queryByText(/amenaza/)).toBeNull();
  });

  it("stays in the loading state when no Riot config is saved", async () => {
    m.loadSettings.mockResolvedValue(null);
    render(<EnemyScoutPanel db={db} enemySummonerIds={[11, 0]} enemyChampionIds={[]} />);
    await flush();
    expect(screen.getByText("Scout slot 1...")).toBeInTheDocument();
    expect(screen.getByText("Slot 2 vacío")).toBeInTheDocument();
    expect(m.getSummonerById).not.toHaveBeenCalled();
    expect(m.scoutPlayer).not.toHaveBeenCalled();
  });

  it("alerts on hot-streak one-tricks: toasts, voice and card chips", async () => {
    m.scoutPlayer.mockResolvedValue(
      mkScout({
        rank: "DIAMOND I",
        lp: 10,
        recentWins: 8,
        recentLosses: 2,
        hotStreak: true,
        mainChampionId: 103,
        pickedChampionMastery: { championId: 103, level: 7, points: 250_000 },
      })
    );
    render(<EnemyScoutPanel db={db} enemySummonerIds={[11]} enemyChampionIds={[103]} />);
    await screen.findByText("80%");

    const toasts = useToastStore.getState().toasts;
    expect(toasts.map((t) => [t.message, t.severity, t.ttlMs])).toEqual([
      ["🔥 Enemigo en racha (DIAMOND I) con Ahri", "warn", 6000],
      ["🎯 One-trick: Ahri (250k pts)", "warn", 7000],
    ]);
    expect(speak.mock.calls).toEqual([
      ["Cuidado, enemigo en racha con Ahri", "hot-11"],
      ["Amenaza: OTP de Ahri (250k). No pelees el 1v1 temprano; pide jungla.", "threat-11"],
    ]);

    expect(screen.getByText("en racha")).toBeInTheDocument();
    expect(screen.getByText(/one-trick/)).toBeInTheDocument();
    expect(screen.getByText(/main$/)).toBeInTheDocument();
    expect(screen.getByText("M7 · 250k")).toBeInTheDocument();
  });

  it("stays silent and hides streak chips when hot-streak notifications are off", async () => {
    setPrefs({ liveScoutRefresh: false, notifyOnEnemyHotStreak: false });
    m.scoutPlayer.mockResolvedValue(
      mkScout({
        recentWins: 8,
        recentLosses: 2,
        hotStreak: true,
        pickedChampionMastery: { championId: 103, level: 7, points: 250_000 },
      })
    );
    render(<EnemyScoutPanel db={db} enemySummonerIds={[11]} enemyChampionIds={[103]} />);
    await screen.findByText("80%");

    expect(useToastStore.getState().toasts).toEqual([]);
    expect(speak).not.toHaveBeenCalled();
    expect(screen.queryByText("en racha")).toBeNull();
    // The threat read itself is still shown.
    expect(
      screen.getByText("OTP de Ahri (250k). No pelees el 1v1 temprano; pide jungla.")
    ).toBeInTheDocument();
  });

  it("shows the cold-streak chip and note", async () => {
    m.scoutPlayer.mockResolvedValue(
      mkScout({ recentWins: 2, recentLosses: 3, coldStreak: true })
    );
    render(<EnemyScoutPanel db={db} enemySummonerIds={[11]} enemyChampionIds={[null]} />);
    expect(await screen.findByText("coldstreak")).toBeInTheDocument();
    expect(
      screen.getByText("Bajo de forma (40%). Snowballea tu carril, puede tiltear.")
    ).toBeInTheDocument();
  });

  it("re-scouts when a champion is locked but not on identical re-renders", async () => {
    const { rerender } = render(
      <EnemyScoutPanel db={db} enemySummonerIds={[11]} enemyChampionIds={[null]} />
    );
    await screen.findByText("50%");
    expect(m.scoutPlayer).toHaveBeenCalledTimes(1);

    // New array identities, same content -> effect reruns but skips cached.
    rerender(<EnemyScoutPanel db={db} enemySummonerIds={[11]} enemyChampionIds={[null]} />);
    await flush();
    expect(m.scoutPlayer).toHaveBeenCalledTimes(1);

    rerender(<EnemyScoutPanel db={db} enemySummonerIds={[11]} enemyChampionIds={[103]} />);
    await flush();
    expect(m.scoutPlayer).toHaveBeenCalledTimes(2);
    expect(m.scoutPlayer).toHaveBeenLastCalledWith(CFG, "puuid-11", 103);
  });

  it("live refresh picks up a Riot config saved mid champ-select, and stops on unmount", async () => {
    vi.useFakeTimers();
    setPrefs({ liveScoutRefresh: true, notifyOnEnemyHotStreak: false });
    m.loadSettings.mockResolvedValueOnce(null).mockResolvedValue(CFG);

    const { unmount } = render(
      <EnemyScoutPanel db={db} enemySummonerIds={[11]} enemyChampionIds={[null]} />
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText("Scout slot 1...")).toBeInTheDocument();
    expect(m.scoutPlayer).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(m.scoutPlayer).toHaveBeenCalledTimes(1);
    expect(screen.getByText("50%")).toBeInTheDocument();

    // Next tick: already scouted -> skipped.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(m.loadSettings).toHaveBeenCalledTimes(3);
    expect(m.scoutPlayer).toHaveBeenCalledTimes(1);

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180_000);
    });
    expect(m.loadSettings).toHaveBeenCalledTimes(3);
  });

  // A slot that failed once (Riot 429, LCU hiccup) is retried on the next 60s
  // tick; loaded slots stay skipped (covered above).
  it("live refresh retries a slot that previously failed", async () => {
    vi.useFakeTimers();
    setPrefs({ liveScoutRefresh: true, notifyOnEnemyHotStreak: false });
    m.scoutPlayer.mockRejectedValueOnce(new Error("429")).mockResolvedValue(mkScout());

    render(<EnemyScoutPanel db={db} enemySummonerIds={[11]} enemyChampionIds={[null]} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText("Slot 1: sin datos")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(m.scoutPlayer).toHaveBeenCalledTimes(2);
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("does not poll when live refresh is off", async () => {
    vi.useFakeTimers();
    render(<EnemyScoutPanel db={db} enemySummonerIds={[11]} enemyChampionIds={[null]} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180_000);
    });
    expect(m.loadSettings).toHaveBeenCalledTimes(1);
  });
});
