import { describe, it, expect, vi } from "vitest";
import { resolveMeta, type MetaSourceArrays } from "./championDb";
import type { MetaTier, Role } from "../types/champion";

// Minimal MetaTier fixture; only the fields resolveMeta/blend touch matter.
function tier(championKey: string, role: Role = "MIDDLE"): MetaTier {
  return { championKey, role, tier: "S", winRate: 0.52, pickRate: 0.1, banRate: 0.05 };
}

const STATIC = [tier("static-1")];
const staticFallback = () => STATIC;

function arrays(over: Partial<MetaSourceArrays> = {}): MetaSourceArrays {
  return { opgg: [], soloq: [], proplay: [], dpm: [], ...over };
}

describe("resolveMeta — meta-source fallback matrix (data-moat resilience)", () => {
  it("uses the preferred source when it has data", () => {
    expect(resolveMeta("dpm", arrays({ dpm: [tier("d")] }), staticFallback).used).toBe("dpm");
    expect(resolveMeta("opgg", arrays({ opgg: [tier("o")] }), staticFallback).used).toBe("opgg");
    expect(resolveMeta("proplay", arrays({ proplay: [tier("p")] }), staticFallback).used).toBe("proplay");
    expect(resolveMeta("soloq", arrays({ soloq: [tier("s")] }), staticFallback).used).toBe("soloq");
  });

  it("blends pro + soloq when source is blend and either has data", () => {
    const r = resolveMeta("blend", arrays({ proplay: [tier("p")], soloq: [tier("s")] }), staticFallback);
    expect(r.used).toBe("blend");
    // blend merges by champion|role, so two distinct champions => two entries
    expect(r.meta.length).toBe(2);
  });

  it("merges the same champion|role with a pick-rate-weighted winrate (pro tier wins)", () => {
    const soloq: MetaTier = { championKey: "x", role: "TOP", tier: "B", winRate: 0.5, pickRate: 0.1, banRate: 0.2 };
    // pickRate 0.02 → pro weight 0.4 + 0.1 = 0.5
    const lowPro: MetaTier = { championKey: "x", role: "TOP", tier: "S", winRate: 0.6, pickRate: 0.02, banRate: 0.01 };
    const [m] = resolveMeta("blend", arrays({ proplay: [lowPro], soloq: [soloq] }), staticFallback).meta;
    expect(m.tier).toBe("S");
    expect(m.winRate).toBeCloseTo(0.55);
    expect(m.pickRate).toBe(0.1); // max of both
    expect(m.banRate).toBe(0.2); // max of both

    // pickRate 0.2 → 0.4 + 1.0, capped at 0.75 so SoloQ keeps a 25% say
    const heavyPro = { ...lowPro, pickRate: 0.2 };
    const [h] = resolveMeta("blend", arrays({ proplay: [heavyPro], soloq: [soloq] }), staticFallback).meta;
    expect(h.winRate).toBeCloseTo(0.6 * 0.75 + 0.5 * 0.25);
  });

  it("falls back to op.gg when the preferred source returned nothing", () => {
    // user picked dpm/proplay but it was never synced / the fetch failed
    const r = resolveMeta("dpm", arrays({ opgg: [tier("o")] }), staticFallback);
    expect(r.used).toBe("opgg");
  });

  it("cascades op.gg → pro → soloq when earlier sources are empty", () => {
    expect(resolveMeta("opgg", arrays({ proplay: [tier("p")] }), staticFallback).used).toBe("proplay");
    expect(resolveMeta("opgg", arrays({ soloq: [tier("s")] }), staticFallback).used).toBe("soloq");
  });

  it("falls back to the static list only when every source is empty", () => {
    const fb = vi.fn(staticFallback);
    const r = resolveMeta("opgg", arrays(), fb);
    expect(r.used).toBe("static");
    expect(r.meta).toBe(STATIC);
    expect(fb).toHaveBeenCalledOnce();
  });

  it("never builds the static list when a real source resolves (lazy)", () => {
    const fb = vi.fn(staticFallback);
    resolveMeta("opgg", arrays({ opgg: [tier("o")] }), fb);
    expect(fb).not.toHaveBeenCalled();
  });
});
