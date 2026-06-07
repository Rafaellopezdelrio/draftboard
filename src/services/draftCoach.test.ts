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

  it("injects scouted enemy mains when present", () => {
    const { user } = buildDraftCoachPrompts({
      ...base,
      enemyMains: [{ championName: "Yasuo", summonerName: "Faker" }],
    });
    expect(user).toMatch(/Mains enemigos/);
    expect(user).toContain("Yasuo");
    expect(user).toContain("Faker");
  });

  it("omits the enemy-mains line when none provided", () => {
    expect(buildDraftCoachPrompts(base).user).not.toMatch(/Mains enemigos/);
  });

  it("injects bans, champion mastery and comp gaps when present", () => {
    const { user } = buildDraftCoachPrompts({
      ...base,
      bans: ["Yuumi", "Zed"],
      myMastery: { level: 7, points: 129000 },
      compMissing: ["Engage", "Frontline"],
    });
    expect(user).toMatch(/Bans del draft/);
    expect(user).toContain("Zed");
    expect(user).toMatch(/maestría 7/);
    expect(user).toContain("129000");
    expect(user).toMatch(/le falta/);
    expect(user).toContain("Engage");
  });

  it("omits mastery / bans / comp-gap lines when absent (no fabrication)", () => {
    const { user } = buildDraftCoachPrompts(base);
    expect(user).not.toMatch(/Bans del draft/);
    expect(user).not.toMatch(/maestría/);
    expect(user).not.toMatch(/le falta/);
  });

  it("builds a fully English prompt (system + labels) when language is en", () => {
    const { system, user } = buildDraftCoachPrompts({
      ...base,
      language: "en",
      bans: ["Zed"],
      myMastery: { level: 7, points: 129000 },
      compMissing: ["Engage"],
    });
    expect(system).toContain("draft coach");
    expect(system).toContain("NEVER fabricate");
    expect(user).toMatch(/My pick/);
    expect(user).toMatch(/Draft bans/);
    expect(user).toMatch(/My mastery of/);
    expect(user).toMatch(/My comp lacks/);
    // No Spanish leakage into the English prompt.
    expect(user).not.toMatch(/Mi pick|Bans del draft|le falta/);
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
