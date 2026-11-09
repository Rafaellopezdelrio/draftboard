import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ChampionDb } from "../types/champion";
import { useRoleDerivation } from "./useRoleDerivation";
import { isNoLaneMode } from "../state/draftStore";

const db = {
  patch: "16.21.1",
  champions: { "121": { id: "Khazix", key: "121", name: "Kha'Zix" } },
} as unknown as ChampionDb;

function run(gameMode?: string | null) {
  const setMyRole = vi.fn();
  renderHook(() =>
    useRoleDerivation({
      db,
      myChampionLocked: "121",
      myChampionIntent: null,
      myRole: null,
      setMyRole,
      gameMode,
    })
  );
  return setMyRole;
}

describe("useRoleDerivation", () => {
  it("derives the champion's main role when no position is assigned", () => {
    expect(run()).toHaveBeenCalledWith("JUNGLE");
    expect(run("CLASSIC")).toHaveBeenCalledWith("JUNGLE");
  });

  it.each(["ARAM", "CHERRY", "aram"])("leaves myRole null in %s", (mode) => {
    expect(run(mode)).not.toHaveBeenCalled();
  });

  it("clears a role kept from a previous SR game when entering ARAM", () => {
    const setMyRole = vi.fn();
    renderHook(() =>
      useRoleDerivation({
        db,
        myChampionLocked: "121",
        myChampionIntent: null,
        myRole: "TOP",
        setMyRole,
        gameMode: "ARAM",
      })
    );
    expect(setMyRole).toHaveBeenCalledWith(null);
  });

  it("isNoLaneMode flags only ARAM/Arena", () => {
    expect(isNoLaneMode("ARAM")).toBe(true);
    expect(isNoLaneMode("CHERRY")).toBe(true);
    expect(isNoLaneMode("CLASSIC")).toBe(false);
    expect(isNoLaneMode(null)).toBe(false);
  });
});
