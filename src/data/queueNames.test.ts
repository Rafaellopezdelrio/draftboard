import { describe, it, expect } from "vitest";
import { isRelevantQueue, queueLabel, RELEVANT_QUEUE_IDS } from "./queueNames";

describe("isRelevantQueue", () => {
  it("accepts modern ranked queues", () => {
    expect(isRelevantQueue(420)).toBe(true); // SoloQ
    expect(isRelevantQueue(440)).toBe(true); // Flex
  });

  it("accepts modern normal queues", () => {
    expect(isRelevantQueue(400)).toBe(true); // Normal draft
    expect(isRelevantQueue(430)).toBe(true); // Normal blind
    expect(isRelevantQueue(490)).toBe(true); // Quickplay
  });

  it("accepts ARAM variants", () => {
    expect(isRelevantQueue(450)).toBe(true); // Howling Abyss ARAM
    expect(isRelevantQueue(720)).toBe(true); // ARAM Clash
  });

  it("accepts permanent Arena", () => {
    expect(isRelevantQueue(1700)).toBe(true);
  });

  it("accepts rotating event modes", () => {
    expect(isRelevantQueue(900)).toBe(true); // URF
    expect(isRelevantQueue(1020)).toBe(true); // OFA
    expect(isRelevantQueue(1300)).toBe(true); // Nexus Blitz
    expect(isRelevantQueue(1400)).toBe(true); // Ultimate Spellbook
  });

  it("rejects tutorials, customs, and bot games", () => {
    expect(isRelevantQueue(0)).toBe(false); // Custom
    expect(isRelevantQueue(2000)).toBe(false); // Tutorial 1
    expect(isRelevantQueue(2010)).toBe(false); // Tutorial 2
    expect(isRelevantQueue(830)).toBe(false); // Co-op AI Intro
    expect(isRelevantQueue(3140)).toBe(false); // Custom/Bot
  });

  it("rejects deprecated Brawl modes", () => {
    expect(isRelevantQueue(2300)).toBe(false);
    expect(isRelevantQueue(2400)).toBe(false);
  });

  it("rejects unknown queue ids", () => {
    expect(isRelevantQueue(9999)).toBe(false);
    expect(isRelevantQueue(-1)).toBe(false);
  });
});

describe("queueLabel", () => {
  it("returns Spanish-friendly names for known queues", () => {
    expect(queueLabel(420)).toBe("SoloQ");
    expect(queueLabel(440)).toBe("Flex");
    expect(queueLabel(450)).toBe("ARAM");
    expect(queueLabel(1700)).toBe("Arena");
  });

  it("falls back gracefully on unknown ids", () => {
    expect(queueLabel(9999)).toBe("Queue 9999");
  });
});

describe("RELEVANT_QUEUE_IDS", () => {
  it("includes the real ARAM queue IDs (450 + 720)", () => {
    expect(RELEVANT_QUEUE_IDS.has(450)).toBe(true);
    expect(RELEVANT_QUEUE_IDS.has(720)).toBe(true);
    // 6000 was previously mislabeled "ARAM Chaos" — CHAOS is a TEAM side,
    // not a separate queue. Removed.
    expect(RELEVANT_QUEUE_IDS.has(6000)).toBe(false);
  });

  it("does NOT include Brawl (deprecated)", () => {
    expect(RELEVANT_QUEUE_IDS.has(2400)).toBe(false);
  });
});
