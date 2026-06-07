// Locks the command-palette config: unique ids (the palette keys on them),
// real labels, and that each modal command actually opens its own view. A
// copy-paste slip (two "coach" ids, or "tier" wired to setShowHistory) would
// break the palette silently — these catch it.

import { describe, it, expect, vi } from "vitest";
import { buildAppCommands, type AppCommandSetters } from "./appCommands";

vi.mock("../services/overlay", () => ({
  setOverlayVisible: vi.fn(),
  setOverlayPosition: vi.fn(),
}));

function mockSetters() {
  return {
    setShowTierList: vi.fn(),
    setShowLookup: vi.fn(),
    setShowProPlayers: vi.fn(),
    setShowCoach: vi.fn(),
    setShowLessonPlan: vi.fn(),
    setShowLiveGame: vi.fn(),
    setShowChat: vi.fn(),
    setShowTrends: vi.fn(),
    setShowHistory: vi.fn(),
    setShowPrefs: vi.fn(),
    setShowDiag: vi.fn(),
    setShowPrivacy: vi.fn(),
    setShowSettings: vi.fn(),
    setShowAbout: vi.fn(),
    setShowShortcuts: vi.fn(),
  } satisfies AppCommandSetters;
}

describe("buildAppCommands", () => {
  it("ids are unique (palette keys on them)", () => {
    const ids = buildAppCommands(mockSetters(), (k) => k).map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every command has a non-empty label and an action", () => {
    for (const c of buildAppCommands(mockSetters(), (k) => k)) {
      expect(c.label.trim().length).toBeGreaterThan(0);
      expect(typeof c.action).toBe("function");
    }
  });

  it("each modal command opens its OWN view (no mis-wired setter)", () => {
    const s = mockSetters();
    const cmds = buildAppCommands(s, (k) => k);
    cmds.find((c) => c.id === "tier")!.action();
    expect(s.setShowTierList).toHaveBeenCalledWith(true);
    expect(s.setShowHistory).not.toHaveBeenCalled();

    cmds.find((c) => c.id === "coach")!.action();
    expect(s.setShowCoach).toHaveBeenCalledWith(true);

    cmds.find((c) => c.id === "settings")!.action();
    expect(s.setShowSettings).toHaveBeenCalledWith(true);
  });
});
