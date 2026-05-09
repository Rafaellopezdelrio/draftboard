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
  setPick: (side: Side, index: number, championKey: string | null) => void;
  setRoleForSlot: (side: Side, index: number, role: Role | null) => void;
  setMyRole: (role: Role | null) => void;
  setBan: (side: Side, index: number, championKey: string | null) => void;
  setEnemySummonerIds: (ids: number[]) => void;
  reset: () => void;
}

const emptySlots = (side: Side): DraftSlot[] =>
  Array.from({ length: 5 }, (_, i) => ({
    side,
    index: i,
    championKey: null,
    role: null,
  }));

export const useDraftStore = create<DraftState>((set) => ({
  ally: emptySlots("ally"),
  enemy: emptySlots("enemy"),
  bans: { ally: [], enemy: [] },
  myRole: null,
  enemySummonerIds: [],
  setEnemySummonerIds: (ids) => set({ enemySummonerIds: ids }),
  setPick: (side, index, championKey) =>
    set((s) => {
      const slots = [...s[side]];
      slots[index] = { ...slots[index], championKey };
      return { [side]: slots } as Partial<DraftState>;
    }),
  setRoleForSlot: (side, index, role) =>
    set((s) => {
      const slots = [...s[side]];
      slots[index] = { ...slots[index], role };
      return { [side]: slots } as Partial<DraftState>;
    }),
  setMyRole: (role) => set({ myRole: role }),
  setBan: (side, index, championKey) =>
    set((s) => {
      const arr = [...s.bans[side]];
      arr[index] = championKey ?? "";
      return { bans: { ...s.bans, [side]: arr } };
    }),
  reset: () =>
    set({
      ally: emptySlots("ally"),
      enemy: emptySlots("enemy"),
      bans: { ally: [], enemy: [] },
    }),
}));
