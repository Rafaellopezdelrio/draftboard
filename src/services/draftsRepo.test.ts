import { describe, it, expect, vi, beforeEach } from "vitest";

const selectMock = vi.fn();
const executeMock = vi.fn();
const getDbMock = vi.fn();
let tauri = true;
vi.mock("../db/client", () => ({
  isTauri: () => tauri,
  getDb: () => getDbMock(),
}));

import {
  aggregateAdviceRows,
  saveDraft,
  linkDraftToMatch,
  draftAdviceStats,
  recentDrafts,
} from "./draftsRepo";

// The adherence panel's headline numbers ("WR when you followed the
// suggestion vs when you didn't") rest entirely on this fold.
describe("aggregateAdviceRows", () => {
  it("splits games and wins by followed/not-followed", () => {
    const s = aggregateAdviceRows([
      { followed: 1, win: 1, n: 6 }, // followed + won
      { followed: 1, win: 0, n: 4 }, // followed + lost
      { followed: 0, win: 1, n: 2 }, // ignored + won
      { followed: 0, win: 0, n: 8 }, // ignored + lost
    ]);
    expect(s).toEqual({
      followedGames: 10,
      followedWins: 6,
      notFollowedGames: 10,
      notFollowedWins: 2,
    });
  });

  it("handles a one-sided sample (only followed games linked yet)", () => {
    const s = aggregateAdviceRows([{ followed: 1, win: 1, n: 3 }]);
    expect(s.followedGames).toBe(3);
    expect(s.followedWins).toBe(3);
    expect(s.notFollowedGames).toBe(0);
  });

  it("returns all zeros for no linked drafts", () => {
    expect(aggregateAdviceRows([])).toEqual({
      followedGames: 0,
      followedWins: 0,
      notFollowedGames: 0,
      notFollowedWins: 0,
    });
  });
});

describe("drafts persistence (SQLite)", () => {
  const ZERO = { followedGames: 0, followedWins: 0, notFollowedGames: 0, notFollowedWins: 0 };

  beforeEach(() => {
    tauri = true;
    selectMock.mockReset().mockResolvedValue([]);
    executeMock.mockReset().mockResolvedValue({ lastInsertId: 31, rowsAffected: 1 });
    getDbMock.mockReset().mockResolvedValue({ select: selectMock, execute: executeMock });
  });

  it("is a no-op outside Tauri", async () => {
    tauri = false;
    expect(
      await saveDraft({
        tsMs: 1,
        allyKeys: [],
        enemyKeys: [],
        bannedKeys: [],
        pickedKey: null,
        suggestedKeys: [],
        followedSuggestion: false,
      })
    ).toBe(0);
    await linkDraftToMatch("EUW1_1", 103, 1000);
    expect(await draftAdviceStats()).toEqual(ZERO);
    expect(await recentDrafts()).toEqual([]);
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("saveDraft serialises key lists as CSV, followed as 1, match_id NULL", async () => {
    const id = await saveDraft({
      tsMs: 1_700_000_000_000,
      allyKeys: ["103", "64"],
      enemyKeys: ["157"],
      bannedKeys: ["238", "91", "555"],
      pickedKey: "103",
      suggestedKeys: ["103", "4"],
      followedSuggestion: true,
    });
    expect(id).toBe(31);
    const [sql, params] = executeMock.mock.calls[0];
    expect(sql).toContain("INSERT INTO drafts");
    expect(sql).toContain("$7,NULL)");
    expect(params).toEqual([
      1_700_000_000_000, "103,64", "157", "238,91,555", "103", "103,4", 1,
    ]);
  });

  it("saveDraft stores not-followed as 0 and returns 0 without an insert id", async () => {
    executeMock.mockResolvedValue({ rowsAffected: 1 });
    const id = await saveDraft({
      tsMs: 5,
      allyKeys: [],
      enemyKeys: [],
      bannedKeys: [],
      pickedKey: null,
      suggestedKeys: [],
      followedSuggestion: false,
    });
    expect(id).toBe(0);
    expect(executeMock.mock.calls[0][1]).toEqual([5, "", "", "", null, "", 0]);
  });

  it("linkDraftToMatch targets the newest unlinked draft in a 2h window before match end", async () => {
    const end = 1_700_000_000_000;
    await linkDraftToMatch("EUW1_99", 103, end);
    const [sql, params] = executeMock.mock.calls[0];
    expect(sql).toContain("WHERE match_id IS NULL");
    expect(sql).toContain("AND picked_key = $2");
    // $3 is the upper bound (match end), $4 the lower bound (end - 2h)
    expect(sql).toContain("ts_ms <= $3 AND ts_ms >= $4");
    expect(sql).toContain("ORDER BY ts_ms DESC");
    // championId is matched as a string key; window start is end - 2h
    expect(params).toEqual(["EUW1_99", "103", end, end - 7_200_000]);
  });

  it("draftAdviceStats folds the joined grouped rows", async () => {
    selectMock.mockResolvedValue([
      { followed: 1, win: 1, n: 3 },
      { followed: 0, win: 0, n: 2 },
    ]);
    const s = await draftAdviceStats();
    expect(selectMock.mock.calls[0][0]).toContain("JOIN matches m ON d.match_id = m.match_id");
    expect(s).toEqual({ followedGames: 3, followedWins: 3, notFollowedGames: 2, notFollowedWins: 0 });
  });

  it("recentDrafts parses CSV columns (empty → [], stray commas dropped)", async () => {
    selectMock.mockResolvedValue([
      {
        id: 2,
        ts_ms: 2000,
        ally_keys: "103,64",
        enemy_keys: "157,,238,",
        banned_keys: "",
        picked_key: "103",
        suggested_keys: "103",
        followed_suggestion: 1,
        match_id: "EUW1_5",
      },
      {
        id: 1,
        ts_ms: 1000,
        ally_keys: "",
        enemy_keys: "",
        banned_keys: "",
        picked_key: null,
        suggested_keys: "",
        followed_suggestion: 0,
        match_id: null,
      },
    ]);
    const out = await recentDrafts(20);
    expect(selectMock.mock.calls[0][0]).toContain("ORDER BY ts_ms DESC LIMIT $1");
    expect(selectMock.mock.calls[0][1]).toEqual([20]);
    expect(out).toEqual([
      {
        id: 2,
        tsMs: 2000,
        allyKeys: ["103", "64"],
        enemyKeys: ["157", "238"],
        bannedKeys: [],
        pickedKey: "103",
        suggestedKeys: ["103"],
        followedSuggestion: true,
        matchId: "EUW1_5",
      },
      {
        id: 1,
        tsMs: 1000,
        allyKeys: [],
        enemyKeys: [],
        bannedKeys: [],
        pickedKey: null,
        suggestedKeys: [],
        followedSuggestion: false,
        matchId: null,
      },
    ]);
  });

  it("recentDrafts defaults to 50 rows", async () => {
    await recentDrafts();
    expect(selectMock.mock.calls[0][1]).toEqual([50]);
  });
});
