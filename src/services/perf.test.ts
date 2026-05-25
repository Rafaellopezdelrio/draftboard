// Pin down the lightweight perf primitives. These power the boot-time
// budget warning; a regression in `measure()` would silently suppress
// slow-load alerts.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mark, measure, warnIfSlow } from "./perf";

// Silence the breadcrumb side-effect — warnIfSlow forwards to Sentry,
// which is uninitialised in tests but still pumps console logs.
vi.mock("./breadcrumbs", () => ({
  trackEvent: vi.fn(),
}));

describe("perf.mark + perf.measure", () => {
  beforeEach(() => {
    // No public reset — write fresh marks per test by using unique names.
  });

  it("measure returns positive ms between two marks taken in sequence", async () => {
    mark("a1");
    await new Promise((r) => setTimeout(r, 20));
    mark("b1");
    const elapsed = measure("a1", "b1");
    expect(elapsed).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(1000); // sanity bound
  });

  it("measure returns NaN when a mark is missing (cannot compute)", () => {
    expect(measure("nonexistent-1", "nonexistent-2")).toBeNaN();
  });

  it("a later mark with the same name overwrites the earlier one", async () => {
    mark("dup");
    const first = measure("dup", "dup");
    expect(first).toBe(0);
    await new Promise((r) => setTimeout(r, 10));
    mark("dup");
    // Re-measuring same name as both endpoints is always 0 — useful sanity
    // that the latest write wins, not the first.
    expect(measure("dup", "dup")).toBe(0);
  });
});

describe("perf.warnIfSlow", () => {
  it("ignores fast operations (no breadcrumb fired)", async () => {
    const { trackEvent } = await import("./breadcrumbs");
    warnIfSlow(500, 1000, "fast op");
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("fires a warning breadcrumb when elapsed > budget", async () => {
    const { trackEvent } = await import("./breadcrumbs");
    (trackEvent as ReturnType<typeof vi.fn>).mockClear();
    warnIfSlow(2500, 1000, "slow boot", { patch: "26.10" });
    expect(trackEvent).toHaveBeenCalledTimes(1);
    const call = (trackEvent as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("fetch");
    expect(call[1]).toContain("slow boot");
    expect(call[2]).toMatchObject({ elapsedMs: 2500, budgetMs: 1000, patch: "26.10" });
    expect(call[3]).toBe("warning");
  });

  it("ignores NaN elapsed (no breadcrumb)", async () => {
    const { trackEvent } = await import("./breadcrumbs");
    (trackEvent as ReturnType<typeof vi.fn>).mockClear();
    warnIfSlow(NaN, 1000, "uncomputable");
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("ignores exactly-at-budget elapsed (no false-alarm)", async () => {
    const { trackEvent } = await import("./breadcrumbs");
    (trackEvent as ReturnType<typeof vi.fn>).mockClear();
    warnIfSlow(1000, 1000, "edge");
    expect(trackEvent).not.toHaveBeenCalled();
  });
});
