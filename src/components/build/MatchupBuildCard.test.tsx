// MatchupBuildCard: the build vs the enemy that plays MY role. Locks the
// opponent pick, the "nothing instead of noise" rules, and that a slow answer
// for the previous opponent never paints under the new one.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

  it("says the edge is mine when op.gg names my champion", async () => {
    vi.mocked(fetchMatchupBuild).mockResolvedValue(resp(build({ laneAdvantage: "Ahri" })));
    render(<MatchupBuildCard db={db} championDdId="Ahri" role="MIDDLE" enemyKeys={["238"]} />);
    expect(await screen.findByText("Tienes ventaja en línea")).toBeInTheDocument();
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
