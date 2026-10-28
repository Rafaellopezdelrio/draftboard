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
});
