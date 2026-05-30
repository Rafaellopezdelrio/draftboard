import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const saveDraft = vi.fn();
vi.mock("../services/draftsRepo", () => ({
  // Return a real promise so the hook's `.catch(...)` is valid.
  saveDraft: (...args: unknown[]) => {
    saveDraft(...args);
    return Promise.resolve(0);
  },
}));

import { useDraftLogger } from "./useDraftLogger";

const base = {
  allyKeys: ["266"],
  enemyKeys: ["238"],
  bannedKeys: ["157"],
  suggestedKeys: ["61", "238", "1"], // #1 suggestion = "61"
};

describe("useDraftLogger", () => {
  beforeEach(() => saveDraft.mockReset());

  it("does NOT log while no champion is locked", () => {
    renderHook(() => useDraftLogger({ ...base, myChampionLocked: null }));
    expect(saveDraft).not.toHaveBeenCalled();
  });

  it("logs once on lock-in with followedSuggestion=false when pick ≠ top suggestion", () => {
    renderHook(() => useDraftLogger({ ...base, myChampionLocked: "238" }));
    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        pickedKey: "238",
        followedSuggestion: false,
        allyKeys: ["266"],
        enemyKeys: ["238"],
        bannedKeys: ["157"],
        suggestedKeys: ["61", "238", "1"],
      })
    );
  });

  it("sets followedSuggestion=true when the pick IS the top suggestion", () => {
    renderHook(() => useDraftLogger({ ...base, myChampionLocked: "61" }));
    expect(saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({ pickedKey: "61", followedSuggestion: true })
    );
  });

  it("dedupes — re-renders with the same lock don't log again", () => {
    const { rerender } = renderHook((p) => useDraftLogger(p), {
      initialProps: { ...base, myChampionLocked: "61" },
    });
    rerender({ ...base, myChampionLocked: "61", enemyKeys: ["238", "99"] });
    expect(saveDraft).toHaveBeenCalledTimes(1);
  });

  it("logs again for a fresh lock after leaving champ select (locked → null → new)", () => {
    const { rerender } = renderHook((p) => useDraftLogger(p), {
      initialProps: { ...base, myChampionLocked: "61" as string | null },
    });
    rerender({ ...base, myChampionLocked: null });
    rerender({ ...base, myChampionLocked: "238" });
    expect(saveDraft).toHaveBeenCalledTimes(2);
  });
});
