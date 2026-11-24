// SimpleDraftView: the three-step main screen (ban / pick / buy). Locks what
// each step shows and its plain-language empty states.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { SimpleDraftView } from "./SimpleDraftView";
import type { ChampionDb } from "../types/champion";
import type { ScoredSuggestion } from "../engine/suggestionEngine";
import { suggestBans } from "../engine/banEngine";

vi.mock("../engine/banEngine", () => ({ suggestBans: vi.fn(() => []) }));
vi.mock("../services/matchRepo", () => ({ personalMatchupsByRole: vi.fn(async () => []) }));
vi.mock("../hooks/useEnemyMains", () => ({ useEnemyMains: () => [] }));
vi.mock("../services/opggBuilds", () => ({
  fetchOpggBuild: vi.fn(async () => null),
  topBuild: vi.fn(),
}));
vi.mock("../state/autoActions", () => ({
  pickAutoRunePage: vi.fn(async () => null),
  pickAutoSpells: vi.fn(async () => null),
}));
vi.mock("../services/lcuService", () => ({ applyRunesResult: vi.fn(), applySummonerSpells: vi.fn() }));
vi.mock("./build/MatchupBuildCard", () => ({
  MatchupBuildCard: (p: { championDdId: string; enemyKeys: string[]; knownOpponentKey?: string | null }) => (
    <div data-testid="matchup-card">{`${p.championDdId}|${p.enemyKeys.join(",")}|${p.knownOpponentKey ?? ""}`}</div>
  ),
  // Zed (238) is the guessed mid laner; nobody else is.
  laneOpponentKey: (_db: unknown, role: string, keys: string[]) =>
    role === "MIDDLE" && keys.includes("238") ? "238" : null,
}));

const champ = (key: string, id: string, name = id) => ({
  key,
  id,
  name,
  title: "",
  iconUrl: `icon/${id}.png`,
  splashUrl: "",
  tags: [],
  roles: [],
  archetypes: [],
});
const db = {
  patch: "16.1.1",
  champions: { "64": champ("64", "LeeSin", "Lee Sin"), "254": champ("254", "Vi"), "59": champ("59", "JarvanIV", "Jarvan IV"), "238": champ("238", "Zed") },
} as unknown as ChampionDb;

const sug = (key: string, isComfort: boolean, reasons: string[] = []): ScoredSuggestion =>
  ({
    champion: db.champions[key],
    score: 1,
    breakdown: { isComfort },
    reasons,
    color: "good",
  }) as unknown as ScoredSuggestion;

const base = {
  db,
  role: "JUNGLE" as const,
  suggestions: [] as ScoredSuggestion[],
  bannedKeys: [],
  allyKeys: [],
  enemyKeys: [],
  enemySummonerIds: [],
  buildChampionKey: null,
  buildRole: null,
  noLaneMode: false,
  onShowDetails: () => {},
};

beforeEach(() => {
  vi.mocked(suggestBans).mockReset().mockReturnValue([]);
  // Test env has no localStorage: an in-memory one, tour already seen.
  const mem = new Map<string, string>([["draftboard.simpleTourSeen", "1"]]);
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  });
});

