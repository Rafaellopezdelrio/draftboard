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
import { useDraftStore } from "../state/draftStore";
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

  it("starts collapsed with the team verdict in the header and expands on click", async () => {
    localStorage.removeItem("panel-open:enemyScout");
    const user = userEvent.setup();
    render(
      <EnemyScoutPanel db={db} enemySummonerIds={[11, 0, 22, 0, 0]} enemyChampionIds={[]} />
    );
    await flush();
    const header = screen.getByRole("button", { name: /Scout enemigos/ });
    expect(header).toHaveAttribute("aria-expanded", "false");
    // Once scouted, the collapsed header carries the team verdict.
    expect(within(header).getByText("Sin amenazas claras — ejecuta tu plan.")).toBeInTheDocument();
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

  // Regression: a forced run aborted by a same-slots re-run (pref flip) must
  // leave the snapshot behind so the replacement run forces too; otherwise
  // enemy 2 keeps its champion-less scout.
  it("a forced re-scout cut short by a pref flip still re-scouts the enemy whose champion changed", async () => {
    const { rerender } = render(
      <EnemyScoutPanel db={db} enemySummonerIds={[11, 22]} enemyChampionIds={[null, null]} />
    );
    await flush();
    expect(m.scoutPlayer).toHaveBeenCalledTimes(2);

    // Enemy 2 locks Ahri; the forced run starts on enemy 1 and is still pending there.
    m.scoutPlayer.mockImplementationOnce(() => new Promise<ScoutResult>(() => {}));
    rerender(
      <EnemyScoutPanel db={db} enemySummonerIds={[11, 22]} enemyChampionIds={[null, 103]} />
    );
    await flush();
    expect(m.scoutPlayer).toHaveBeenLastCalledWith(CFG, "puuid-11", undefined);

    // A pref flips mid-run: the effect re-runs and the forced run goes stale.
    act(() => setPrefs({ liveScoutRefresh: false, notifyOnEnemyHotStreak: false }));
    await flush();
    expect(m.scoutPlayer).toHaveBeenCalledWith(CFG, "puuid-22", 103);
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

// Anonymized ranked champ select leaves every enemy summonerId at 0; from the
// loading screen on, enemies arrive as PUUID targets (spectator-v5).
describe("EnemyScoutPanel - loading-screen targets (anonymized select)", () => {
  const ZERO = [0, 0, 0, 0, 0];
  const NO_CHAMPS = [null, null, null, null, null];

  beforeEach(() => {
    stubLocalStorage();
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

  it("renders nothing when ids are all 0 and the target list is empty", async () => {
    const { container } = render(
      <EnemyScoutPanel db={db} enemySummonerIds={ZERO} enemyChampionIds={NO_CHAMPS} enemyScoutTargets={[]} />
    );
    await flush();
    expect(container).toBeEmptyDOMElement();
    expect(m.loadSettings).not.toHaveBeenCalled();
  });

  it("scouts each target by puuid with its own championId, never via the LCU, and renders cards + verdict", async () => {
    m.scoutPlayer.mockImplementation(async (_cfg: unknown, puuid: string) =>
      puuid === "pu-a"
        ? mkScout({
            recentWins: 7,
            recentLosses: 3,
            mainChampionId: 266,
            pickedChampionMastery: { championId: 266, level: 7, points: 150_000 },
          })
        : mkScout({ rank: null, lp: null, recentWins: 2, recentLosses: 3 })
    );
    render(
      <EnemyScoutPanel
        db={db}
        enemySummonerIds={ZERO}
        // Champ-select champion ids are ignored in target mode: the target's
        // own championId (from the game) is what gets scouted.
        enemyChampionIds={[103, 103, null, null, null]}
        enemyScoutTargets={[
          { puuid: "pu-a", championId: 266 },
          { puuid: "pu-b", championId: null },
        ]}
      />
    );

    expect(await screen.findByText("70%")).toBeInTheDocument();
    await screen.findByText("40%");

    expect(m.getSummonerById).not.toHaveBeenCalled();
    expect(m.scoutPlayer).toHaveBeenCalledTimes(2);
    expect(m.scoutPlayer).toHaveBeenCalledWith(CFG, "pu-a", 266);
    expect(m.scoutPlayer).toHaveBeenCalledWith(CFG, "pu-b", undefined);

    // One slot per target; the five zero ids don't render "empty" rows.
    expect(screen.queryByText(/vacío/)).toBeNull();
    expect(screen.getByText("Juega su main (Aatrox). Respeta sus picks de poder.")).toBeInTheDocument();
    expect(screen.getByText("Oponente estándar. Ejecuta tu plan de carril.")).toBeInTheDocument();
    // Panel open: verdict in the body only (header summary is collapsed-only).
    expect(screen.getAllByText("1 amenaza: juega seguro y coordina vs ellos.")).toHaveLength(1);
    expect(speak).toHaveBeenCalledWith(
      "Amenaza: Juega su main (Aatrox). Respeta sus picks de poder.",
      "threat-pu-a"
    );
  });

  // User report (01/11): as a jungler the notes and the spoken alert gave
  // lane advice ("Ejecuta tu plan de carril") for every enemy.
  it("as a jungler: gank advice for laners, invade advice for the Smite user, spoken too", async () => {
    useDraftStore.setState({ myRole: "JUNGLE" });
    try {
      m.scoutPlayer.mockImplementation(async (_cfg: unknown, puuid: string) =>
        puuid === "pu-jg"
          ? mkScout({
              recentWins: 7,
              recentLosses: 3,
              mainChampionId: 266,
              pickedChampionMastery: { championId: 266, level: 7, points: 150_000 },
            })
          : mkScout({ rank: null, lp: null, recentWins: 2, recentLosses: 3 })
      );
      render(
        <EnemyScoutPanel
          db={db}
          enemySummonerIds={ZERO}
          enemyChampionIds={NO_CHAMPS}
          enemyScoutTargets={[
            { puuid: "pu-jg", championId: 266, hasSmite: true },
            { puuid: "pu-top", championId: null, hasSmite: false },
          ]}
        />
      );
      await screen.findByText("70%");
      await screen.findByText("40%");
      expect(
        screen.getByText("Jungla rival con su main (Aatrox). Respeta sus momentos fuertes y sigue su ruta.")
      ).toBeInTheDocument();
      expect(screen.getByText("Rival normal. Ve a por él según cómo vaya su línea.")).toBeInTheDocument();
      expect(screen.queryByText(/tu carril|pide jungla/)).toBeNull();
      expect(speak).toHaveBeenCalledWith(
        "Amenaza: Jungla rival con su main (Aatrox). Respeta sus momentos fuertes y sigue su ruta.",
        "threat-pu-jg"
      );
    } finally {
      useDraftStore.setState({ myRole: null });
    }
  });

  it("shows the verdict in the collapsed header in target mode", async () => {
    localStorage.removeItem("panel-open:enemyScout");
    render(
      <EnemyScoutPanel
        db={db}
        enemySummonerIds={ZERO}
        enemyChampionIds={NO_CHAMPS}
        enemyScoutTargets={[{ puuid: "pu-a", championId: null }]}
      />
    );
    await flush();
    const header = screen.getByRole("button", { name: /Scout enemigos/ });
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(within(header).getByText("Sin amenazas claras — ejecuta tu plan.")).toBeInTheDocument();
  });

  it("shows the filled count in the header while target scouts are still pending", async () => {
    localStorage.removeItem("panel-open:enemyScout");
    m.loadSettings.mockResolvedValue(null); // no Riot config -> nothing loads
    render(
      <EnemyScoutPanel
        db={db}
        enemySummonerIds={ZERO}
        enemyChampionIds={NO_CHAMPS}
        enemyScoutTargets={[
          { puuid: "pu-a", championId: null },
          { puuid: "pu-b", championId: null },
          { puuid: "pu-c", championId: null },
        ]}
      />
    );
    await flush();
    const header = screen.getByRole("button", { name: /Scout enemigos/ });
    expect(within(header).getByText("3/5")).toBeInTheDocument();
    expect(m.scoutPlayer).not.toHaveBeenCalled();
  });

  it("marks a target slot as error when its scout throws, keeping the others", async () => {
    m.scoutPlayer.mockImplementation(async (_cfg: unknown, puuid: string) => {
      if (puuid === "pu-a") throw new Error("429");
      return mkScout();
    });
    render(
      <EnemyScoutPanel
        db={db}
        enemySummonerIds={ZERO}
        enemyChampionIds={NO_CHAMPS}
        enemyScoutTargets={[
          { puuid: "pu-a", championId: null },
          { puuid: "pu-b", championId: null },
        ]}
      />
    );
    expect(await screen.findByText("Slot 1: sin datos")).toBeInTheDocument();
    expect(await screen.findByText("50%")).toBeInTheDocument();
    expect(m.getSummonerById).not.toHaveBeenCalled();
  });

  it("gives precedence to real summonerIds over targets", async () => {
    render(
      <EnemyScoutPanel
        db={db}
        enemySummonerIds={[11, 0, 0, 0, 0]}
        enemyChampionIds={[103, null, null, null, null]}
        enemyScoutTargets={[{ puuid: "pu-a", championId: 266 }]}
      />
    );
    expect(await screen.findByText("50%")).toBeInTheDocument();
    expect(m.getSummonerById).toHaveBeenCalledTimes(1);
    expect(m.getSummonerById).toHaveBeenCalledWith(11);
    expect(m.scoutPlayer).toHaveBeenCalledTimes(1);
    expect(m.scoutPlayer).toHaveBeenCalledWith(CFG, "puuid-11", 103);
    // Summoner-id mode keeps the five positional rows.
    expect(screen.getByText("Slot 2 vacío")).toBeInTheDocument();
    expect(screen.getByText("Slot 5 vacío")).toBeInTheDocument();
  });

  it("re-scouts when the target list changes, not on an identical new array", async () => {
    const { rerender } = render(
      <EnemyScoutPanel
        db={db}
        enemySummonerIds={ZERO}
        enemyChampionIds={NO_CHAMPS}
        enemyScoutTargets={[{ puuid: "pu-a", championId: null }]}
      />
    );
    await screen.findByText("50%");
    expect(m.scoutPlayer).toHaveBeenCalledTimes(1);

    // Same content, new identities (parent re-render with a fresh array).
    rerender(
      <EnemyScoutPanel
        db={db}
        enemySummonerIds={[...ZERO]}
        enemyChampionIds={[...NO_CHAMPS]}
        enemyScoutTargets={[{ puuid: "pu-a", championId: null }]}
      />
    );
    await flush();
    expect(m.scoutPlayer).toHaveBeenCalledTimes(1);

    // New target list: champion now known + a second enemy appears.
    rerender(
      <EnemyScoutPanel
        db={db}
        enemySummonerIds={ZERO}
        enemyChampionIds={NO_CHAMPS}
        enemyScoutTargets={[
          { puuid: "pu-a", championId: 103 },
          { puuid: "pu-b", championId: 266 },
        ]}
      />
    );
    await flush();
    expect(m.scoutPlayer).toHaveBeenCalledTimes(3);
    expect(m.scoutPlayer).toHaveBeenCalledWith(CFG, "pu-a", 103);
    expect(m.scoutPlayer).toHaveBeenCalledWith(CFG, "pu-b", 266);
    expect(screen.getAllByText("50%")).toHaveLength(2);
    expect(m.getSummonerById).not.toHaveBeenCalled();
  });

  it("re-scouts a target when only its championId becomes known", async () => {
    const { rerender } = render(
      <EnemyScoutPanel
        db={db}
        enemySummonerIds={ZERO}
        enemyChampionIds={NO_CHAMPS}
        enemyScoutTargets={[{ puuid: "pu-a", championId: null }]}
      />
    );
    await screen.findByText("50%");
    expect(m.scoutPlayer).toHaveBeenCalledTimes(1);

    rerender(
      <EnemyScoutPanel
        db={db}
        enemySummonerIds={ZERO}
        enemyChampionIds={NO_CHAMPS}
        enemyScoutTargets={[{ puuid: "pu-a", championId: 103 }]}
      />
    );
    await flush();
    expect(m.scoutPlayer).toHaveBeenCalledTimes(2);
    expect(m.scoutPlayer).toHaveBeenLastCalledWith(CFG, "pu-a", 103);
  });

  it("switches from summonerId slots to targets when the ids drop to 0", async () => {
    const { rerender } = render(
      <EnemyScoutPanel
        db={db}
        enemySummonerIds={[11]}
        enemyChampionIds={[null]}
        enemyScoutTargets={[{ puuid: "pu-a", championId: 266 }]}
      />
    );
    await screen.findByText("50%");
    expect(m.scoutPlayer).toHaveBeenCalledWith(CFG, "puuid-11", undefined);

    rerender(
      <EnemyScoutPanel
        db={db}
        enemySummonerIds={[0]}
        enemyChampionIds={[null]}
        enemyScoutTargets={[{ puuid: "pu-a", championId: 266 }]}
      />
    );
    await flush();
    expect(m.scoutPlayer).toHaveBeenCalledTimes(2);
    expect(m.scoutPlayer).toHaveBeenLastCalledWith(CFG, "pu-a", 266);
  });

  it("keeps voice dedupe keys distinct per enemy and toasts once per hot enemy", async () => {
    m.scoutPlayer.mockResolvedValue(
      mkScout({ recentWins: 8, recentLosses: 2, hotStreak: true, pickedChampionMastery: null })
    );
    render(
      <EnemyScoutPanel
        db={db}
        enemySummonerIds={ZERO}
        enemyChampionIds={NO_CHAMPS}
        enemyScoutTargets={[
          { puuid: "pu-a", championId: 103 },
          { puuid: "pu-b", championId: 266 },
        ]}
      />
    );
    await screen.findAllByText("80%");
    await flush();

    const keys = speak.mock.calls.map((c) => c[1] as string);
    expect(keys.filter((k) => k.startsWith("hot-"))).toEqual(["hot-pu-a", "hot-pu-b"]);
    expect(new Set(keys).size).toBe(keys.length);
    expect(speak).toHaveBeenCalledWith("Cuidado, enemigo en racha con Ahri", "hot-pu-a");
    expect(speak).toHaveBeenCalledWith("Cuidado, enemigo en racha con Aatrox", "hot-pu-b");
    expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual([
      "🔥 Enemigo en racha (GOLD II) con Ahri",
      "🔥 Enemigo en racha (GOLD II) con Aatrox",
    ]);
  });

  // Regression: a scout run superseded by new slots (a target's champion
  // becomes known, the next game's targets land, a pref flips) must not write.
  // Before the stale guard, the older, champion-less result resolving late
  // overwrote scouts["ppu-a"] (card flipped 70% -> 20%, picked-champ mastery
  // and threat read lost) and fired its own toast/voice.
  it("keeps the latest scout when an older in-flight scout for the same enemy resolves late", async () => {
    let resolveOld!: (r: ScoutResult) => void;
    m.scoutPlayer
      .mockImplementationOnce(() => new Promise<ScoutResult>((r) => (resolveOld = r)))
      .mockResolvedValueOnce(
        mkScout({
          recentWins: 7,
          recentLosses: 3,
          pickedChampionMastery: { championId: 103, level: 7, points: 150_000 },
        })
      );
    const { rerender } = render(
      <EnemyScoutPanel
        db={db}
        enemySummonerIds={ZERO}
        enemyChampionIds={NO_CHAMPS}
        enemyScoutTargets={[{ puuid: "pu-a", championId: null }]}
      />
    );
    await flush();
    rerender(
      <EnemyScoutPanel
        db={db}
        enemySummonerIds={ZERO}
        enemyChampionIds={NO_CHAMPS}
        enemyScoutTargets={[{ puuid: "pu-a", championId: 103 }]}
      />
    );
    expect(await screen.findByText("70%")).toBeInTheDocument();
    expect(m.scoutPlayer).toHaveBeenLastCalledWith(CFG, "pu-a", 103);
    const toastsBefore = useToastStore.getState().toasts.length;
    const speaksBefore = speak.mock.calls.length;

    // The stale result is a hot streak: it would toast + speak if it wrote.
    await act(async () => resolveOld(mkScout({ recentWins: 1, recentLosses: 4, hotStreak: true })));
    expect(screen.getByText("70%")).toBeInTheDocument();
    expect(screen.queryByText("20%")).toBeNull();
    expect(useToastStore.getState().toasts).toHaveLength(toastsBefore);
    expect(speak).toHaveBeenCalledTimes(speaksBefore);
  });

  it("fires no toast or voice when unmounted while a scout is in flight", async () => {
    let resolveScout!: (r: ScoutResult) => void;
    m.scoutPlayer.mockImplementation(() => new Promise<ScoutResult>((r) => (resolveScout = r)));
    const { unmount } = render(
      <EnemyScoutPanel
        db={db}
        enemySummonerIds={ZERO}
        enemyChampionIds={NO_CHAMPS}
        enemyScoutTargets={[
          { puuid: "pu-a", championId: 103 },
          { puuid: "pu-b", championId: 266 },
        ]}
      />
    );
    await flush();
    expect(m.scoutPlayer).toHaveBeenCalledTimes(1);
    unmount();

    // Hot-streak one-trick on the picked champ: toast + streak voice + danger voice if written.
    await act(async () =>
      resolveScout(
        mkScout({
          recentWins: 8,
          recentLosses: 2,
          hotStreak: true,
          mainChampionId: 103,
          pickedChampionMastery: { championId: 103, level: 7, points: 250_000 },
        })
      )
    );
    await flush();
    expect(useToastStore.getState().toasts).toEqual([]);
    expect(speak).not.toHaveBeenCalled();
    // The loop stopped: the second enemy was never scouted.
    expect(m.scoutPlayer).toHaveBeenCalledTimes(1);
  });

  it("keeps the latest scout when an older in-flight scout for the same enemy fails late", async () => {
    let rejectOld!: (e: Error) => void;
    m.scoutPlayer
      .mockImplementationOnce(() => new Promise<ScoutResult>((_r, rej) => (rejectOld = rej)))
      .mockResolvedValueOnce(mkScout({ recentWins: 7, recentLosses: 3 }));
    const { rerender } = render(
      <EnemyScoutPanel
        db={db}
        enemySummonerIds={ZERO}
        enemyChampionIds={NO_CHAMPS}
        enemyScoutTargets={[{ puuid: "pu-a", championId: null }]}
      />
    );
    await flush();
    rerender(
      <EnemyScoutPanel
        db={db}
        enemySummonerIds={ZERO}
        enemyChampionIds={NO_CHAMPS}
        enemyScoutTargets={[{ puuid: "pu-a", championId: 103 }]}
      />
    );
    expect(await screen.findByText("70%")).toBeInTheDocument();

    await act(async () => rejectOld(new Error("429")));
    expect(screen.getByText("70%")).toBeInTheDocument();
    expect(screen.queryByText("Slot 1: sin datos")).toBeNull();
  });

  it("makes no scout call when unmounted before the settings load resolves", async () => {
    let resolveCfg!: (c: typeof CFG) => void;
    m.loadSettings.mockImplementationOnce(() => new Promise((r) => (resolveCfg = r)));
    const { unmount } = render(
      <EnemyScoutPanel
        db={db}
        enemySummonerIds={ZERO}
        enemyChampionIds={NO_CHAMPS}
        enemyScoutTargets={[{ puuid: "pu-a", championId: 103 }]}
      />
    );
    await flush();
    unmount();
    await act(async () => resolveCfg(CFG));
    await flush();
    expect(m.scoutPlayer).not.toHaveBeenCalled();
  });

  it("makes no scout call when unmounted while the LCU summoner lookup is pending", async () => {
    let resolveSummoner!: (s: { puuid: string }) => void;
    m.getSummonerById.mockImplementationOnce(() => new Promise((r) => (resolveSummoner = r)));
    const { unmount } = render(
      <EnemyScoutPanel db={db} enemySummonerIds={[11]} enemyChampionIds={[103]} />
    );
    await flush();
    expect(m.getSummonerById).toHaveBeenCalledWith(11);
    unmount();
    await act(async () => resolveSummoner({ puuid: "puuid-11" }));
    await flush();
    expect(m.scoutPlayer).not.toHaveBeenCalled();
  });
});
