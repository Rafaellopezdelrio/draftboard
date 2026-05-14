// Smoke tests: cheap, high-coverage sanity checks. If these fail, something
// big is broken (imports, basic flows, default exports).

import { describe, it, expect } from "vitest";

describe("smoke: module imports", () => {
  it("suggestion engine loads and is callable", async () => {
    const m = await import("../engine/suggestionEngine");
    expect(typeof m.suggest).toBe("function");
  });

  it("coach engine loads", async () => {
    const m = await import("../engine/coachEngine");
    expect(typeof m.analyzeMatch).toBe("function");
    expect(typeof m.setCoachEloBucket).toBe("function");
  });

  it("trends engine loads", async () => {
    const m = await import("../engine/trendsEngine");
    expect(typeof m.computeTrends).toBe("function");
    expect(typeof m.detectWeakestArea).toBe("function");
  });

  it("playstyle engine loads", async () => {
    const m = await import("../engine/playstyleEngine");
    expect(typeof m.buildPlaystyleProfile).toBe("function");
    expect(typeof m.getArchetypeMeta).toBe("function");
  });

  it("ai prompt builder loads", async () => {
    const m = await import("../services/aiPromptBuilder");
    expect(typeof m.professionalCoachSystemPrompt).toBe("function");
    expect(typeof m.professionalMatchPrompt).toBe("function");
  });

  it("riot api client loads with proxy URL helpers", async () => {
    const m = await import("../services/riotApi");
    expect(typeof m.setRiotProxyUrl).toBe("function");
    expect(typeof m.getRiotProxyUrl).toBe("function");
    expect(typeof m.getCurrentGameByPuuid).toBe("function");
    expect(typeof m.getLeagueEntriesByPuuid).toBe("function");
  });

  it("queue names module loads", async () => {
    const m = await import("../data/queueNames");
    expect(typeof m.isRelevantQueue).toBe("function");
    expect(typeof m.queueLabel).toBe("function");
    expect(m.RELEVANT_QUEUE_IDS instanceof Set).toBe(true);
  });
});

describe("smoke: proxy URL state", () => {
  it("getRiotProxyUrl reflects setRiotProxyUrl", async () => {
    const { setRiotProxyUrl, getRiotProxyUrl } = await import(
      "../services/riotApi"
    );

    setRiotProxyUrl("https://example.workers.dev");
    expect(getRiotProxyUrl()).toBe("https://example.workers.dev");

    // Trailing slash stripped
    setRiotProxyUrl("https://example.workers.dev/");
    expect(getRiotProxyUrl()).toBe("https://example.workers.dev");

    // Empty / null → unset
    setRiotProxyUrl("");
    expect(getRiotProxyUrl()).toBe(null);
    setRiotProxyUrl(null);
    expect(getRiotProxyUrl()).toBe(null);
  });
});

describe("smoke: default prefs include proxy URL", () => {
  it("DEFAULT_PREFS hardcodes the proxy URL so users don't configure", async () => {
    const m = await import("../state/prefsStore");
    expect(m.DEFAULT_PREFS.riotProxyUrl).toMatch(/^https:\/\/.+\.workers\.dev$/);
    expect(m.DEFAULT_PREFS.aiProvider).toBe("groq"); // free default
  });
});
