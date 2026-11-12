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
  MatchupBuildCard: (p: { championDdId: string; enemyKeys: string[] }) => (
    <div data-testid="matchup-card">{`${p.championDdId}|${p.enemyKeys.join(",")}`}</div>
  ),
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

beforeEach(() => vi.mocked(suggestBans).mockReset().mockReturnValue([]));

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
    expect(screen.getByTestId("matchup-card")).toHaveTextContent("LeeSin|238");
  });

  it("teams strip appears with picks, and 'more details' calls back", () => {
    const onShowDetails = vi.fn();
    render(<SimpleDraftView {...base} allyKeys={["64"]} enemyKeys={["238"]} onShowDetails={onShowDetails} />);
    expect(screen.getByText("Tu equipo")).toBeInTheDocument();
    expect(screen.getByAltText("Zed")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Ver más detalles/ }));
    expect(onShowDetails).toHaveBeenCalledTimes(1);
  });
});
