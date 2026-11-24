import { describe, it, expect, beforeEach } from "vitest";
import { analyzeMatch, setCoachEloBucket } from "./coachEngine";
import { i18n } from "../i18n";
import enBundle from "../i18n/locales/en.json";
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

  it("jungle farm is judged against today's camps (Gold: 6.3/min), not praised at 5", () => {
    setCoachEloBucket("GOLD");
    const farm = (cs: number) =>
      analyzeMatch({ match: mkMatch(mkParticipant({ cs, position: "JUNGLE" }), 1800), timeline: mkTimeline(), myPuuid: "me" })
        .find((i) => i.category === "farming")?.severity;
    expect(farm(150)).toBe("warn"); // 5.0/min
    expect(farm(180)).toBeUndefined(); // 6.0/min
    expect(farm(195)).toBe("good"); // 6.5/min
    setCoachEloBucket("DIAMOND");
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
  opts: {
    durationSec?: number;
    events?: Ev[];
    timeline?: MatchTimeline;
    match?: MatchFull;
    itemTags?: (id: number) => string[];
  } = {}
) {
  return analyzeMatch({
    match: opts.match ?? mkMatch(me, opts.durationSec ?? 1800),
    timeline: opts.timeline ?? mkTimeline(opts.events ?? []),
    myPuuid: "me",
    itemTags: opts.itemTags,
  });
}

/** How the coach names each position in Spanish (coach.roles). */
const ROLE_ES: Record<string, string> = { TOP: "top", JUNGLE: "jungla", MIDDLE: "mid", BOTTOM: "ADC", UTILITY: "support" };

const titled = (insights: ReturnType<typeof analyzeMatch>, title: string) =>
  insights.find((i) => i.title === title);

describe("coachEngine — baseline & guards", () => {
  beforeEach(() => setCoachEloBucket("DIAMOND"));

  it("default mid-laner produces exactly one insight: CS mejorable with the diamond target", () => {
    const insights = run(mkParticipant({ cs: 180 }));
    expect(insights).toHaveLength(1);
    expect(insights[0]).toMatchObject({
      category: "farming",
      severity: "warn",
      title: "CS mejorable",
      detail: "6.0 CS/min. Margen para llegar a 7.0.",
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
    ["IRON", "4.7"],
    ["bronze", "4.7"], // lower-case tiers are normalised
    ["SILVER", "5.6"],
    ["GOLD", "6.4"],
    ["PLATINUM", "6.4"],
    ["EMERALD", "6.4"],
    ["DIAMOND", "7.0"],
    ["MASTER", "7.6"],
    ["GRANDMASTER", "7.6"],
    ["Challenger", "7.6"],
  ])("tier %s uses a MIDDLE CS/min target of %s", (tier, target) => {
    setCoachEloBucket(tier);
    // 60 CS / 30 min = 2.0/min: "bad" in every bucket, so the detail always names the target.
    const farm = titled(run(mkParticipant({ cs: 60 })), "CS muy bajo");
    expect(farm).toBeDefined();
    expect(farm!.detail).toBe(`Conseguiste 2.0 CS/min. El objetivo en mid es ${target}+.`);
    expect(farm!.metric).toBe("60 CS en 30min");
  });

  it("ignores undefined, empty and unknown tiers (keeps the previous bucket)", () => {
    setCoachEloBucket("SILVER");
    setCoachEloBucket(undefined);
    setCoachEloBucket("");
    setCoachEloBucket("UNRANKED");
    const farm = titled(run(mkParticipant({ cs: 60 })), "CS muy bajo");
    expect(farm!.detail).toContain("es 5.6+");
  });

  it("a lower bucket turns the same CS from 'bad' into 'warn'", () => {
    // 120 CS / 30 min = 4.0/min. Diamond target 7.0 → bad; iron target 4.7 → 85% → warn.
    const me = mkParticipant({ cs: 120 });
    expect(titled(run(me), "CS muy bajo")).toBeDefined();
    setCoachEloBucket("IRON");
    const insights = run(me);
    expect(titled(insights, "CS muy bajo")).toBeUndefined();
    expect(titled(insights, "CS mejorable")!.detail).toBe("4.0 CS/min. Margen para llegar a 4.7.");
  });
});

describe("coachEngine — farming & vision", () => {
  beforeEach(() => setCoachEloBucket("DIAMOND"));

  it("falls back to a 6.0 CS/min target for an unknown role", () => {
    const farm = titled(run(mkParticipant({ cs: 60, position: "" })), "CS muy bajo");
    expect(farm!.detail).toContain("es 6.0+");
  });

  it("emits no farming insight between 90% and 100% of target", () => {
    // 195 / 30 = 6.5/min = 93% of 7.0
    expect(run(mkParticipant({ cs: 195 })).some((i) => i.category === "farming")).toBe(false);
  });

  it("flags very low vision with wards metric for a non-support", () => {
    const v = titled(
      run(mkParticipant({ visionScore: 10, wardsPlaced: 7, controlWardsBought: 2 })),
      "Visión muy baja"
    );
    expect(v).toMatchObject({ category: "vision", severity: "warn" });
    expect(v!.detail).toBe("Vision score 10 (0.33/min). Objetivo: 0.70+/min.");
    expect(v!.metric).toBe("7 wards puestas, 2 control wards");
  });

  it("support: warns when pinks are scarce (one every 8 min)", () => {
    // 30 min → expects at least floor(30/8) = 3 pinks
    const insights = run(mkParticipant({ position: "UTILITY", visionScore: 60, controlWardsBought: 2 }));
    const v = titled(insights, "Pocos control wards");
    expect(v).toMatchObject({ category: "vision", severity: "warn" });
    expect(v!.detail).toBe("Solo pusiste 2 control wards en 30min.");
    expect(titled(insights, "Visión muy baja")).toBeUndefined();
    expect(titled(run(mkParticipant({ position: "UTILITY", visionScore: 60, controlWardsBought: 3 })), "Pocos control wards")).toBeUndefined();
  });

  it("support: 1.2 vision a minute is very low for the role that wards", () => {
    // 30 min: 36 → 1.2/min (< 60% of 2.5); 60 → 2.0/min is fine
    expect(titled(run(mkParticipant({ position: "UTILITY", visionScore: 36, controlWardsBought: 4 })), "Visión muy baja")).toMatchObject({ severity: "bad" });
    expect(titled(run(mkParticipant({ position: "UTILITY", visionScore: 60, controlWardsBought: 4 })), "Visión muy baja")).toBeUndefined();
  });

  it("jungle: warns only for none at all", () => {
    expect(titled(run(mkParticipant({ position: "JUNGLE", controlWardsBought: 0 })), "Pocos control wards")).toMatchObject({ severity: "warn" });
    expect(titled(run(mkParticipant({ position: "JUNGLE", controlWardsBought: 1 })), "Pocos control wards")).toBeUndefined();
  });

  it("laners: a note (not a warning) for none, nothing for one, nothing in a short game", () => {
    expect(titled(run(mkParticipant({ controlWardsBought: 0 })), "Pocos control wards")).toMatchObject({ severity: "info" });
    expect(titled(run(mkParticipant({ controlWardsBought: 1 })), "Pocos control wards")).toBeUndefined();
    expect(titled(run(mkParticipant({ controlWardsBought: 0 }), { durationSec: 1140 }), "Pocos control wards")).toBeUndefined();
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
    const insights = run(mkParticipant({ position: "BOTTOM" }), {
      events: [kill(10, 6, 1), kill(15, 7, 1, []), kill(20, 8, 1)],
    });
    expect(titled(insights, "3 solo deaths")).toMatchObject({ category: "deaths", severity: "warn" });
    expect(insights.some((i) => /muertes (en early|tempranas)/.test(i.title))).toBe(false);
  });

  it("top and mid, alone in their lane, need 4 solo deaths", () => {
    const three = [kill(10, 6, 1), kill(15, 7, 1), kill(20, 8, 1)];
    for (const position of ["TOP", "MIDDLE"]) {
      expect(run(mkParticipant({ position }), { events: three }).some((i) => i.title.includes("solo deaths"))).toBe(false);
      const four = run(mkParticipant({ position }), { events: [...three, kill(25, 6, 1)] });
      expect(titled(four, "4 solo deaths")).toMatchObject({ severity: "warn" });
    }
  });

  it("no '2 early deaths' warning for the ADC, but 3 is still bad", () => {
    const two = [kill(3, 6, 1, [7]), kill(6, 7, 1, [8])];
    expect(titled(run(mkParticipant({ position: "BOTTOM" }), { events: two }), "2 muertes tempranas")).toBeUndefined();
    const three = [...two, kill(7, 8, 1, [9])];
    expect(titled(run(mkParticipant({ position: "BOTTOM" }), { events: three }), "3 muertes en early")).toMatchObject({
      severity: "bad",
    });
  });

  it("flags 8+ deaths in a game shorter than 24 min", () => {
    const d = titled(run(mkParticipant({ deaths: 8 }), { durationSec: 1440 }), "Muchas muertes");
    expect(d).toMatchObject({ category: "deaths", severity: "bad" });
    expect(d!.detail).toBe("8 muertes en 24min.");
    expect(titled(run(mkParticipant({ deaths: 7 }), { durationSec: 1440 }), "Muchas muertes")).toBeUndefined();
  });

  it("in long games asks for one death every 3 minutes", () => {
    expect(titled(run(mkParticipant({ deaths: 10 }), { durationSec: 1800 }), "Muchas muertes")).toBeDefined();
    expect(titled(run(mkParticipant({ deaths: 9 }), { durationSec: 1800 }), "Muchas muertes")).toBeUndefined();
    expect(titled(run(mkParticipant({ deaths: 12 }), { durationSec: 36 * 60 }), "Muchas muertes")!.detail).toBe(
      "12 muertes en 36min."
    );
    expect(titled(run(mkParticipant({ deaths: 11 }), { durationSec: 36 * 60 }), "Muchas muertes")).toBeUndefined();
  });
});

describe("coachEngine — kill participation & damage", () => {
  beforeEach(() => setCoachEloBucket("DIAMOND"));

  it("warns on low kill participation with the percentage", () => {
    // allies 4×5 kills + mine 0 = 20 team kills; (0+2)/20 = 10%
    const kp = titled(run(mkParticipant({ position: "BOTTOM", kills: 0, assists: 2 })), "Participación baja");
    expect(kp).toMatchObject({ category: "macro", severity: "warn" });
    expect(kp!.detail).toBe("Solo participaste en 10% de las kills del equipo.");
  });

  it("top is alone on its side: 25% is not low there, but it is for a mid", () => {
    // allies 4×5 kills + mine 1 = 21; (1+4)/21 = 24%
    expect(titled(run(mkParticipant({ position: "TOP", kills: 1, assists: 4 })), "Participación baja")).toBeUndefined();
    expect(titled(run(mkParticipant({ kills: 1, assists: 4 })), "Participación baja")).toMatchObject({ severity: "info" });
  });

  it("low participation is a warning for top, ADC and support, a note for jungle and mid", () => {
    const sev = (position: string) =>
      titled(run(mkParticipant({ position, kills: 0, assists: 2 })), "Participación baja")!.severity;
    expect(["TOP", "BOTTOM", "UTILITY"].map(sev)).toEqual(["warn", "warn", "warn"]);
    expect(["JUNGLE", "MIDDLE"].map(sev)).toEqual(["info", "info"]);
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

  it("flags very low damage share for a mid (target 24 percent)", () => {
    // 5000 / (5000 + 4×15000) = 8%
    const d = titled(run(mkParticipant({ totalDamageDealtToChampions: 5000 })), "Daño muy bajo");
    expect(d).toMatchObject({ category: "combat", severity: "bad" });
    expect(d!.detail).toBe(`Hiciste 8% del daño del equipo (objetivo en ${ROLE_ES.MIDDLE}: 24%).`);
  });

  it("flags an ADC under 450 damage a minute, whatever the share", () => {
    // 13200 / 30 min = 440 a minute
    const d = titled(run(mkParticipant({ position: "BOTTOM", totalDamageDealtToChampions: 13200 })), "Daño muy bajo");
    expect(d).toMatchObject({ category: "combat", severity: "bad" });
    expect(d!.detail).toBe("440 de daño a campeones por minuto. Por debajo de 450, el ADC no está pegando en las peleas.");
    // 13500 / 30 = 450 a minute, though only 13500 / (13500 + 4×15000) = 18% of the team's damage
    expect(titled(run(mkParticipant({ position: "BOTTOM", totalDamageDealtToChampions: 13500 })), "Daño muy bajo")).toBeUndefined();
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

  it("warns an ADC under 380 gold a minute", () => {
    // 11100 / 30 min = 370
    const g = titled(run(mkParticipant({ position: "BOTTOM", goldEarned: 11100 })), "Oro bajo como ADC");
    expect(g).toMatchObject({ category: "macro", severity: "warn" });
    expect(g!.detail).toBe("370 de oro por minuto. Por debajo de 380, el ADC llega tarde a sus objetos clave.");
  });

  it("a small share of a rich team's gold is not low gold", () => {
    // 11400 / 30 = 380 a minute, but only 11400 / (11400 + 4×15000) = 16% of the team's gold
    const me = mkParticipant({ position: "BOTTOM", goldEarned: 11400 });
    const match = mkMatch(me);
    match.participants.forEach((p) => p.teamId === me.teamId && p.puuid !== me.puuid && (p.goldEarned = 15000));
    expect(titled(run(me, { match }), "Oro bajo como ADC")).toBeUndefined();
  });

  it.each(["MIDDLE", "TOP"])("warns %s about GPM below 320", (position) => {
    const g = titled(run(mkParticipant({ position, goldEarned: 9000 })), "GPM bajo");
    expect(g!.detail).toBe(`300 oro/min. Diamond promedio en ${ROLE_ES[position]}: 380+.`);
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

  // 23/11 real game: Ornn with Sunfire, Plated Steelcaps and Bramble Vest
  // was told to "prioritise armor".
  it("skips the resist advice when I already built two items of it", () => {
    const TAGS: Record<number, string[]> = { 3068: ["Armor", "Health"], 3047: ["Armor", "Boots"], 3076: ["Armor"], 3065: ["SpellBlock"] };
    const tags = (id: number) => TAGS[id] ?? [];
    const physicalMatch = (items: number[]) => {
      const me = mkParticipant({ items });
      const match = mkMatch(me);
      for (const p of match.participants) {
        if (p.teamId !== me.teamId) {
          p.magicDamageDealtToChampions = 1_000;
          p.physicalDamageDealtToChampions = 6_000;
        }
      }
      return run(me, { match, itemTags: tags });
    };
    expect(titled(physicalMatch([3068, 3047, 3076, 3340]), "Enemigo mayormente físico")).toBeUndefined();
    // One armor item, or only magic resist: still worth saying.
    expect(titled(physicalMatch([3068, 3340]), "Enemigo mayormente físico")).toBeDefined();
    expect(titled(physicalMatch([3065, 3340]), "Enemigo mayormente físico")).toBeDefined();
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
    expect(l!.detail).toBe("Objetivo en mid: 105+. Saliste de lane phase sin oro.");
  });

  it("uses a 110 target for BOTTOM (75 flagged, 80 fine)", () => {
    const bot = mkParticipant({ position: "BOTTOM" });
    const low = run(bot, { timeline: timelineWith14([pframe(1, 75)]) });
    expect(titled(low, "CS@14 muy bajo: 75")!.detail).toMatch(/^Objetivo en ADC: 110\+/);
    const ok = run(bot, { timeline: timelineWith14([pframe(1, 80)]) });
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
    // 195 CS → no farming insight; a mid without pinks → info (pushed before the goods); (10+15)/30 KP → good
    const insights = run(mkParticipant({ cs: 195, kills: 10, assists: 15, controlWardsBought: 0 }), { timeline: tl });
    expect(insights.map((i) => i.title)).toEqual([
      "CS@14 muy bajo: 50",
      "Excelente participación",
      "First blood",
      "Pocos control wards",
      "Baron al rival",
    ]);
  });
});

describe("coachEngine — role & queue awareness", () => {
  beforeEach(() => setCoachEloBucket("DIAMOND"));

  it("returns no Summoner's Rift insights for ARAM / Arena games", () => {
    const me = mkParticipant({ position: "", cs: 20, visionScore: 2, deaths: 9 });
    const aram = { ...mkMatch(me), queueId: 450 };
    expect(analyzeMatch({ match: aram, timeline: mkTimeline(), myPuuid: "me" })).toEqual([]);
    const arena = { ...mkMatch(me), queueId: 1700 };
    expect(analyzeMatch({ match: arena, timeline: mkTimeline(), myPuuid: "me" })).toEqual([]);
  });

  it("early-death advice for a jungler does not talk about pushing a lane", () => {
    const early = [kill(2, 6, 1, [7]), kill(4, 7, 1, [8]), kill(6, 8, 1, [9])];
    const jg = titled(run(mkParticipant({ position: "JUNGLE" }), { events: early }), "3 muertes en early");
    expect(jg!.action).not.toMatch(/Pushea/);
    const mid = titled(run(mkParticipant({ position: "MIDDLE" }), { events: early }), "3 muertes en early");
    expect(mid!.action).toMatch(/Pushea/);

    const two = [kill(2, 6, 1, [7]), kill(4, 7, 1, [8])];
    const jgWarn = titled(run(mkParticipant({ position: "JUNGLE" }), { events: two }), "2 muertes tempranas");
    expect(jgWarn!.detail).not.toMatch(/ganks/);
  });
});

describe("coachEngine — trinket swap", () => {
  beforeEach(() => setCoachEloBucket("DIAMOND"));

  const buy = (min: number, itemId: number, participantId = 1) => ({
    timestamp: min * 60_000,
    type: "ITEM_PURCHASED",
    participantId,
    itemId,
  });
  const support = (o: Partial<MatchParticipant> = {}) =>
    mkParticipant({ position: "UTILITY", items: [3869, 3340], ...o });
  const jungler = (o: Partial<MatchParticipant> = {}) =>
    mkParticipant({ position: "JUNGLE", items: [3006, 3340], ...o });
  const adc = (o: Partial<MatchParticipant> = {}) =>
    mkParticipant({ position: "BOTTOM", items: [3031, 3340], ...o });
  /** One frame per minute; my level reaches 9 at `lvl9At`. */
  const levelTimeline = (lvl9At: number, events: Array<ReturnType<typeof buy>> = []): MatchTimeline => ({
    matchId: "EUW1_TEST",
    participantToPuuid: { 1: "me" },
    frames: Array.from({ length: 31 }, (_, m) => ({
      timestamp: m * 60_000,
      events: (m === 0 ? events : []) as never,
      participantFrames: { 1: { level: m >= lvl9At ? 9 : 8 } } as never,
    })) as never,
  });
  const NEVER = "No cambiaste el trinket";
  const LATE = "Cambio de trinket tarde";

  /** World Atlas turning into Runic Compass, which already places wards. */
  const atlas = (min: number) => ({ timestamp: min * 60_000, type: "ITEM_DESTROYED", participantId: 1, itemId: 3865 });
  /** My trips to base at these minutes (one purchase each). */
  const trips = (...mins: number[]) => mins.map((m) => buy(m, 1001));
  const tl = (events: Array<Record<string, unknown>>, lvl9At = 99) => levelTimeline(lvl9At, events as never);

  // Rafael 24/11: support swaps on the first trip after the item places wards,
  // jungle on the first or second trip, ADC on the first trip after level 9.
  it("flags a support, jungler or ADC who had their trip to base and kept the Stealth Ward (a note for ADC and jungle)", () => {
    const cases = [
      [support(), "support", "warn", tl([atlas(7), ...trips(9, 12)])],
      [jungler(), "jungla", "info", tl(trips(5, 9, 13))],
      [adc(), "ADC", "info", tl(trips(13, 16), 12)],
    ] as const;
    for (const [who, role, severity, timeline] of cases) {
      const ins = titled(run(who, { timeline }), NEVER);
      expect(ins).toMatchObject({ category: "vision", severity });
      expect(ins!.detail).toMatch(new RegExp(`30 min de ${role}`));
      expect(ins!.action).toMatch(/tienda/);
    }
    expect(titled(run(support(), { timeline: tl([atlas(7), ...trips(9)]) }), NEVER)!.detail).toMatch(/minuto 7 \(Brújula rúnica\)/);
    expect(titled(run(adc(), { timeline: tl(trips(13), 12) }), NEVER)!.detail).toMatch(/Visión lejana modificada.*minuto 12/);
  });

  it("says nothing until there was a trip to base to swap on", () => {
    // Support: no wards yet, or no trip since. Jungle: one trip only. ADC: none after level 9.
    expect(titled(run(support(), { timeline: tl(trips(5, 9)) }), NEVER)).toBeUndefined();
    expect(titled(run(support(), { timeline: tl([...trips(5), atlas(8)]) }), NEVER)).toBeUndefined();
    expect(titled(run(jungler(), { timeline: tl(trips(5)) }), NEVER)).toBeUndefined();
    expect(titled(run(adc(), { timeline: tl(trips(8, 11), 12) }), NEVER)).toBeUndefined();
    expect(titled(run(adc({ champLevel: 8 }), { timeline: tl(trips(8, 11)) }), NEVER)).toBeUndefined();
  });

  it("does not count the starting purchases, and buys a few seconds apart are one trip", () => {
    expect(titled(run(jungler(), { timeline: tl([buy(0.2, 3340), ...trips(5)]) }), NEVER)).toBeUndefined();
    expect(titled(run(jungler(), { timeline: tl(trips(5, 5.5)) }), NEVER)).toBeUndefined();
  });

  it("says nothing when the swap came on time", () => {
    const cases = [
      [support({ items: [3869, 3364] }), tl([atlas(7), buy(9, 1001), buy(9.2, 3364), ...trips(12)])],
      [jungler({ items: [3006, 3364] }), tl([...trips(5), buy(9, 3364), ...trips(13)])],
      [adc({ items: [3031, 3363] }), tl([...trips(8), buy(13, 3363)], 12)],
    ] as const;
    for (const [who, timeline] of cases) {
      const ins = run(who, { timeline });
      expect(titled(ins, NEVER)).toBeUndefined();
      expect(titled(ins, LATE)).toBeUndefined();
    }
  });

  it("flags a swap after the trip it was due on, with both minutes", () => {
    const cases = [
      [support({ items: [3869, 3364] }), tl([atlas(7), ...trips(9), buy(11.5, 3364)]), /minuto 11\. .*minuto 9\./],
      [jungler({ items: [3006, 3364] }), tl([...trips(5, 9), buy(13, 3364)]), /minuto 13\. .*minuto 9\./],
      [adc({ items: [3031, 3363] }), tl([...trips(13), buy(16, 3363)], 12), /minuto 16\. .*minuto 13\./],
    ] as const;
    for (const [who, timeline, text] of cases) {
      const ins = titled(run(who, { timeline }), LATE);
      expect(ins).toMatchObject({ category: "vision", severity: "info" });
      expect(ins!.detail).toMatch(text);
    }
  });

  it("uses the earliest swap and ignores other players' purchases", () => {
    const who = jungler({ items: [3006, 3364] });
    const early = run(who, { timeline: tl([buy(4, 1001, 7), buy(5, 3364, 7), ...trips(5), buy(9, 3364), buy(25, 3364)]) });
    expect(titled(early, LATE)).toBeUndefined();
    const late = run(who, { timeline: tl([buy(9, 3364, 7), ...trips(5, 9), buy(25, 3364)]) });
    expect(titled(late, LATE)!.detail).toMatch(/minuto 25/);
  });

  it("trusts the final items when the timeline has no swap event", () => {
    expect(titled(run(support({ items: [3869, 3364] }), { timeline: tl([atlas(7), ...trips(9)]) }), NEVER)).toBeUndefined();
  });

  // Rafael 23/11: Fiddlesticks' trinket is his own Scarecrow Effigy and cannot be swapped.
  it("never tells Fiddlesticks to swap: his Scarecrow Effigy is locked", () => {
    for (const who of [
      jungler({ championId: 9, items: [3006, 3330] }),
      jungler({ championId: 9, items: [3006] }),
      support({ championId: 9, items: [3869, 3330] }),
    ]) {
      const ins = run(who);
      expect(titled(ins, NEVER)).toBeUndefined();
      expect(titled(ins, LATE)).toBeUndefined();
    }
  });

  it("never nags top or mid, who keep the ward on purpose", () => {
    for (const position of ["TOP", "MIDDLE"]) {
      const ins = run(mkParticipant({ position, items: [3006, 3340] }));
      expect(titled(ins, NEVER)).toBeUndefined();
      expect(titled(ins, LATE)).toBeUndefined();
    }
  });

  // Rafael 23/11: in mid it depends on the game — a gentle note only.
  // Rafael 24/11: none for top (Master+ tops keep the yellow one).
  const SOFT = "Acabaste con el trinket amarillo";
  it("gives mid a gentle info note after 25+ min still on the yellow trinket", () => {
    const ins = titled(run(mkParticipant({ position: "MIDDLE", items: [3006, 3340] })), SOFT);
    expect(ins).toMatchObject({ category: "vision", severity: "info" });
    expect(ins!.detail).toMatch(/^Jugaste 30 min de mid sin cambiar de trinket. En mid depende de la partida/);
    expect(ins!.action).toBeUndefined();
  });

  it("no gentle note after a swap, in a short game, for top or for other roles", () => {
    const mid = (o: Partial<MatchParticipant> = {}) => mkParticipant({ position: "MIDDLE", items: [3006, 3340], ...o });
    expect(titled(run(mid({ items: [3006, 3364] })), SOFT)).toBeUndefined();
    expect(titled(run(mid(), { events: [buy(18, 3363)] }), SOFT)).toBeUndefined();
    expect(titled(run(mid(), { durationSec: 24 * 60 }), SOFT)).toBeUndefined();
    expect(titled(run(mkParticipant({ position: "TOP", items: [3006, 3340] })), SOFT)).toBeUndefined();
    expect(titled(run(support()), SOFT)).toBeUndefined();
  });

  it("speaks English when the app is in English", async () => {
    // Only Spanish is preloaded in tests; English loads lazily in the app.
    i18n.addResourceBundle("en", "translation", enBundle, true, true);
    await i18n.changeLanguage("en");
    try {
      const ins = titled(run(jungler(), { timeline: tl(trips(5, 9)) }), "You never swapped your trinket");
      expect(ins!.detail).toMatch(/30 min of jungle.*second trip to base/);
      expect(ins!.action).toMatch(/shop/);
    } finally {
      await i18n.changeLanguage("es");
    }
  });
});

describe("coachEngine — English", () => {
  it("every insight of a rough game reads in English, with no Spanish or raw keys left", async () => {
    i18n.addResourceBundle("en", "translation", enBundle, true, true);
    await i18n.changeLanguage("en");
    try {
      setCoachEloBucket("DIAMOND");
      // Low CS, vision, damage and gold; early, solo and many deaths; first
      // blood given; dragons and Baron lost: as many checks as one game can hit.
      const me = mkParticipant({
        position: "MIDDLE",
        cs: 60,
        visionScore: 5,
        controlWardsBought: 0,
        deaths: 9,
        kills: 0,
        assists: 1,
        totalDamageDealtToChampions: 2000,
        goldEarned: 6000,
      });
      const events = [
        kill(1, 6, 1),
        kill(3, 7, 1),
        kill(5, 8, 1),
        elite(6, 7, "DRAGON"),
        elite(12, 8, "DRAGON"),
        elite(18, 9, "DRAGON"),
        elite(24, 10, "DRAGON"),
        elite(25, 7, "BARON_NASHOR"),
      ];
      const insights = run(me, { durationSec: 25 * 60, events });
      expect(insights.length).toBeGreaterThan(6);
      for (const ins of insights) {
        for (const text of [ins.title, ins.detail, ins.metric, ins.action]) {
          if (text === undefined) continue;
          expect(text).not.toMatch(/coach\.|[áéíóúñ¿¡]|muerte|equipo|objetivo/i);
        }
      }
      expect(insights.map((i) => i.title)).toContain("Very low CS");
      expect(insights.find((i) => i.title === "Very low CS")!.detail).toMatch(/target for mid/);
    } finally {
      await i18n.changeLanguage("es");
    }
  });
});

// Real lanes come from where each player stood in minutes 3-14 (23/11 games:
// a lane swap Riot didn't see, and a loss that came from another lane).
describe("coachEngine — lane matchup and where the game was lost", () => {
  beforeEach(() => setCoachEloBucket("DIAMOND"));

  const SPOT = { TOP: { x: 1500, y: 12000 }, MID: { x: 7400, y: 7400 }, BOT: { x: 12500, y: 2000 }, JG: { x: 4000, y: 7500 } };
  type Spot = keyof typeof SPOT;
  // mkMatch: me = 1 (MIDDLE); allies 2 TOP, 3 JUNGLE, 4 BOTTOM, 5 UTILITY; enemies 6 TOP, 7 JUNGLE, 8 MIDDLE, 9 BOTTOM, 10 UTILITY.
  const usual: Record<number, Spot> = { 1: "MID", 2: "TOP", 3: "JG", 4: "BOT", 5: "BOT", 6: "TOP", 7: "JG", 8: "MID", 9: "BOT", 10: "BOT" };
  const names: Record<number, string> = { 238: "Zed" };
  const name = (id: number) => names[id] ?? `C${id}`;

  function lanes(
    where: (id: number, min: number) => Spot,
    gold: Record<number, number> = {},
    events: Array<{ timestamp: number; type: string; [k: string]: unknown }> = []
  ): MatchTimeline {
    return {
      matchId: "EUW1_TEST",
      participantToPuuid: { 1: "me" },
      frames: Array.from({ length: 16 }, (_, m) => ({
        timestamp: m * 60_000,
        events: (m === 1 ? events : []) as never,
        participantFrames: Object.fromEntries(
          Array.from({ length: 10 }, (_, i) => [
            String(i + 1),
            {
              participantId: i + 1, currentGold: 0, totalGold: gold[i + 1] ?? 5000, level: 9, xp: 6000,
              minionsKilled: i + 1 === 5 || i + 1 === 10 ? 10 : 100, jungleMinionsKilled: 0,
              position: SPOT[where(i + 1, m)],
            },
          ])
        ),
      })),
    };
  }
  const game = (me: MatchParticipant, durationSec = 1800) => {
    const match = mkMatch(me, durationSec);
    match.participants.forEach((p) => (p.championId = p.participantId === 1 ? 238 : p.participantId));
    return match;
  };
  const coach = (me: MatchParticipant, timeline: MatchTimeline, durationSec = 1800) =>
    analyzeMatch({ match: game(me, durationSec), timeline, myPuuid: "me", championName: name });
  const kill = (t: number, killerId: number, victimId: number) => ({ type: "CHAMPION_KILL", timestamp: t * 60_000, killerId, victimId });

  it("says I won my lane against the enemy in it", () => {
    const out = coach(mkParticipant(), lanes((id) => usual[id], { 1: 5800 }));
    expect(titled(out, "Ganaste tu línea")).toMatchObject({ severity: "good", detail: "En el minuto 14 sacabas 800 de oro a C8." });
  });

  it("calls a lane within 500 gold even", () => {
    const out = coach(mkParticipant(), lanes((id) => usual[id], { 1: 5100 }));
    expect(titled(out, "Línea igualada")!.detail).toBe("En el minuto 14 ibais casi igual en oro con C8: 100 de diferencia.");
  });

  it("follows a lane swap and says how much of the lead came from killing others", () => {
    // I (MIDDLE) go top at minute 5 and my top ally comes mid; enemies stay.
    const where = (id: number, m: number): Spot =>
      id === 1 ? (m < 5 ? "MID" : "TOP") : id === 2 ? (m < 5 ? "TOP" : "MID") : usual[id];
    const out = coach(
      mkParticipant(),
      lanes(where, { 1: 4000 }, [kill(4, 6, 1), kill(6, 6, 2), kill(9, 6, 3)])
    );
    expect(titled(out, "Jugaste en top")!.detail).toBe(
      "Riot te puso de mid, pero entre los minutos 3 y 14 estuviste sobre todo en top. Tu rival de línea fue C6."
    );
    expect(titled(out, "Perdiste tu línea")!.detail).toBe(
      "En el minuto 14 ibas 1000 de oro por detrás de C6. C6 también mató 2 veces a compañeros antes del minuto 14: parte de su ventaja no la perdiste tú."
    );
  });

  it("after a loss, points at the lane that fell furthest behind", () => {
    const ornn = mkParticipant({ win: false });
    const out = coach(ornn, lanes((id) => usual[id], { 3: 3600 }));
    expect(titled(out, "La partida se escapó por jungla")).toMatchObject({
      severity: "info",
      detail: "C3 acabó el minuto 14 con 1400 de oro menos que C7, que terminó 5/5/5. Tu línea fue mejor que esa.",
    });
  });

  it("says nothing about where it was lost after a win, or when my lane was the worst", () => {
    expect(coach(mkParticipant({ win: true }), lanes((id) => usual[id], { 3: 3600 })).some((i) => /se escapó/.test(i.title))).toBe(false);
    expect(coach(mkParticipant(), lanes((id) => usual[id], { 1: 3000, 3: 3600 })).some((i) => /se escapó/.test(i.title))).toBe(false);
  });

  it("counts deaths where two more teammates fell within 15 s as team fights", () => {
    const me = mkParticipant({ deaths: 9 });
    // Minute 10: me, then allies 2 and 3 within 6 s = team fight. Minute 20: alone.
    const ev = [kill(10, 6, 1), kill(10.05, 7, 2), kill(10.1, 8, 3), kill(20, 6, 1)];
    const out = coach(me, lanes((id) => usual[id], {}, ev), 1500);
    expect(titled(out, "Muchas muertes")!.detail).toBe(
      "9 muertes en 25 min; 1 fue en una pelea de equipo, donde cayeron varios a la vez."
    );
  });

  it("speaks English when the app does", async () => {
    i18n.addResourceBundle("en", "translation", enBundle, true, true);
    await i18n.changeLanguage("en");
    try {
      const out = coach(mkParticipant(), lanes((id) => usual[id], { 3: 3600 }));
      expect(out.find((i) => i.title === "The game slipped away in jungle")!.detail).toBe(
        "C3 ended minute 14 1,400 gold behind C7, who finished 5/5/5. Your lane did better than that."
      );
    } finally {
      await i18n.changeLanguage("es");
    }
  });
});

// Rafael 23/11: teach that not every fight has to be followed — rotate instead.
describe("coachEngine — fights taken outnumbered", () => {
  beforeEach(() => setCoachEloBucket("DIAMOND"));
  // mkMatch: me = 1, allies 2-5, enemies 6-10.
  const ck = (t: number, killerId: number, victimId: number, assisting: number[] = []) => ({
    type: "CHAMPION_KILL",
    timestamp: t * 60_000,
    killerId,
    victimId,
    assistingParticipantIds: assisting,
  });
  const fightTitle = (out: ReturnType<typeof analyzeMatch>) => out.find((i) => /con menos gente|outnumbered/.test(i.title));

  it("flags dying in a fight my side took with two or more fewer players", () => {
    // Minute 24: me and ally 2 against enemies 6-9.
    const out = run(mkParticipant(), { events: [ck(24, 6, 1, [7, 8]), ck(24.1, 9, 2, [6])] });
    expect(fightTitle(out)).toMatchObject({
      category: "macro",
      severity: "warn",
      title: "Moriste en 1 pelea con menos gente",
      detail: "Por ejemplo, en el minuto 24 erais 2 contra 4.",
    });
    expect(fightTitle(out)!.action).toMatch(/No hace falta seguir cada pelea/);
  });

  it("leaves pick-offs and even fights alone", () => {
    // Caught alone by two: that is a solo death, not a fight the team took.
    expect(fightTitle(run(mkParticipant(), { events: [ck(10, 6, 1, [7])] }))).toBeUndefined();
    // 3 v 3.
    expect(fightTitle(run(mkParticipant(), { events: [ck(20, 6, 1, [7]), ck(20.1, 2, 8, [3])] }))).toBeUndefined();
  });

  it("speaks English when the app does", async () => {
    i18n.addResourceBundle("en", "translation", enBundle, true, true);
    await i18n.changeLanguage("en");
    try {
      const out = run(mkParticipant(), { events: [ck(24, 6, 1, [7, 8]), ck(24.1, 9, 2, [6]), ck(30, 6, 1, [7, 8, 9]), ck(30.1, 10, 3)] });
      expect(fightTitle(out)).toMatchObject({
        title: "You died in 2 fights taken outnumbered",
        // The worst one is the example: minute 30, 2 against 5.
        detail: "For example, at minute 30 it was 2 against 5.",
      });
    } finally {
      await i18n.changeLanguage("es");
    }
  });
});
