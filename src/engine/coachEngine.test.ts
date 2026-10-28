import { describe, it, expect, beforeEach } from "vitest";
import { analyzeMatch, setCoachEloBucket } from "./coachEngine";
import type {
  MatchFull,
  MatchParticipant,
  MatchTimeline,
  ParticipantFrame,
  TimelineFrame,
} from "../services/riotApi";

function mkParticipant(overrides: Partial<MatchParticipant> = {}): MatchParticipant {
  return {
    puuid: "me",
    participantId: 1,
    championId: 238,
    teamId: 100,
    position: "MIDDLE",
    win: false,
    kills: 4,
    deaths: 5,
    assists: 6,
    cs: 200,
    goldEarned: 12000,
    totalDamageDealtToChampions: 18000,
    magicDamageDealtToChampions: 9000,
    physicalDamageDealtToChampions: 9000,
    totalDamageTaken: 22000,
    damageDealtToObjectives: 8000,
    visionScore: 25,
    wardsPlaced: 10,
    wardsKilled: 4,
    controlWardsBought: 3,
    champLevel: 15,
    items: [3157, 6655, 3020, 0, 0, 0, 0],
    summoner1Id: 4,
    summoner2Id: 14,
    perks: {},
    ...overrides,
  };
}

function mkMatch(me: MatchParticipant, durationSec = 1800): MatchFull {
  // 9 random teammates/opponents
  const others = Array.from({ length: 9 }, (_, i) =>
    mkParticipant({
      puuid: `other-${i}`,
      participantId: i + 2,
      teamId: i < 4 ? 100 : 200, // 4 allies + 5 enemies
      position: ["TOP", "JUNGLE", "BOTTOM", "UTILITY", "TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"][i],
      kills: 5,
      deaths: 5,
      assists: 5,
      cs: 150,
      goldEarned: 10000,
      totalDamageDealtToChampions: 15000,
    })
  );
  return {
    matchId: "EUW1_TEST",
    durationSec,
    endTsMs: Date.now(),
    queueId: 420,
    teams: [
      {
        teamId: 100,
        win: me.win,
        objectives: {
          baron: { kills: 0 }, dragon: { kills: 2 }, tower: { kills: 5 },
          riftHerald: { kills: 1 }, inhibitor: { kills: 1 },
        },
      },
      {
        teamId: 200,
        win: !me.win,
        objectives: {
          baron: { kills: 1 }, dragon: { kills: 2 }, tower: { kills: 6 },
          riftHerald: { kills: 0 }, inhibitor: { kills: 2 },
        },
      },
    ],
    participants: [me, ...others],
  };
}

function mkTimeline(events: Array<{ timestamp: number; type: string; [k: string]: unknown }> = []): MatchTimeline {
  return {
    matchId: "EUW1_TEST",
    participantToPuuid: { 1: "me" },
    frames: [
      {
        timestamp: 0,
        events: events as never,
        participantFrames: {},
      } as never,
    ],
  };
}

