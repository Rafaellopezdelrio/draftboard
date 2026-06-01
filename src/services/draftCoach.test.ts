import { describe, it, expect } from "vitest";
import { buildDraftCoachPrompts, type DraftCoachInput } from "./draftCoach";

const base: DraftCoachInput = {
  myChampion: "Jarvan IV",
  role: "JUNGLE",
  allies: ["Lux"],
  enemies: ["Lee Sin", "Darius"],
  laneOpponent: "Lee Sin",
  laneMatchupWinRate: 0.42,
  topSuggestions: [
    { name: "Warwick", reasons: ["fuerte en el meta", "⚠ matchup difícil"] },
  ],
  language: "es",
};

describe("buildDraftCoachPrompts", () => {
  it("grounds the user prompt in the actual draft state", () => {
    const { user } = buildDraftCoachPrompts(base);
    expect(user).toContain("Jarvan IV");
    expect(user).toContain("Lee Sin");
    expect(user).toContain("42%"); // matchup WR cited
    expect(user).toContain("Warwick");
  });

  it("respects language in the system prompt", () => {
    expect(buildDraftCoachPrompts({ ...base, language: "en" }).system).toContain("English");
    expect(buildDraftCoachPrompts(base).system).toContain("Español");
  });

  it("omits the WR line when unknown (never fabricate numbers)", () => {
    const { user } = buildDraftCoachPrompts({ ...base, laneMatchupWinRate: null });
    expect(user).toContain("Lee Sin");
    expect(user).not.toMatch(/mi WR/);
  });

  it("handles an empty draft without crashing", () => {
    const { user } = buildDraftCoachPrompts({
      myChampion: "Ahri",
      role: "MIDDLE",
      allies: [],
      enemies: [],
      laneOpponent: null,
      laneMatchupWinRate: null,
      topSuggestions: [],
      language: "es",
    });
    expect(user).toContain("Ahri");
  });
});
