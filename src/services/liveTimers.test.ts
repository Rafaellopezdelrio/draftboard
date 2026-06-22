import { describe, it, expect } from "vitest";
import {
  deriveTimers,
  formatTime,
  DRAGON_RESPAWN_SEC,
  BARON_RESPAWN_SEC,
  FIRST_DRAGON_SPAWN_SEC,
} from "./liveTimers";
import type { LiveGameEvent } from "./liveClient";

function ev(EventName: string, EventTime: number): LiveGameEvent {
  return { EventName, EventTime } as LiveGameEvent;
}

describe("deriveTimers", () => {
  it("projects the first dragon before it has spawned", () => {
    const r = deriveTimers([], 120);
    expect(r.nextDragonAt).toBe(FIRST_DRAGON_SPAWN_SEC);
    expect(r.nextBaronAt).toBeNull();
  });

  it("returns null dragon once past first spawn with no kill yet", () => {
    // After 5:00 with no DragonKill we can't project the next one (it's up now
    // or contested) — null rather than a stale guess.
    expect(deriveTimers([], FIRST_DRAGON_SPAWN_SEC + 30).nextDragonAt).toBeNull();
  });

  it("projects the next dragon from the last DragonKill", () => {
    const r = deriveTimers([ev("DragonKill", 600)], 650);
    expect(r.nextDragonAt).toBe(600 + DRAGON_RESPAWN_SEC);
  });

  it("uses the LAST dragon kill when several happened", () => {
    const r = deriveTimers(
      [ev("DragonKill", 600), ev("DragonKill", 980)],
      1000
    );
    expect(r.nextDragonAt).toBe(980 + DRAGON_RESPAWN_SEC);
  });

  it("projects baron from the last BaronKill", () => {
    const r = deriveTimers([ev("BaronKill", 1500)], 1550);
    expect(r.nextBaronAt).toBe(1500 + BARON_RESPAWN_SEC);
  });

  it("ignores events whose EventTime isn't a number (malformed payload)", () => {
    const bad = { EventName: "DragonKill", EventTime: undefined } as unknown as LiveGameEvent;
    const r = deriveTimers([bad], 120);
    // Falls through to the first-spawn projection, not NaN.
    expect(r.nextDragonAt).toBe(FIRST_DRAGON_SPAWN_SEC);
  });
});

describe("formatTime", () => {
  it("formats seconds as M:SS with zero-padded seconds", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(5)).toBe("0:05");
    expect(formatTime(65)).toBe("1:05");
    expect(formatTime(600)).toBe("10:00");
  });

  it("clamps negatives to 0:00 (a passed ETA shouldn't read negative)", () => {
    expect(formatTime(-30)).toBe("0:00");
  });

  it("keeps M:SS past an hour (no hour rollover for objective timers)", () => {
    expect(formatTime(3661)).toBe("61:01");
  });
});
