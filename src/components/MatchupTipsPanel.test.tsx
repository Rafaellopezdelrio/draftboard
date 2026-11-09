// Curated tips are keyed by DDragon id ("MissFortune"), while the panel used
// to match them by display name ("Miss Fortune"): for every champion whose
// id differs from its name the tip header showed the raw id and the enemy
// was also queued for an AI tip as if it had none.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MatchupTipsPanel } from "./MatchupTipsPanel";
import * as ai from "../services/aiMatchupTips";
import type { ChampionDb } from "../types/champion";

vi.mock("../services/aiMatchupTips", () => ({
  getCachedMatchupTips: vi.fn(async () => null),
  generateMatchupTips: vi.fn(),
}));

const db = {
  patch: "16.21.1",
  champions: {
    "21": { id: "MissFortune", key: "21", name: "Miss Fortune" },
    "22": { id: "Ashe", key: "22", name: "Ashe" },
    "121": { id: "Khazix", key: "121", name: "Kha'Zix" },
    "222": { id: "Jinx", key: "222", name: "Jinx" },
  },
} as unknown as ChampionDb;

describe("MatchupTipsPanel", () => {
  beforeEach(() => {
    localStorage?.clear?.();
    vi.mocked(ai.getCachedMatchupTips).mockClear();
  });

  it("shows curated tips under the display name and skips the AI row for that enemy", () => {
    render(<MatchupTipsPanel db={db} enemyKeys={["21"]} myChampionKey="22" myRole="BOTTOM" />);
    fireEvent.click(screen.getByText("Tips de matchup"));

    expect(screen.getAllByText("vs Miss Fortune").length).toBeGreaterThan(0);
    expect(screen.queryByText("vs MissFortune")).toBeNull();
    // MF has curated tips, so no AI lookup is started for her.
    expect(ai.getCachedMatchupTips).not.toHaveBeenCalled();
  });

  it("asks the AI about the enemy's own role, not mine", () => {
    // Jungler vs Jinx: she is the enemy ADC, not "Jinx JUNGLE".
    render(<MatchupTipsPanel db={db} enemyKeys={["222"]} myChampionKey="121" myRole="JUNGLE" />);
    fireEvent.click(screen.getByText("Tips de matchup"));

    expect(ai.getCachedMatchupTips).toHaveBeenCalledWith(121, 222, "JUNGLE", "16.21.1", "BOTTOM");
  });
});
