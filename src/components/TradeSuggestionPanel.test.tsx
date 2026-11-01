// TradeSuggestionPanel contract:
//   - Forwards the draft to suggestTrade (mocked here: its heuristics are the
//     engine's own concern).
//   - No trade, or a trade whose current champion isn't in the DB -> nothing.
//   - Otherwise shows current -> proposed icons, the proposed name, the score
//     gain as a rounded percentage and the engine's reason.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ChampionDb } from "../types/champion";
import type { TradeSuggestion } from "../engine/tradeEngine";

vi.mock("../engine/tradeEngine", () => ({ suggestTrade: vi.fn() }));

import { TradeSuggestionPanel } from "./TradeSuggestionPanel";
import { suggestTrade } from "../engine/tradeEngine";

const db = {
  patch: "16.1.1",
  champions: {
    "266": { key: "266", id: "Aatrox", name: "Aatrox", iconUrl: "https://cdn.test/Aatrox.png", tags: [], roles: [], archetypes: [] },
  },
  counters: [],
  meta: [],
  fetchedAt: 0,
} as unknown as ChampionDb;

const TRADE: TradeSuggestion = {
  currentChampionKey: "266",
  proposedChampionKey: "103",
  proposedName: "Ahri",
  proposedIcon: "https://cdn.test/Ahri.png",
  scoreDelta: 0.126,
  reason: "mejor vs su comp",
};

function renderPanel() {
  return render(
    <TradeSuggestionPanel
      db={db}
      myRole="MIDDLE"
      myCurrentPick="266"
      allyKeys={["64"]}
      enemyKeys={["122"]}
      bannedKeys={["222"]}
    />
  );
}

beforeEach(() => {
  vi.mocked(suggestTrade).mockReset();
});

describe("TradeSuggestionPanel", () => {
  it("passes the draft to the trade engine", () => {
    vi.mocked(suggestTrade).mockReturnValue(null);
    renderPanel();
    expect(suggestTrade).toHaveBeenCalledWith({
      db,
      currentPickKey: "266",
      myRole: "MIDDLE",
      allyKeys: ["64"],
      enemyKeys: ["122"],
      bannedKeys: ["222"],
    });
  });

  it("renders nothing when there is no better trade", () => {
    vi.mocked(suggestTrade).mockReturnValue(null);
    const { container } = renderPanel();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the current champion is missing from the DB", () => {
    vi.mocked(suggestTrade).mockReturnValue({ ...TRADE, currentChampionKey: "9999" });
    const { container } = renderPanel();
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the proposed swap with its gain and reason", () => {
    vi.mocked(suggestTrade).mockReturnValue(TRADE);
    renderPanel();
    expect(screen.getByText("Sugerencia de trade")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Aatrox" })).toHaveAttribute(
      "src",
      "https://cdn.test/Aatrox.png"
    );
    expect(screen.getByRole("img", { name: "Ahri" })).toHaveAttribute(
      "src",
      "https://cdn.test/Ahri.png"
    );
    expect(screen.getByText("Ahri").closest("p")).toHaveTextContent("Cambia a Ahri");
    expect(screen.getByText("+13% mejor · mejor vs su comp")).toBeInTheDocument();
  });
});