describe("coachEngine", () => {
  beforeEach(() => {
    setCoachEloBucket("DIAMOND"); // deterministic benchmarks
  });

  it("returns empty when puuid is not in the match", () => {
    const match = mkMatch(mkParticipant());
    const tl = mkTimeline();
    expect(analyzeMatch({ match, timeline: tl, myPuuid: "ghost" })).toEqual([]);
  });

  it("flags bad CS when cs/min is well below target for the role", () => {
    // 100 CS / 30 min = 3.3/min in MIDDLE (target 7.5/min diamond) → ~44% of target → bad
    const me = mkParticipant({ cs: 100, position: "MIDDLE" });
    const insights = analyzeMatch({
      match: mkMatch(me, 1800),
      timeline: mkTimeline(),
      myPuuid: "me",
    });
    expect(insights.some((i) => i.category === "farming" && i.severity === "bad")).toBe(true);
  });

  it("praises good farm above target", () => {
    // 280 CS / 30 min = 9.3/min in MIDDLE → above 7.5 target → good
    const me = mkParticipant({ cs: 280, position: "MIDDLE" });
    const insights = analyzeMatch({
      match: mkMatch(me, 1800),
      timeline: mkTimeline(),
      myPuuid: "me",
    });
    expect(insights.some((i) => i.category === "farming" && i.severity === "good")).toBe(true);
  });

  it("flags an enemy magic-damage skew with a build insight (revives the dead no-op)", () => {
    const me = mkParticipant();
    const match = mkMatch(me);
    // Skew the enemy team's damage heavily toward magic.
    for (const p of match.participants) {
      if (p.teamId !== me.teamId) {
        p.magicDamageDealtToChampions = 12_000;
        p.physicalDamageDealtToChampions = 2_000;
      }
    }
    const insights = analyzeMatch({ match, timeline: mkTimeline(), myPuuid: "me" });
    const build = insights.find((i) => i.category === "build");
    expect(build).toBeDefined();
    expect(build!.detail).toMatch(/mágico/);
  });

  it("gives no build insight when enemy damage is balanced", () => {
    const insights = analyzeMatch({
      match: mkMatch(mkParticipant()),
      timeline: mkTimeline(),
      myPuuid: "me",
    });
    expect(insights.some((i) => i.category === "build")).toBe(false);
  });

  it("skips CS analysis for UTILITY role (support farming nuance)", () => {
    const me = mkParticipant({ cs: 30, position: "UTILITY" });
    const insights = analyzeMatch({
      match: mkMatch(me, 1800),
      timeline: mkTimeline(),
      myPuuid: "me",
    });
    expect(insights.some((i) => i.category === "farming")).toBe(false);
  });

  it("flags low vision score for the role", () => {
    const me = mkParticipant({
      position: "UTILITY",
      visionScore: 10, // very low for sup
      controlWardsBought: 0,
    });
    const insights = analyzeMatch({
      match: mkMatch(me, 1800),
      timeline: mkTimeline(),
      myPuuid: "me",
    });
    expect(insights.some((i) => i.category === "vision")).toBe(true);
  });

  it("counts early deaths from the timeline", () => {
    const me = mkParticipant();
    const tl = mkTimeline([
      { timestamp: 4 * 60 * 1000, type: "CHAMPION_KILL", victimId: 1, assistingParticipantIds: [] } as never,
      { timestamp: 6 * 60 * 1000, type: "CHAMPION_KILL", victimId: 1, assistingParticipantIds: [] } as never,
      { timestamp: 7 * 60 * 1000, type: "CHAMPION_KILL", victimId: 1, assistingParticipantIds: [] } as never,
    ]);
    const insights = analyzeMatch({ match: mkMatch(me), timeline: tl, myPuuid: "me" });
    // Exact title: "3 solo deaths" also contains "3", so a loose match would hide a broken early branch.
    expect(insights.find((i) => i.title === "3 muertes en early")).toMatchObject({
      category: "deaths",
      severity: "bad",
    });
  });

  it("ignores enemy kill events when counting my deaths", () => {
    const me = mkParticipant();
    const tl = mkTimeline([
      // victim is participant 2 (not me) — should NOT count
      { timestamp: 4 * 60 * 1000, type: "CHAMPION_KILL", victimId: 2, assistingParticipantIds: [] } as never,
      { timestamp: 5 * 60 * 1000, type: "CHAMPION_KILL", victimId: 3, assistingParticipantIds: [] } as never,
      { timestamp: 6 * 60 * 1000, type: "CHAMPION_KILL", victimId: 4, assistingParticipantIds: [] } as never,
    ]);
    const insights = analyzeMatch({ match: mkMatch(me), timeline: tl, myPuuid: "me" });
    expect(insights.some((i) => i.category === "deaths" && i.title.includes("early"))).toBe(false);
  });

  it("sorts insights by severity (bad → warn → good → info)", () => {
    const me = mkParticipant({ cs: 100, deaths: 12, visionScore: 5 });
    const insights = analyzeMatch({
      match: mkMatch(me, 1800),
      timeline: mkTimeline(),
      myPuuid: "me",
    });
    const order = ["bad", "warn", "good", "info"];
    for (let i = 1; i < insights.length; i++) {
      expect(order.indexOf(insights[i].severity)).toBeGreaterThanOrEqual(
        order.indexOf(insights[i - 1].severity)
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Branch coverage for every individual check. Baseline: the default
// mkParticipant (MIDDLE, 200 CS in 30 min, diamond bucket) only yields
// "CS mejorable", so each test perturbs one input and looks the insight up
// by title.
// ---------------------------------------------------------------------------

type Ev = { timestamp: number; type: string; [k: string]: unknown };

const MIN = 60_000;
const kill = (min: number, killerId: number, victimId: number, assists?: number[]): Ev => ({
  timestamp: min * MIN,
  type: "CHAMPION_KILL",
  killerId,
  victimId,
  assistingParticipantIds: assists,
});
const elite = (min: number, killerId: number, monsterType: string): Ev => ({
  timestamp: min * MIN,
  type: "ELITE_MONSTER_KILL",
  killerId,
  monsterType,
});

function pframe(participantId: number, minionsKilled: number, jungleMinionsKilled = 0): ParticipantFrame {
  return {
    participantId,
    currentGold: 0,
    totalGold: 0,
    level: 1,
    xp: 0,
    minionsKilled,
    jungleMinionsKilled,
    position: { x: 0, y: 0 },
  };
}

// Timeline with an extra frame shortly after 14:00 (Riot frames carry a few ms of drift).
function timelineWith14(frames14: ParticipantFrame[]): MatchTimeline {
  const f0: TimelineFrame = { timestamp: 0, events: [], participantFrames: {} };
  const f14: TimelineFrame = {
    timestamp: 14 * MIN + 37,
    events: [],
    participantFrames: Object.fromEntries(frames14.map((f) => [String(f.participantId), f])),
  };
  return { matchId: "EUW1_TEST", participantToPuuid: { 1: "me" }, frames: [f0, f14] };
}

function run(
  me: MatchParticipant,
  opts: { durationSec?: number; events?: Ev[]; timeline?: MatchTimeline; match?: MatchFull } = {}
) {
  return analyzeMatch({
    match: opts.match ?? mkMatch(me, opts.durationSec ?? 1800),
    timeline: opts.timeline ?? mkTimeline(opts.events ?? []),
    myPuuid: "me",
  });
}

const titled = (insights: ReturnType<typeof analyzeMatch>, title: string) =>
  insights.find((i) => i.title === title);

describe("coachEngine — baseline & guards", () => {
  beforeEach(() => setCoachEloBucket("DIAMOND"));

  it("default mid-laner produces exactly one insight: CS mejorable with the diamond target", () => {
    const insights = run(mkParticipant());
    expect(insights).toHaveLength(1);
    expect(insights[0]).toMatchObject({
      category: "farming",
      severity: "warn",
      title: "CS mejorable",
      detail: "6.7 CS/min. Margen para llegar a 7.5.",
    });
  });

  it("returns [] for remakes / sub-minute games even with awful stats", () => {
    const awful = mkParticipant({ cs: 0, visionScore: 0, deaths: 20 });
    expect(run(awful, { durationSec: 59 })).toEqual([]);
    expect(run(awful, { durationSec: 0 })).toEqual([]);
  });

  it("returns [] when duration is not a finite number (corrupt payload)", () => {
    expect(run(mkParticipant({ cs: 0 }), { durationSec: Number.NaN })).toEqual([]);
  });
});

describe("coachEngine — setCoachEloBucket", () => {
  beforeEach(() => setCoachEloBucket("DIAMOND"));

  it.each([
    ["IRON", "5.0"],
    ["bronze", "5.0"], // lower-case tiers are normalised
    ["SILVER", "6.0"],
    ["GOLD", "6.8"],
    ["PLATINUM", "6.8"],
    ["EMERALD", "6.8"],
    ["DIAMOND", "7.5"],
    ["MASTER", "8.0"],
    ["GRANDMASTER", "8.0"],
    ["Challenger", "8.0"],
  ])("tier %s uses a MIDDLE CS/min target of %s", (tier, target) => {
    setCoachEloBucket(tier);
    // 60 CS / 30 min = 2.0/min: "bad" in every bucket, so the detail always names the target.
    const farm = titled(run(mkParticipant({ cs: 60 })), "CS muy bajo");
    expect(farm).toBeDefined();
    expect(farm!.detail).toBe(`Conseguiste 2.0 CS/min. El objetivo en MIDDLE es ${target}+.`);
    expect(farm!.metric).toBe("60 CS en 30min");
  });

  it("ignores undefined, empty and unknown tiers (keeps the previous bucket)", () => {
    setCoachEloBucket("SILVER");
    setCoachEloBucket(undefined);
    setCoachEloBucket("");
    setCoachEloBucket("UNRANKED");
    const farm = titled(run(mkParticipant({ cs: 60 })), "CS muy bajo");
    expect(farm!.detail).toContain("es 6.0+");
  });

  it("a lower bucket turns the same CS from 'bad' into 'warn'", () => {
    // 120 CS / 30 min = 4.0/min. Diamond target 7.5 → bad; iron target 5.0 → 80% → warn.
    const me = mkParticipant({ cs: 120 });
    expect(titled(run(me), "CS muy bajo")).toBeDefined();
    setCoachEloBucket("IRON");
    const insights = run(me);
    expect(titled(insights, "CS muy bajo")).toBeUndefined();
    expect(titled(insights, "CS mejorable")!.detail).toBe("4.0 CS/min. Margen para llegar a 5.0.");
  });
});

describe("coachEngine — farming & vision", () => {
  beforeEach(() => setCoachEloBucket("DIAMOND"));

  it("falls back to a 6.0 CS/min target for an unknown role", () => {
    const farm = titled(run(mkParticipant({ cs: 60, position: "" })), "CS muy bajo");
    expect(farm!.detail).toContain("es 6.0+");
  });

  it("emits no farming insight between 90% and 100% of target", () => {
    // 210 / 30 = 7.0/min = 93% of 7.5
    expect(run(mkParticipant({ cs: 210 })).some((i) => i.category === "farming")).toBe(false);
  });

  it("flags very low vision with wards metric for a non-support", () => {
    const v = titled(
      run(mkParticipant({ visionScore: 10, wardsPlaced: 7, controlWardsBought: 2 })),
      "Visión muy baja"
    );
    expect(v).toMatchObject({ category: "vision", severity: "bad" });
    expect(v!.detail).toBe("Vision score 10 (0.33/min). Objetivo: 0.80+/min.");
    expect(v!.metric).toBe("7 wards puestas, 2 control wards");
  });

  it("warns about control wards when vision score is fine but pinks are scarce", () => {
    // 30 min → expects at least floor(30/8) = 3 pinks
    const insights = run(mkParticipant({ controlWardsBought: 1 }));
    const v = titled(insights, "Pocos control wards");
    expect(v).toMatchObject({ category: "vision", severity: "warn" });
    expect(v!.detail).toBe("Solo compraste 1 control wards en 30min.");
    expect(titled(insights, "Visión muy baja")).toBeUndefined();
  });
});

describe("coachEngine — deaths", () => {
  beforeEach(() => setCoachEloBucket("DIAMOND"));

  it("two early deaths with assists → warn, no solo-death insight", () => {
    const insights = run(mkParticipant(), {
      events: [kill(3, 6, 1, [7]), kill(6, 7, 1, [8])],
    });
    expect(titled(insights, "2 muertes tempranas")).toMatchObject({ category: "deaths", severity: "warn" });
    expect(insights.some((i) => i.title.includes("solo deaths"))).toBe(false);
  });

  it("three late deaths without assists → solo-death warn, no early-death insight", () => {
    const insights = run(mkParticipant(), {
      events: [kill(10, 6, 1), kill(15, 7, 1, []), kill(20, 8, 1)],
    });
    expect(titled(insights, "3 solo deaths")).toMatchObject({ category: "deaths", severity: "warn" });
    expect(insights.some((i) => /muertes (en early|tempranas)/.test(i.title))).toBe(false);
  });

  it("flags 8+ deaths in a game shorter than 30 min", () => {
    const d = titled(run(mkParticipant({ deaths: 8 }), { durationSec: 1500 }), "Muchas muertes");
    expect(d).toMatchObject({ category: "deaths", severity: "bad" });
    expect(d!.detail).toBe("8 muertes en 25min.");
    expect(titled(run(mkParticipant({ deaths: 7 }), { durationSec: 1500 }), "Muchas muertes")).toBeUndefined();
  });

  it("does not flag 8+ deaths once the game reaches 30 minutes", () => {
    expect(titled(run(mkParticipant({ deaths: 9 }), { durationSec: 1800 }), "Muchas muertes")).toBeUndefined();
  });
});

describe("coachEngine — kill participation & damage", () => {
  beforeEach(() => setCoachEloBucket("DIAMOND"));

  it("warns on low kill participation with the percentage", () => {
    // allies 4×5 kills + mine 0 = 20 team kills; (0+2)/20 = 10%
    const kp = titled(run(mkParticipant({ kills: 0, assists: 2 })), "Participación baja");
    expect(kp).toMatchObject({ category: "macro", severity: "warn" });
    expect(kp!.detail).toBe("Solo participaste en 10% de las kills del equipo.");
  });

  it("praises kill participation ≥ 70%", () => {
    // (10+15)/(10+20) = 83%
    const kp = titled(run(mkParticipant({ kills: 10, assists: 15 })), "Excelente participación");
    expect(kp).toMatchObject({ category: "macro", severity: "good" });
    expect(kp!.detail).toMatch(/^83% KP/);
  });

  it("skips kill participation when the team has zero kills", () => {
    // Assists > 0 make the guard observable: without it, 3/0 = Infinity would read as "Excelente".
    const me = mkParticipant({ kills: 0, assists: 3 });
    const match = mkMatch(me);
    for (const p of match.participants) if (p.teamId === me.teamId) p.kills = 0;
    const insights = run(me, { match });
    expect(
      insights.some((i) => i.title.startsWith("Participación") || i.title.startsWith("Excelente"))
    ).toBe(false);
  });

  it.each([
    ["MIDDLE", "27"],
    ["BOTTOM", "28"],
  ])("flags very low damage share for a %s carry (target %s percent)", (position, target) => {
    // 5000 / (5000 + 4×15000) = 8%
    const d = titled(run(mkParticipant({ position, totalDamageDealtToChampions: 5000 })), "Daño muy bajo");
    expect(d).toMatchObject({ category: "combat", severity: "bad" });
    expect(d!.detail).toBe(`Hiciste 8% del daño del equipo (objetivo en ${position}: ${target}%).`);
  });

  it("does not apply the damage-share check to non-carry roles", () => {
    const insights = run(mkParticipant({ position: "TOP", totalDamageDealtToChampions: 5000 }));
    expect(titled(insights, "Daño muy bajo")).toBeUndefined();
  });

  it("skips damage share when the team dealt no damage", () => {
    const me = mkParticipant({ totalDamageDealtToChampions: 0 });
    const match = mkMatch(me);
    for (const p of match.participants) if (p.teamId === me.teamId) p.totalDamageDealtToChampions = 0;
    expect(titled(run(me, { match }), "Daño muy bajo")).toBeUndefined();
  });

  it.each([
    ["MIDDLE", "1.4"],
    ["BOTTOM", "1.4"],
    ["JUNGLE", "1.1"],
    ["TOP", "1.0"],
    ["UTILITY", "0.5"],
  ])("damage-per-gold for %s uses a %s target", (position, target) => {
    // 1000 dmg / 12000 gold = 0.08 — below 60% of every target
    const d = titled(
      run(mkParticipant({ position, totalDamageDealtToChampions: 1000 })),
      "Daño por oro bajo"
    );
    expect(d).toMatchObject({ category: "combat", severity: "warn" });
    expect(d!.detail.startsWith(`0.08 dmg/gold. Objetivo: ${target}+.`)).toBe(true);
  });

  it("damage-per-gold stays quiet just above 60% of the jungle target", () => {
    // 8000 / 12000 = 0.667 ≥ 0.66
    const insights = run(mkParticipant({ position: "JUNGLE", totalDamageDealtToChampions: 8000 }));
    expect(titled(insights, "Daño por oro bajo")).toBeUndefined();
  });
});

describe("coachEngine — gold efficiency", () => {
  beforeEach(() => setCoachEloBucket("DIAMOND"));

  it("warns an ADC holding less than 20% of team gold", () => {
    // 8000 / (8000 + 4×10000) = 17%
    const g = titled(run(mkParticipant({ position: "BOTTOM", goldEarned: 8000 })), "Oro bajo como ADC");
    expect(g).toMatchObject({ category: "macro", severity: "warn" });
    expect(g!.detail).toMatch(/^17% del oro del equipo/);
  });

  it.each(["MIDDLE", "TOP"])("warns %s about GPM below 320", (position) => {
    const g = titled(run(mkParticipant({ position, goldEarned: 9000 })), "GPM bajo");
    expect(g!.detail).toBe(`300 oro/min. Diamond promedio en ${position}: 380+.`);
  });

  it("does not apply the GPM check to junglers", () => {
    expect(titled(run(mkParticipant({ position: "JUNGLE", goldEarned: 9000 })), "GPM bajo")).toBeUndefined();
  });

  it("skips gold checks (and damage-per-gold) when nobody earned gold", () => {
    // MIDDLE makes the team-gold guard observable: without it, 0 GPM would trigger "GPM bajo".
    const me = mkParticipant({ position: "MIDDLE", goldEarned: 0 });
    const match = mkMatch(me);
    for (const p of match.participants) if (p.teamId === me.teamId) p.goldEarned = 0;
    const insights = run(me, { match });
    expect(titled(insights, "GPM bajo")).toBeUndefined();
    expect(titled(insights, "Daño por oro bajo")).toBeUndefined();
  });
});

describe("coachEngine — objectives & build", () => {
  beforeEach(() => setCoachEloBucket("DIAMOND"));

  it("warns when the enemy (participants 6-10) took 4+ dragons; own dragons don't count", () => {
    const insights = run(mkParticipant(), {
      events: [
        elite(6, 7, "DRAGON"),
        elite(12, 8, "DRAGON"),
        elite(18, 9, "DRAGON"),
        elite(24, 10, "DRAGON"),
        elite(29, 2, "DRAGON"),
      ],
    });
    const d = titled(insights, "Dragones perdidos");
    expect(d).toMatchObject({ category: "objectives", severity: "warn" });
    expect(d!.detail).toMatch(/cedió 4 dragones/);
  });

  it("3 lost dragons is not enough to warn", () => {
    const insights = run(mkParticipant(), {
      events: [elite(6, 7, "DRAGON"), elite(12, 8, "DRAGON"), elite(18, 9, "DRAGON"), elite(24, 1, "DRAGON")],
    });
    expect(titled(insights, "Dragones perdidos")).toBeUndefined();
  });

  it("maps killers 1-5 to the enemy when I'm on the red side (teamId 200)", () => {
    const me = mkParticipant({ teamId: 200, participantId: 6 });
    const insights = run(me, {
      events: [elite(6, 1, "DRAGON"), elite(12, 2, "DRAGON"), elite(18, 3, "DRAGON"), elite(24, 4, "DRAGON")],
    });
    expect(titled(insights, "Dragones perdidos")).toBeDefined();
  });

  it("notes an enemy Baron as info for laners, but not for the jungler", () => {
    const events = [elite(25, 7, "BARON_NASHOR")];
    expect(titled(run(mkParticipant(), { events }), "Baron al rival")).toMatchObject({
      category: "objectives",
      severity: "info",
    });
    expect(titled(run(mkParticipant({ position: "JUNGLE" }), { events }), "Baron al rival")).toBeUndefined();
  });

  it("does not report a Baron my own team took", () => {
    const insights = run(mkParticipant(), { events: [elite(25, 3, "BARON_NASHOR")] });
    expect(titled(insights, "Baron al rival")).toBeUndefined();
  });

  it("recommends armor against a physical-heavy enemy team", () => {
    const me = mkParticipant();
    const match = mkMatch(me);
    for (const p of match.participants) {
      if (p.teamId !== me.teamId) {
        p.magicDamageDealtToChampions = 1_000;
        p.physicalDamageDealtToChampions = 6_000;
      }
    }
    const b = titled(run(me, { match }), "Enemigo mayormente físico");
    expect(b).toMatchObject({ category: "build", severity: "info" });
    expect(b!.detail).toBe("El equipo enemigo hizo 86% de su daño como físico.");
    expect(b!.action).toMatch(/armadura/);
  });

  it("gives no build insight when the enemy dealt no damage at all", () => {
    const me = mkParticipant();
    const match = mkMatch(me);
    for (const p of match.participants) {
      if (p.teamId !== me.teamId) {
        p.magicDamageDealtToChampions = 0;
        p.physicalDamageDealtToChampions = 0;
      }
    }
    expect(run(me, { match }).some((i) => i.category === "build")).toBe(false);
  });
});

describe("coachEngine — first blood & snowball", () => {
  beforeEach(() => setCoachEloBucket("DIAMOND"));

  it("credits first blood when I made the earliest kill", () => {
    const fb = titled(run(mkParticipant(), { events: [kill(2, 1, 6)] }), "First blood");
    expect(fb).toMatchObject({ category: "macro", severity: "good" });
  });

  it("picks the earliest kill by timestamp, not by event order", () => {
    // Event order lists my kill first, but my death happened earlier.
    const insights = run(mkParticipant(), { events: [kill(5, 1, 6), kill(2.5, 6, 1, [7])] });
    const fb = titled(insights, "First blood en tu contra");
    expect(fb).toMatchObject({ category: "deaths", severity: "warn" });
    expect(fb!.detail).toBe("Moriste en el primer kill de la partida (2.5min).");
    expect(titled(insights, "First blood")).toBeUndefined();
  });

  it("says nothing about first blood when I wasn't involved", () => {
    const insights = run(mkParticipant(), { events: [kill(1, 2, 7), kill(4, 1, 8)] });
    expect(insights.some((i) => i.title.startsWith("First blood"))).toBe(false);
  });

  it("praises a converted lead (≥6 K+A, ≤2 deaths, win, 20+ min)", () => {
    // Exactly on every threshold: K+A = 6, deaths = 2, 20:00.
    const s = titled(
      run(mkParticipant({ kills: 2, deaths: 2, assists: 4, win: true }), { durationSec: 1200 }),
      "Snowball ejecutado"
    );
    expect(s).toMatchObject({ category: "combat", severity: "good" });
    expect(s!.detail).toBe("2/2/4 — convertiste la lead en victoria.");
  });

  it("warns about a wasted lead on a loss", () => {
    const s = titled(
      run(mkParticipant({ kills: 8, deaths: 1, assists: 6, win: false }), { durationSec: 1200 }),
      "Lead desperdiciada"
    );
    expect(s).toMatchObject({ category: "macro", severity: "warn" });
    expect(s!.detail).toMatch(/^8\/1\/6 pero perdiste/);
  });

  it("skips snowball analysis before 20 min, with 3+ deaths or under 6 K+A", () => {
    const snow = (i: { title: string }) => i.title === "Snowball ejecutado" || i.title === "Lead desperdiciada";
    const early = run(mkParticipant({ kills: 8, deaths: 1, assists: 6, win: true }), { durationSec: 1170 });
    const fed = run(mkParticipant({ kills: 8, deaths: 3, assists: 6, win: true }), { durationSec: 1200 });
    const quiet = run(mkParticipant({ kills: 1, deaths: 0, assists: 4, win: true }), { durationSec: 1200 });
    expect(early.some(snow)).toBe(false);
    expect(fed.some(snow)).toBe(false);
    expect(quiet.some(snow)).toBe(false);
  });
});

describe("coachEngine — lane phase (CS@14)", () => {
  beforeEach(() => setCoachEloBucket("DIAMOND"));

  it("flags CS@14 below 70% of the 105 mid target, summing minions + jungle", () => {
    const l = titled(
      run(mkParticipant(), { timeline: timelineWith14([pframe(1, 45, 5)]) }),
      "CS@14 muy bajo: 50"
    );
    expect(l).toMatchObject({ category: "farming", severity: "bad" });
    expect(l!.detail).toBe("Objetivo en MIDDLE: 105+. Saliste de lane phase sin oro.");
  });

  it("uses a 130 target for BOTTOM (85 flagged, 95 fine)", () => {
    const bot = mkParticipant({ position: "BOTTOM" });
    const low = run(bot, { timeline: timelineWith14([pframe(1, 85)]) });
    expect(titled(low, "CS@14 muy bajo: 85")!.detail).toMatch(/^Objetivo en BOTTOM: 130\+/);
    const ok = run(bot, { timeline: timelineWith14([pframe(1, 95)]) });
    expect(ok.some((i) => i.title.startsWith("CS@14"))).toBe(false);
  });

  it.each(["JUNGLE", "UTILITY"])("skips the lane check for %s", (position) => {
    const insights = run(mkParticipant({ position }), { timeline: timelineWith14([pframe(1, 10)]) });
    expect(insights.some((i) => i.title.startsWith("CS@14"))).toBe(false);
  });

  it("skips the lane check when the 14-min frame has no entry for me", () => {
    const insights = run(mkParticipant(), { timeline: timelineWith14([pframe(2, 10)]) });
    expect(insights.some((i) => i.title.startsWith("CS@14"))).toBe(false);
  });

  it("orders bad → warn → good → info regardless of push order (stable within severity)", () => {
    const tl = timelineWith14([pframe(1, 50)]);
    tl.frames[0].events = [kill(2, 1, 6), elite(20, 7, "BARON_NASHOR")] as never;
    // 210 CS → no farming insight; 1 pink → warn; (10+15)/30 KP → good
    const insights = run(mkParticipant({ cs: 210, kills: 10, assists: 15, controlWardsBought: 1 }), { timeline: tl });
    expect(insights.map((i) => i.title)).toEqual([
      "CS@14 muy bajo: 50",
      "Pocos control wards",
      "Excelente participación",
      "First blood",
      "Baron al rival",
    ]);
  });
});
