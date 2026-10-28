// BanSuggestionsPanel: data sources mocked at the module boundary (SQLite
// matchups + Riot-backed enemy mains); the real banEngine ranks them.
//   - No role -> "pick a role" hint, no DB query
//   - Role but nothing to suggest -> "no data" copy
//   - Personal / meta / scout suggestions render with severity badge,
//     source tag and explanatory tooltip
//   - Banned / picked champions are never suggested

import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import type { ChampionDb } from "../types/champion";
import type { PersonalMatchupStat } from "../services/matchRepo";
import type { BanSuggestion, EnemyMain } from "../engine/banEngine";

const matchupsMock = vi.fn<(role: string) => Promise<PersonalMatchupStat[]>>();
vi.mock("../services/matchRepo", () => ({
  personalMatchupsByRole: (role: string) => matchupsMock(role),
}));

let enemyMains: EnemyMain[] = [];
vi.mock("../hooks/useEnemyMains", () => ({
  useEnemyMains: () => enemyMains,
}));

// Pass-through to the real engine; one test overrides it to reach the
// "blend" source, which the current engine never emits.
vi.mock("../engine/banEngine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../engine/banEngine")>();
  return { ...actual, suggestBans: vi.fn(actual.suggestBans) };
});

import { BanSuggestionsPanel } from "./BanSuggestionsPanel";
import { suggestBans } from "../engine/banEngine";

const realSuggestBans = (
  await vi.importActual<typeof import("../engine/banEngine")>("../engine/banEngine")
).suggestBans;

function champ(key: string, name: string) {
  return {
    key,
    id: name,
    name,
    title: "",
    iconUrl: `https://cdn.test/${name}.png`,
    splashUrl: "",
    tags: [],
    roles: ["TOP"],
    archetypes: [],
  };
}

function mkDb(meta: ChampionDb["meta"] = []): ChampionDb {
  return {
    patch: "14.10.1",
    champions: {
      "266": champ("266", "Aatrox"),
      "122": champ("122", "Darius"),
      "222": champ("222", "Jinx"),
    },
    counters: [],
    meta,
    fetchedAt: 0,
  } as ChampionDb;
}

function card(name: string): HTMLElement {
  // The card root carries the tooltip; the name <p> is two levels down.
  return screen.getByText(name).closest("[title]") as HTMLElement;
}

