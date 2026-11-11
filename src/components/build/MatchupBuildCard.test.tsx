// MatchupBuildCard: the build vs the enemy that plays MY role. Locks the
// opponent pick, the "nothing instead of noise" rules, and that a slow answer
// for the previous opponent never paints under the new one.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MatchupBuildCard, laneOpponentKey } from "./MatchupBuildCard";
import { fetchMatchupBuild, type MatchupBuild } from "../../services/opggMatchupBuild";
import type { ChampionDb } from "../../types/champion";

vi.mock("../../services/opggMatchupBuild", () => ({ fetchMatchupBuild: vi.fn() }));
vi.mock("../../services/itemMeta", () => ({
  getItemMeta: () => null,
  subscribeToItemMeta: () => () => {},
}));

const champ = (key: string, id: string, name = id) => ({ key, id, name });
const db = {
  patch: "16.1.1",
  champions: {
    "103": champ("103", "Ahri"),
    "238": champ("238", "Zed"),
    "64": champ("64", "LeeSin", "Lee Sin"),
    "7": champ("7", "Leblanc", "LeBlanc"),
    "157": champ("157", "Yasuo"),
    "84": champ("84", "Akali"),
  },
} as unknown as ChampionDb;

const build = (over: Partial<MatchupBuild> = {}): MatchupBuild => ({
  games: 5700,
  wins: 2800,
  tip: "Guarda el Encanto hasta que Zed use la W.",
  laneAdvantage: "Zed",
  soloKillAdvantage: "Zed",
  playStyle: "even",
  coreItems: [{ ids: [3118, 4645, 3157], names: [], play: 418, win: 227, pickRate: 0.13 }],
  boots: [{ ids: [3020], names: [], play: 2932, win: 1471, pickRate: 0.57 }],
  starterItems: [{ ids: [1056], names: [], play: 5312, win: 2631, pickRate: 0.99 }],
  runes: [
    { primaryStyle: 8100, subStyle: 8200, perks: [8112, 8139, 8140, 8106, 8210, 8226], shards: [], play: 1, win: 1, pickRate: 0.5 },
  ],
  summonerSpells: [],
  ...over,
});

const resp = (b: MatchupBuild | null, opponentName = "Zed") => ({
  champion: "ahri",
  championName: "Ahri",
  role: "mid",
  opponent: "zed",
  opponentName,
  build: b,
});

beforeEach(() => vi.mocked(fetchMatchupBuild).mockReset());

describe("laneOpponentKey", () => {
  it("picks the enemy that plays my role, not the first enemy", () => {
    expect(laneOpponentKey(db, "MIDDLE", ["64", "238"])).toBe("238");
    expect(laneOpponentKey(db, "JUNGLE", ["64", "238"])).toBe("64");
    expect(laneOpponentKey(db, "TOP", ["64", "238"])).toBeNull();
  });
});

