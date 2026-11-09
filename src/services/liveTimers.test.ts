import { describe, it, expect } from "vitest";
import {
  deriveTimers,
  formatTime,
  DRAGON_RESPAWN_SEC,
  BARON_RESPAWN_SEC,
  FIRST_DRAGON_SPAWN_SEC,
  FIRST_BARON_SPAWN_SEC,
  ELDER_RESPAWN_SEC,
} from "./liveTimers";
import type { LiveGameEvent } from "./liveClient";

function ev(EventName: string, EventTime: number): LiveGameEvent {
  return { EventName, EventTime } as LiveGameEvent;
}

describe("deriveTimers", () => {
  it("projects the first dragon before it has spawned", () => {
    const r = deriveTimers([], 120);
    expect(r.nextDragonAt).toBe(FIRST_DRAGON_SPAWN_SEC);
    expect(r.nextBaronAt).toBeNull(); // first Baron shows only from 17:00
    expect(deriveTimers([], 17 * 60).nextBaronAt).toBe(FIRST_BARON_SPAWN_SEC);
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

  it("projects the first Baron spawn at 20:00 until it is up", () => {
    expect(deriveTimers([], 19 * 60 + 15).nextBaronAt).toBe(FIRST_BARON_SPAWN_SEC);
    expect(FIRST_BARON_SPAWN_SEC).toBe(20 * 60);
    expect(deriveTimers([], FIRST_BARON_SPAWN_SEC + 30).nextBaronAt).toBeNull();
  });

  it("returns no timers off Summoner's Rift (ARAM / Arena)", () => {
    expect(deriveTimers([], 270, { mapNumber: 12 })).toEqual({
      nextDragonAt: null,
      nextBaronAt: null,
    });
    expect(deriveTimers([], 270, { mapNumber: 30 }).nextDragonAt).toBeNull();
    expect(deriveTimers([], 270, { mapNumber: 11 }).nextDragonAt).toBe(
      FIRST_DRAGON_SPAWN_SEC
    );
  });

  it("uses the 6min Elder respawn after an Elder kill", () => {
    const elder = { ...ev("DragonKill", 1800), DragonType: "Elder" };
    expect(deriveTimers([elder], 1810).nextDragonAt).toBe(1800 + ELDER_RESPAWN_SEC);
    expect(ELDER_RESPAWN_SEC).toBe(6 * 60);
  });

  it("uses the 6min Elder spawn once a team takes Soul", () => {
    const kills = [600, 900, 1100, 1320].map((t) => ev("DragonKill", t));
    const soul = deriveTimers(kills, 1330, { dragonsByTeam: { ORDER: 4, CHAOS: 0 } });
    expect(soul.nextDragonAt).toBe(1320 + ELDER_RESPAWN_SEC);
    // 2-2: no Soul yet, normal 5min respawn.
    const split = deriveTimers(kills, 1330, { dragonsByTeam: { ORDER: 2, CHAOS: 2 } });
    expect(split.nextDragonAt).toBe(1320 + DRAGON_RESPAWN_SEC);
  });

  it("never assumes Soul from team counts the event log can't back", () => {
    // Bogus attributed count with only 3 drakes dead -> still 5min.
    const three = [600, 900, 1100].map((t) => ev("DragonKill", t));
    expect(
      deriveTimers(three, 1110, { dragonsByTeam: { ORDER: 4, CHAOS: 0 } }).nextDragonAt
    ).toBe(1100 + DRAGON_RESPAWN_SEC);
    // 7 drakes dead guarantees Soul even if attribution failed.
    const seven = [1, 2, 3, 4, 5, 6, 7].map((i) => ev("DragonKill", i * 300));
    expect(deriveTimers(seven, 2110).nextDragonAt).toBe(2100 + ELDER_RESPAWN_SEC);
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
