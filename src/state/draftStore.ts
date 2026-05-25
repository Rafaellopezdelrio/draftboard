import { create } from "zustand";
import type { Role } from "../types/champion";

export type Side = "ally" | "enemy";

export interface DraftSlot {
  side: Side;
  index: number;
  championKey: string | null;
  role: Role | null;
}

export interface DraftState {
  ally: DraftSlot[];
  enemy: DraftSlot[];
  bans: { ally: string[]; enemy: string[] };
  myRole: Role | null;
  enemySummonerIds: number[];
  myCellId: number | null;
  myChampionIntent: string | null;
  myChampionLocked: string | null;
  phase: string | null;
  timerSec: number | null;
  setPick: (side: Side, index: number, championKey: string | null) => void;
  setRoleForSlot: (side: Side, index: number, role: Role | null) => void;
  setMyRole: (role: Role | null) => void;
  setBan: (side: Side, index: number, championKey: string | null) => void;
  setEnemySummonerIds: (ids: number[]) => void;
  setLocalSelection: (
    cellId: number | null,
    intent: string | null,
    locked: string | null
  ) => void;
  setPhase: (phase: string | null, timerSec: number | null) => void;
  reset: () => void;
}

const emptySlots = (side: Side): DraftSlot[] =>
  Array.from({ length: 5 }, (_, i) => ({
    side,
    index: i,
    championKey: null,
    role: null,
  }));

export const useDraftStore = create<DraftState>((set, get) => ({
  ally: emptySlots("ally"),
  enemy: emptySlots("enemy"),
  bans: { ally: [], enemy: [] },
  myRole: null,
  enemySummonerIds: [],
  myCellId: null,
  myChampionIntent: null,
  myChampionLocked: null,
  phase: null,
  timerSec: null,
  // Idempotency guards on every setter. LCU sync fires applySession()
  // on every WebSocket frame (~5-20Hz during champ select) and calls
  // setPick/setBan for 10 slots each time. Without guards, every frame
  // creates a new array + notifies every subscriber → re-render storm
  // across DraftBoard, SuggestionPanel, BanSuggestionsPanel, etc, even
  // when nothing actually changed.
  setEnemySummonerIds: (ids) => {
    const cur = get().enemySummonerIds;
    if (cur.length === ids.length && cur.every((v, i) => v === ids[i])) return;
    set({ enemySummonerIds: ids });
  },
  setLocalSelection: (cellId, intent, locked) => {
    const s = get();
    if (
      s.myCellId === cellId &&
      s.myChampionIntent === intent &&
      s.myChampionLocked === locked
    )
      return;
    set({ myCellId: cellId, myChampionIntent: intent, myChampionLocked: locked });
  },
  setPhase: (phase, timerSec) => {
    const s = get();
    if (s.phase === phase && s.timerSec === timerSec) return;
    set({ phase, timerSec });
  },
  setPick: (side, index, championKey) => {
    const slot = get()[side][index];
    if (slot?.championKey === championKey) return;
    set((s) => {
      const slots = [...s[side]];
      slots[index] = { ...slots[index], championKey };
      return { [side]: slots } as Partial<DraftState>;
    });
  },
  setRoleForSlot: (side, index, role) => {
    const slot = get()[side][index];
    if (slot?.role === role) return;
    set((s) => {
      const slots = [...s[side]];
      slots[index] = { ...slots[index], role };
      return { [side]: slots } as Partial<DraftState>;
    });
  },
  setMyRole: (role) => {
    if (get().myRole === role) return;
    set({ myRole: role });
  },
  setBan: (side, index, championKey) => {
    // Compare INDEX EXISTENCE explicitly so the very first setBan
    // (where bans[side] is an empty array, slot undefined) still writes
    // even when championKey is null (which coerces to ""). Otherwise the
    // initial empty-array shape would never get filled in.
    const arr = get().bans[side];
    const incoming = championKey ?? "";
    const hasIndex = index < arr.length;
    if (hasIndex && arr[index] === incoming) return;
    set((s) => {
      const next = [...s.bans[side]];
      next[index] = incoming;
      return { bans: { ...s.bans, [side]: next } };
    });
  },
  reset: () =>
    set({
      ally: emptySlots("ally"),
      enemy: emptySlots("enemy"),
      bans: { ally: [], enemy: [] },
    }),
}));