describe("MatchupBuildCard", () => {
  it("shows the build, WR and lane read against the lane opponent", async () => {
    vi.mocked(fetchMatchupBuild).mockResolvedValue(resp(build()));
    render(<MatchupBuildCard db={db} championDdId="Ahri" role="MIDDLE" enemyKeys={["64", "238"]} />);
    expect(await screen.findByText("Contra Zed")).toBeInTheDocument();
    expect(fetchMatchupBuild).toHaveBeenCalledWith("Ahri", "MIDDLE", "Zed", "es");
    expect(screen.getByText("49% WR")).toBeInTheDocument();
    expect(screen.getByText("Zed tiene ventaja en línea: juega seguro")).toBeInTheDocument();
    expect(screen.getByText("Guarda el Encanto hasta que Zed use la W.")).toBeInTheDocument();
    const icons = screen.getByTestId("matchup-build").querySelectorAll("img");
    expect([...icons].some((i) => i.getAttribute("src")?.endsWith("/item/3118.png"))).toBe(true);
  });

  it("merges lane and team: team boots and third item, each with its why", async () => {
    vi.mocked(fetchMatchupBuild).mockResolvedValue(resp(build()));
    render(
      <MatchupBuildCard
        db={db}
        championDdId="Ahri"
        role="MIDDLE"
        enemyKeys={["64", "238"]}
        adaptations={[
          { itemId: 3111, itemName: "Mercurio", reason: "mucho control", priority: "core" },
          { itemId: 3165, itemName: "Morello", reason: "curación", priority: "core" },
          { itemId: 2420, itemName: "Cronómetro", reason: "asesinos", priority: "situational" },
        ]}
      />
    );
    await screen.findByText("Contra Zed");
    const src = (slot: string) =>
      screen.getByTestId(`plan-${slot}`).querySelector("img")?.getAttribute("src") ?? "";
    expect(src("first")).toContain("/item/3118.png");
    expect(src("boots")).toContain("/item/3111.png");
    expect(src("second")).toContain("/item/4645.png");
    expect(src("third")).toContain("/item/3165.png");
    expect(screen.getByTestId("plan-first")).toHaveTextContent("por Zed");
    expect(screen.getByTestId("plan-boots")).toHaveTextContent("por su equipo: mucho control");
    expect(screen.getByTestId("plan-third")).toHaveTextContent("por su equipo: curación");
    expect(screen.getByTestId("plan-situational").querySelector("img")?.getAttribute("src")).toContain(
      "/item/2420.png"
    );
  });

  it("says the edge is mine when op.gg names my champion", async () => {
    vi.mocked(fetchMatchupBuild).mockResolvedValue(resp(build({ laneAdvantage: "Ahri" })));
    render(<MatchupBuildCard db={db} championDdId="Ahri" role="MIDDLE" enemyKeys={["238"]} />);
    expect(await screen.findByText("Tienes ventaja en línea")).toBeInTheDocument();
  });

  it("claims no edge when op.gg calls the lane even", async () => {
    vi.mocked(fetchMatchupBuild).mockResolvedValue(resp(build({ laneAdvantage: "EVEN" })));
    render(<MatchupBuildCard db={db} championDdId="Ahri" role="MIDDLE" enemyKeys={["238"]} />);
    expect(await screen.findByText("Contra Zed")).toBeInTheDocument();
    expect(screen.queryByText("Tienes ventaja en línea")).toBeNull();
    expect(screen.queryByText(/tiene ventaja en línea/)).toBeNull();
  });

  it("renders nothing without a lane opponent, without data, or on a tiny sample", async () => {
    const { container, rerender } = render(
      <MatchupBuildCard db={db} championDdId="Ahri" role="MIDDLE" enemyKeys={["64"]} />
    );
    expect(fetchMatchupBuild).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();

    vi.mocked(fetchMatchupBuild).mockResolvedValue(resp(null));
    rerender(<MatchupBuildCard db={db} championDdId="Ahri" role="MIDDLE" enemyKeys={["238"]} />);
    await waitFor(() => expect(fetchMatchupBuild).toHaveBeenCalledTimes(1));
    expect(container).toBeEmptyDOMElement();

    vi.mocked(fetchMatchupBuild).mockResolvedValue(resp(build({ games: 40, wins: 30 })));
    rerender(<MatchupBuildCard db={db} championDdId="Ahri" role="MIDDLE" enemyKeys={["7"]} />);
    await waitFor(() => expect(fetchMatchupBuild).toHaveBeenCalledTimes(2));
    expect(container).toBeEmptyDOMElement();
  });

  it("flex picks: the player can switch to another enemy that plays the role", async () => {
    vi.mocked(fetchMatchupBuild).mockResolvedValue(resp(build({ laneAdvantage: null })));
    // Yasuo (mid/top/bot) and Akali (mid/top) can both be my mid opponent.
    render(<MatchupBuildCard db={db} championDdId="Ahri" role="MIDDLE" enemyKeys={["157", "84"]} />);
    await screen.findByText(/^Contra /);
    const first = vi.mocked(fetchMatchupBuild).mock.calls[0][2];
    const other = first === "Yasuo" ? "Akali" : "Yasuo";
    fireEvent.click(screen.getByRole("button", { name: other }));
    await waitFor(() =>
      expect(fetchMatchupBuild).toHaveBeenLastCalledWith("Ahri", "MIDDLE", other, "es")
    );
    await screen.findByText(/se gana en equipo/);
    expect(screen.getByText(`Contra ${other}`)).toBeInTheDocument();
  });

  it("in game the real lane opponent wins over the guess, with no chooser", async () => {
    vi.mocked(fetchMatchupBuild).mockResolvedValue(resp(build({ laneAdvantage: null })));
    render(
      <MatchupBuildCard
        db={db}
        championDdId="Ahri"
        role="MIDDLE"
        enemyKeys={["157", "84", "64"]}
        knownOpponentKey="64"
      />
    );
    expect(await screen.findByText("Contra Lee Sin")).toBeInTheDocument();
    expect(fetchMatchupBuild).toHaveBeenCalledWith("Ahri", "MIDDLE", "LeeSin", "es");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("no chooser when only one enemy can play my role", async () => {
    vi.mocked(fetchMatchupBuild).mockResolvedValue(resp(build()));
    render(<MatchupBuildCard db={db} championDdId="Ahri" role="MIDDLE" enemyKeys={["64", "238"]} />);
    await screen.findByText("Contra Zed");
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/se gana en equipo/)).toBeInTheDocument();
  });

  it("a late answer for the previous opponent never shows under the new one", async () => {
    let resolveZed!: (v: ReturnType<typeof resp>) => void;
    vi.mocked(fetchMatchupBuild).mockImplementation((_c, _r, opp) =>
      opp === "Zed"
        ? new Promise((r) => (resolveZed = r))
        : Promise.resolve(resp(build({ tip: "tip leblanc", laneAdvantage: null }), "LeBlanc"))
    );
    const { rerender } = render(
      <MatchupBuildCard db={db} championDdId="Ahri" role="MIDDLE" enemyKeys={["238"]} />
    );
    rerender(<MatchupBuildCard db={db} championDdId="Ahri" role="MIDDLE" enemyKeys={["7"]} />);
    expect(await screen.findByText("Contra LeBlanc")).toBeInTheDocument();
    resolveZed(resp(build()));
    await Promise.resolve();
    expect(screen.queryByText("Contra Zed")).toBeNull();
    expect(screen.getByText("tip leblanc")).toBeInTheDocument();
  });
});
