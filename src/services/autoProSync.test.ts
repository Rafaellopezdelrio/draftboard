import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ChampionDb } from "../types/champion";

const selectMock = vi.fn();
const executeMock = vi.fn();
vi.mock("../db/client", () => ({
  isTauri: () => true,
  getDb: async () => ({ select: selectMock, execute: executeMock }),
}));
vi.mock("./dataDragon", () => ({ fetchLatestPatch: vi.fn() }));
vi.mock("./proPlayAggregator", () => ({ aggregateFromProPlay: vi.fn() }));

import { startAutoProSync } from "./autoProSync";
import { fetchLatestPatch } from "./dataDragon";
import { aggregateFromProPlay } from "./proPlayAggregator";

const DB = { champions: {} } as unknown as ChampionDb;

function patchMarked(): boolean {
  return executeMock.mock.calls.some(([sql]) => String(sql).includes("proplay_last_patch"));
}

async function runSync(): Promise<void> {
  startAutoProSync(DB);
  await vi.waitFor(() => expect(aggregateFromProPlay).toHaveBeenCalled());
  // Let the post-aggregate continuation settle.
  await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  selectMock.mockReset().mockResolvedValue([]);
  executeMock.mockReset().mockResolvedValue(undefined);
  vi.mocked(fetchLatestPatch).mockReset().mockResolvedValue("16.10.1");
  vi.mocked(aggregateFromProPlay).mockReset();
});

describe("startAutoProSync", () => {
  it("marks the patch synced after a sync that downloaded games", async () => {
    vi.mocked(aggregateFromProPlay).mockResolvedValue({ games: 40, rows: 120 });
    await runSync();
    expect(patchMarked()).toBe(true);
  });

  it("does not mark the patch synced when nothing could be downloaded", async () => {
    vi.mocked(aggregateFromProPlay).mockResolvedValue({ games: 0, rows: 0 });
    await runSync();
    expect(patchMarked()).toBe(false);
  });
});