describe("SimpleDraftView", () => {
  it("pick step: champions you know come first, the first one is the best option", () => {
    render(
      <SimpleDraftView
        {...base}
        suggestions={[sug("59", false), sug("64", true, ["suggestions.reason.main"]), sug("254", true)]}
      />
    );
    const pick = screen.getByRole("region", { name: "Elige" });
    const names = [...pick.querySelectorAll("p.font-semibold")].map((n) => n.textContent);
    expect(names).toEqual(["Lee Sin", "Vi", "Jarvan IV"]);
    expect(within(pick).getByText("Mejor opción")).toBeInTheDocument();
    expect(within(pick).getByText("Lo dominas")).toBeInTheDocument();
    expect(within(pick).getByText("Menos práctica")).toBeInTheDocument();
    expect(within(pick).getByText("tu main")).toBeInTheDocument();
  });

  // Tester 24/11: say how each pick does against the lane rival, by name.
  it("names the lane rival and the matchup once they picked", () => {
    const withLane = (s: ScoredSuggestion, winRate: number, reasons: string[]) =>
      ({ ...s, reasons, breakdown: { ...s.breakdown, lane: { opponentKey: "238", winRate } } }) as ScoredSuggestion;
    render(
      <SimpleDraftView
        {...base}
        suggestions={[
          withLane(sug("64", true), 0.54, ["suggestions.reason.counters", "suggestions.reason.main"]),
          withLane(sug("254", true), 0.46, ["suggestions.reason.hardMatchup", "suggestions.reason.synergy"]),
        ]}
      />
    );
    const pick = screen.getByRole("region", { name: "Elige" });
    expect(within(pick).getByText("contra Zed ganas 54 de cada 100 · tu main")).toBeInTheDocument();
    expect(within(pick).getByText("⚠ contra Zed cuesta: 46 de cada 100 · combina bien con tu equipo")).toBeInTheDocument();
  });

  // Rafael 24/11: team mode — the group's style first, then your champions.
  it("team mode: picks that fit the style come first and say so", () => {
    const withKinds = (s: ScoredSuggestion, ...archetypes: string[]) =>
      ({ ...s, champion: { ...s.champion, archetypes } }) as ScoredSuggestion;
    render(
      <SimpleDraftView
        {...base}
        teamStyle="engage"
        suggestions={[
          withKinds(sug("64", true), "burst"),
          withKinds(sug("254", false), "engage"),
          withKinds(sug("59", true), "engage", "frontline"),
          withKinds(sug("238", false), "burst"),
        ]}
      />
    );
    const pick = screen.getByRole("region", { name: "Elige" });
    const names = [...pick.querySelectorAll("p.font-semibold")].map((n) => n.textContent);
    expect(names).toEqual(["Jarvan IV", "Vi", "Lee Sin"]);
    expect(within(pick).getByText("Encaja con Engage")).toBeInTheDocument();
  });

  it("pick step: the ideal pick for this game takes the last slot, labelled, even when your champions fill it", () => {
    const bestForGame = sug("238", false, ["suggestions.reason.bestForDraft", "suggestions.reason.counters"]);
    render(
      <SimpleDraftView
        {...base}
        suggestions={[sug("64", true), sug("254", true), sug("59", true), bestForGame]}
      />
    );
    const pick = screen.getByRole("region", { name: "Elige" });
    const names = [...pick.querySelectorAll("p.font-semibold")].map((n) => n.textContent);
    expect(names).toEqual(["Lee Sin", "Vi", "Zed"]);
    expect(within(pick).getByText("Mejor para esta partida")).toBeInTheDocument();
    expect(within(pick).getByText(/encaja mejor en esta partida, aunque no lo juegas/)).toBeInTheDocument();
  });

  it("pick step: your win rate on a champion reads in plain words", () => {
    render(<SimpleDraftView {...base} suggestions={[sug("64", true, ["WR 63%"])]} />);
    expect(within(screen.getByRole("region", { name: "Elige" })).getByText(/ganas 63 de cada 100 con él/)).toBeInTheDocument();
  });

  it("ban step: shows up to three bans with their reason, and asks for a role without one", () => {
    vi.mocked(suggestBans).mockReturnValue([
      { championKey: "238", championName: "Zed", iconUrl: "icon/Zed.png", reason: "Pierdes mucho contra él", severity: "high", source: "personal" },
    ]);
    const { rerender } = render(<SimpleDraftView {...base} />);
    const ban = screen.getByRole("region", { name: "Banea" });
    expect(within(ban).getByText("Zed")).toBeInTheDocument();
    expect(within(ban).getByText("Pierdes mucho contra él")).toBeInTheDocument();
    // Asks for spares so picks can be filtered out and three still remain.
    const calls = vi.mocked(suggestBans).mock.calls;
    expect(calls[calls.length - 1][0].limit).toBe(6);

    rerender(<SimpleDraftView {...base} role={null} />);
    expect(within(screen.getByRole("region", { name: "Banea" })).queryByText("Zed")).toBeNull();
  });

  it("never suggests banning a champion it suggests picking", () => {
    vi.mocked(suggestBans).mockReturnValue([
      { championKey: "64", championName: "Lee Sin", iconUrl: "", reason: "fuerte", severity: "high", source: "global" },
      { championKey: "238", championName: "Zed", iconUrl: "", reason: "fuerte", severity: "high", source: "global" },
    ]);
    render(<SimpleDraftView {...base} suggestions={[sug("64", true)]} />);
    const ban = screen.getByRole("region", { name: "Banea" });
    expect(within(ban).queryByText("Lee Sin")).toBeNull();
    expect(within(ban).getByText("Zed")).toBeInTheDocument();
  });

  it("ban reasons are plain numbers, no tier or win-rate jargon", () => {
    vi.mocked(suggestBans).mockReturnValue([
      { championKey: "238", championName: "Zed", iconUrl: "", reason: "Pierdes 75% vs él en JUNGLE (4g)", severity: "high", source: "personal", personalGames: 4, personalWinRate: 0.25 },
      { championKey: "254", championName: "Vi", iconUrl: "", reason: "S-tier en JUNGLE (53% global)", severity: "medium", source: "global", globalWinRate: 0.53 },
      { championKey: "59", championName: "Jarvan IV", iconUrl: "", reason: "Main enemigo: 400k maestría", severity: "high", source: "scout" },
    ]);
    render(<SimpleDraftView {...base} />);
    const ban = screen.getByRole("region", { name: "Banea" });
    expect(within(ban).getByText("Pierdes mucho contra él: 3 de 4 partidas.")).toBeInTheDocument();
    expect(within(ban).getByText("Muy fuerte ahora mismo: gana 53 de cada 100 partidas.")).toBeInTheDocument();
    expect(within(ban).getByText("Un rival lo juega muchísimo. Quítaselo.")).toBeInTheDocument();
    expect(ban.textContent).not.toMatch(/S-tier|global|maestría/);
  });

  it("pick reasons use the plain wording", () => {
    render(<SimpleDraftView {...base} suggestions={[sug("64", true, ["suggestions.reason.strongMeta", "suggestions.reason.hardMatchup"])]} />);
    expect(screen.getByText("muy fuerte ahora mismo · ⚠ rival difícil en tu línea")).toBeInTheDocument();
  });

  it("no bans in ARAM / Arena", () => {
    vi.mocked(suggestBans).mockReturnValue([
      { championKey: "238", championName: "Zed", iconUrl: "", reason: "x", severity: "high", source: "personal" },
    ]);
    render(<SimpleDraftView {...base} noLaneMode />);
    expect(screen.getByText("En este modo no hay baneos.")).toBeInTheDocument();
    expect(screen.queryByText("Zed")).toBeNull();
  });

  it("buy step: empty hint until there is a champion, then the matchup plan for it", () => {
    const { rerender } = render(<SimpleDraftView {...base} />);
    expect(screen.getByText("Marca o fija un campeón y aquí sale qué comprar.")).toBeInTheDocument();
    rerender(<SimpleDraftView {...base} buildChampionKey="64" buildRole="JUNGLE" enemyKeys={["238"]} />);
    expect(screen.getByText("Con Lee Sin")).toBeInTheDocument();
    expect(screen.getByTestId("matchup-card")).toHaveTextContent("LeeSin|238|");
  });

  it("teams strip appears with picks, and 'more details' calls back", () => {
    const onShowDetails = vi.fn();
    render(<SimpleDraftView {...base} allyKeys={["64"]} enemyKeys={["238"]} onShowDetails={onShowDetails} />);
    expect(screen.getByText("Tu equipo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Marcar a Zed como tu rival de línea" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Ver más detalles/ }));
    expect(onShowDetails).toHaveBeenCalledTimes(1);
  });
});

