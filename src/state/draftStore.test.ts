// Core state store tests. Every panel reads from useDraftStore — a regression
// here cascades across the whole UI. These tests lock the shape, the slot
// indexing, and the ban/role mutators against accidental refactors.

import { describe, it, expect, beforeEach } from "vitest";
import { useDraftStore } from "./draftStore";

describe("draftStore", () => {
  beforeEach(() => {
    useDraftStore.getState().reset();
  });

  it("starts with 5 empty slots per side and no role", () => {
    const s = useDraftStore.getState();
    expect(s.ally).toHaveLength(5);
    expect(s.enemy).toHaveLength(5);
    expect(s.ally.every((slot) => slot.championKey === null)).toBe(true);
    expect(s.enemy.every((slot) => slot.role === null)).toBe(true);
    expect(s.myRole).toBeNull();
    expect(s.bans).toEqual({ ally: [], enemy: [] });
  });

  it("setPick writes to the right side+index without touching others", () => {
    useDraftStore.getState().setPick("ally", 2, "266");
    useDraftStore.getState().setPick("enemy", 0, "157");
    const s = useDraftStore.getState();
    expect(s.ally[2].championKey).toBe("266");
    expect(s.ally[0].championKey).toBeNull();
    expect(s.enemy[0].championKey).toBe("157");
    expect(s.enemy[2].championKey).toBeNull();
  });

  it("setPick(null) clears a slot", () => {
    useDraftStore.getState().setPick("ally", 1, "266");
    useDraftStore.getState().setPick("ally", 1, null);
    expect(useDraftStore.getState().ally[1].championKey).toBeNull();
  });

  it("setRoleForSlot updates role independently from championKey", () => {
    useDraftStore.getState().setPick("ally", 0, "266");
    useDraftStore.getState().setRoleForSlot("ally", 0, "TOP");
    const s = useDraftStore.getState();
    expect(s.ally[0]).toMatchObject({ championKey: "266", role: "TOP" });
  });

  it("setMyRole sets the local player role", () => {
    useDraftStore.getState().setMyRole("JUNGLE");
    expect(useDraftStore.getState().myRole).toBe("JUNGLE");
    useDraftStore.getState().setMyRole(null);
    expect(useDraftStore.getState().myRole).toBeNull();
  });

  it("setBan writes per side, supports sparse indices", () => {
    useDraftStore.getState().setBan("ally", 0, "1");
    useDraftStore.getState().setBan("enemy", 2, "157");
    const s = useDraftStore.getState();
    expect(s.bans.ally[0]).toBe("1");
    expect(s.bans.enemy[2]).toBe("157");
  });

  it("setBan(null) writes empty string (not undefined) for deterministic shape", () => {
    useDraftStore.getState().setBan("ally", 0, null);
    expect(useDraftStore.getState().bans.ally[0]).toBe("");
  });

  it("setLocalSelection composes cellId + intent + locked atomically", () => {
    useDraftStore.getState().setLocalSelection(3, "266", null);
    let s = useDraftStore.getState();
    expect(s.myCellId).toBe(3);
    expect(s.myChampionIntent).toBe("266");
    expect(s.myChampionLocked).toBeNull();

    useDraftStore.getState().setLocalSelection(3, null, "266");
    s = useDraftStore.getState();
    expect(s.myChampionLocked).toBe("266");
    expect(s.myChampionIntent).toBeNull();
  });

  it("setPhase updates phase + timerSec together", () => {
    useDraftStore.getState().setPhase("BAN_PICK", 27);
    const s = useDraftStore.getState();
    expect(s.phase).toBe("BAN_PICK");
    expect(s.timerSec).toBe(27);
  });

  it("setEnemySummonerIds replaces the array (not append)", () => {
    useDraftStore.getState().setEnemySummonerIds([1, 2, 3, 4, 5]);
    useDraftStore.getState().setEnemySummonerIds([9]);
    expect(useDraftStore.getState().enemySummonerIds).toEqual([9]);
  });

  it("reset clears picks + bans but PRESERVES myRole/phase (LCU-derived)", () => {
    useDraftStore.getState().setPick("ally", 0, "266");
    useDraftStore.getState().setBan("ally", 0, "1");
    useDraftStore.getState().setMyRole("TOP");
    useDraftStore.getState().setPhase("BAN_PICK", 30);
    useDraftStore.getState().reset();
    const s = useDraftStore.getState();
    expect(s.ally[0].championKey).toBeNull();
    expect(s.bans.ally).toEqual([]);
    // myRole + phase intentionally not reset — they come from LCU and the
    // engine reads them across cycles. If this ever changes, update both
    // the test and the doc-comment on reset().
    expect(s.myRole).toBe("TOP");
    expect(s.phase).toBe("BAN_PICK");
  });

  it("setPick on a slot doesn't mutate the original array reference (immutable update)", () => {
    const before = useDraftStore.getState().ally;
    useDraftStore.getState().setPick("ally", 0, "266");
    const after = useDraftStore.getState().ally;
    expect(after).not.toBe(before); // new array
    expect(after[0]).not.toBe(before[0]); // new slot
    expect(after[1]).toBe(before[1]); // untouched slot reused
  });

  describe("idempotency (re-render storm prevention)", () => {
    // LCU fires applySession on every WebSocket frame. Without guards
    // each setter would re-create state + notify every subscriber per
    // frame. These tests pin down "same value -> same reference -> no
    // re-render" for every mutator.

    it("setPick with the same championKey returns the SAME ally array reference", () => {
      useDraftStore.getState().setPick("ally", 0, "266");
      const before = useDraftStore.getState().ally;
      useDraftStore.getState().setPick("ally", 0, "266");
      expect(useDraftStore.getState().ally).toBe(before);
    });

    it("setBan with the same value returns the SAME bans reference", () => {
      useDraftStore.getState().setBan("ally", 0, "266");
      const before = useDraftStore.getState().bans;
      useDraftStore.getState().setBan("ally", 0, "266");
      expect(useDraftStore.getState().bans).toBe(before);
    });

    it("setMyRole with the same value is a no-op (state ref unchanged)", () => {
      useDraftStore.getState().setMyRole("TOP");
      const before = useDraftStore.getState();
      useDraftStore.getState().setMyRole("TOP");
      expect(useDraftStore.getState()).toBe(before);
    });

    it("setRoleForSlot with the same value preserves array reference", () => {
      useDraftStore.getState().setRoleForSlot("enemy", 1, "JUNGLE");
      const before = useDraftStore.getState().enemy;
      useDraftStore.getState().setRoleForSlot("enemy", 1, "JUNGLE");
      expect(useDraftStore.getState().enemy).toBe(before);
    });

    it("setEnemySummonerIds with same array contents is a no-op", () => {
      useDraftStore.getState().setEnemySummonerIds([1, 2, 3]);
      const before = useDraftStore.getState().enemySummonerIds;
      useDraftStore.getState().setEnemySummonerIds([1, 2, 3]);
      expect(useDraftStore.getState().enemySummonerIds).toBe(before);
    });

    it("setEnemySummonerIds with different contents updates", () => {
      useDraftStore.getState().setEnemySummonerIds([1, 2, 3]);
      useDraftStore.getState().setEnemySummonerIds([1, 2, 4]);
      expect(useDraftStore.getState().enemySummonerIds).toEqual([1, 2, 4]);
    });

    it("setPhase with same phase + timer is a no-op", () => {
      useDraftStore.getState().setPhase("BAN_PICK", 30);
      const before = useDraftStore.getState();
      useDraftStore.getState().setPhase("BAN_PICK", 30);
      expect(useDraftStore.getState()).toBe(before);
    });

    it("setLocalSelection with identical triple is a no-op", () => {
      useDraftStore.getState().setLocalSelection(3, null, "266");
      const before = useDraftStore.getState();
      useDraftStore.getState().setLocalSelection(3, null, "266");
      expect(useDraftStore.getState()).toBe(before);
    });
  });
});