describe("BanSuggestionsPanel", () => {
  beforeEach(() => {
    matchupsMock.mockReset();
    matchupsMock.mockResolvedValue([]);
    enemyMains = [];
    vi.mocked(suggestBans).mockImplementation(realSuggestBans);
  });

  it("asks for a role and skips the matchup query when role is null", () => {
    render(<BanSuggestionsPanel db={mkDb()} role={null} bannedKeys={[]} pickedKeys={[]} />);
    expect(screen.getByText("Bans sugeridos")).toBeInTheDocument();
    expect(screen.getByText("Selecciona tu rol para ver bans.")).toBeInTheDocument();
    expect(matchupsMock).not.toHaveBeenCalled();
  });

  it("shows the no-data copy for a role with nothing to suggest", async () => {
    render(<BanSuggestionsPanel db={mkDb()} role="TOP" bannedKeys={[]} pickedKeys={[]} />);
    expect(await screen.findByText("Sin datos suficientes en TOP aún.")).toBeInTheDocument();
    expect(matchupsMock).toHaveBeenCalledWith("TOP");
    // Role shown as header subtitle.
    expect(screen.getByText("TOP")).toBeInTheDocument();
  });

  it("renders a personal nightmare matchup as a high-severity 'tú' ban", async () => {
    matchupsMock.mockResolvedValue([
      { position: "TOP", opponentChampionId: 266, games: 5, wins: 1, winRate: 0.2 },
    ]);
    render(<BanSuggestionsPanel db={mkDb()} role="TOP" bannedKeys={[]} pickedKeys={[]} />);

    await screen.findByText("Aatrox");
    const c = card("Aatrox");
    expect(c).toHaveAttribute(
      "title",
      "Personal: Pierdes 20% vs él en TOP (5g). Banearlo elimina tu peor matchup directo."
    );
    expect(within(c).getByText("Pierdes 20% vs él en TOP (5g)")).toBeInTheDocument();
    expect(within(c).getByTitle("Severidad: high")).toHaveTextContent("S+");
    expect(within(c).getByText("tú")).toBeInTheDocument();
    expect(within(c).getByRole("img", { name: "Aatrox" })).toHaveAttribute(
      "src",
      "https://cdn.test/Aatrox.png"
    );
  });

  it("renders global S-tier threats as medium 'meta' bans", async () => {
    const db = mkDb([
      { championKey: "122", role: "TOP", tier: "S", winRate: 0.55, pickRate: 0.1, banRate: 0.1 },
    ]);
    render(<BanSuggestionsPanel db={db} role="TOP" bannedKeys={[]} pickedKeys={[]} />);

    await screen.findByText("Darius");
    const c = card("Darius");
    expect(c).toHaveAttribute(
      "title",
      "Meta: S-tier en TOP (55% global). Threat alto que ningún jugador quiere enfrentar."
    );
    expect(within(c).getByTitle("Severidad: medium")).toHaveTextContent(/^S$/);
    expect(within(c).getByText("meta")).toBeInTheDocument();
  });

  it("renders a scouted enemy main as a 'rival' ban", async () => {
    enemyMains = [{ championId: 222, points: 120_000, summonerName: "Foo" }];
    render(
      <BanSuggestionsPanel
        db={mkDb()}
        role="BOTTOM"
        bannedKeys={[]}
        pickedKeys={[]}
        enemySummonerIds={[11, 0]}
      />
    );

    await screen.findByText("Jinx");
    const c = card("Jinx");
    expect(c).toHaveAttribute(
      "title",
      "Scout: Main enemigo (Foo): 120k maestría. Niega el pick cómodo del rival."
    );
    expect(within(c).getByTitle("Severidad: low")).toHaveTextContent("A");
    expect(within(c).getByText("rival")).toBeInTheDocument();
  });

  it("never suggests a champion that is already banned or picked", async () => {
    matchupsMock.mockResolvedValue([
      { position: "TOP", opponentChampionId: 266, games: 5, wins: 1, winRate: 0.2 },
      { position: "TOP", opponentChampionId: 122, games: 4, wins: 1, winRate: 0.25 },
    ]);
    enemyMains = [{ championId: 222, points: 400_000 }];
    render(
      <BanSuggestionsPanel
        db={mkDb()}
        role="TOP"
        bannedKeys={["266"]}
        pickedKeys={["222"]}
        enemySummonerIds={[11]}
      />
    );

    expect(await screen.findByText("Darius")).toBeInTheDocument();
    expect(screen.queryByText("Aatrox")).toBeNull();
    expect(screen.queryByText("Jinx")).toBeNull();
  });

  it("uses the combined tooltip and 'meta' tag for blend suggestions", async () => {
    const blend: BanSuggestion = {
      championKey: "266",
      championName: "Aatrox",
      iconUrl: "https://cdn.test/Aatrox.png",
      reason: "motivo",
      severity: "medium",
      source: "blend",
    };
    vi.mocked(suggestBans).mockReturnValue([blend]);
    render(<BanSuggestionsPanel db={mkDb()} role="TOP" bannedKeys={[]} pickedKeys={[]} />);
    await act(async () => {}); // let the matchup promise settle

    const c = card("Aatrox");
    expect(c).toHaveAttribute("title", "Combinado: motivo. Threat global + dolor personal.");
    expect(within(c).getByText("meta")).toBeInTheDocument();
  });

  it("drops back to the role hint when the role is cleared", async () => {
    matchupsMock.mockResolvedValue([
      { position: "TOP", opponentChampionId: 266, games: 5, wins: 1, winRate: 0.2 },
    ]);
    const { rerender } = render(
      <BanSuggestionsPanel db={mkDb()} role="TOP" bannedKeys={[]} pickedKeys={[]} />
    );
    await screen.findByText("Aatrox");

    rerender(<BanSuggestionsPanel db={mkDb()} role={null} bannedKeys={[]} pickedKeys={[]} />);
    expect(screen.getByText("Selecciona tu rol para ver bans.")).toBeInTheDocument();
    expect(screen.queryByText("Aatrox")).toBeNull();
  });
});
