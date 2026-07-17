import { describe, it, expect } from "vitest";
import { aggregateAdviceRows } from "./draftsRepo";

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