describe("SimpleDraftView — lane opponent, status and tour", () => {
  it("first visit shows the short tour; Entendido hides it for good", () => {
    localStorage.removeItem("draftboard.simpleTourSeen");
    const { unmount } = render(<SimpleDraftView {...base} />);
    fireEvent.click(screen.getByRole("button", { name: "Entendido" }));
    expect(screen.queryByTestId("simple-tour")).not.toBeInTheDocument();
    unmount();
    render(<SimpleDraftView {...base} />);
    expect(screen.queryByTestId("simple-tour")).not.toBeInTheDocument();
  });

  it("status line counts the champions still to pick", () => {
    const { rerender } = render(<SimpleDraftView {...base} allyKeys={["64"]} enemyKeys={["238"]} />);
    expect(screen.getByTestId("simple-status")).toHaveTextContent("Faltan 8 campeones por elegir");
    const ten = ["64", "254", "59", "1", "2"];
    rerender(<SimpleDraftView {...base} allyKeys={ten} enemyKeys={["238", "3", "4", "5", "6"]} />);
    expect(screen.getByTestId("simple-status")).toHaveTextContent("Todos han elegido");
  });

  it("blind note until a lane opponent is known; tapping an enemy marks them", () => {
    const props = { ...base, role: "MIDDLE" as const, suggestions: [sug("64", true)], buildChampionKey: "64", buildRole: "MIDDLE" as const };
    const { rerender } = render(<SimpleDraftView {...props} enemyKeys={["254"]} />);
    expect(screen.getByText(/Aún no sabes contra quién vas/)).toBeInTheDocument();
    rerender(<SimpleDraftView {...props} enemyKeys={["254", "238"]} />);
    expect(screen.queryByText(/Aún no sabes contra quién vas/)).not.toBeInTheDocument();
    expect(screen.getByText(/Tu rival de línea: Zed/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Marcar a Vi como tu rival de línea" }));
    expect(screen.getByText(/Tu rival de línea: Vi/)).toBeInTheDocument();
    expect(screen.getByTestId("matchup-card")).toHaveTextContent("LeeSin|254,238|254");
  });
});
