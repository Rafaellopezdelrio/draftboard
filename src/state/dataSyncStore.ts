// Long data downloads (pro games, ranked, best players) started from Settings.
// Their state lives here, not in the Settings dialog, so a download keeps its
// progress and its result after the dialog is closed, the footer can show it,
// and a second one cannot be started on top of it.

import { create } from "zustand";

export type DataSyncKind = "pro" | "soloq" | "top";

/** Fired on `window` when a download finished and wrote new data. */
export const DATA_UPDATED_EVENT = "draftboard:data-updated";

export interface DataSyncProgress {
  phase: string;
  done: number;
  total: number;
}

interface DataSyncState {
  /** The download in flight, or null. */
  running: DataSyncKind | null;
  /** Progress line while running, then the final message. */
  status: string;
  done: number;
  total: number;
  /** How the last download ended; null while running or once dismissed. */
  result: "ok" | "error" | null;
  dismiss: () => void;
}

export const useDataSyncStore = create<DataSyncState>((set) => ({
  running: null,
  status: "",
  done: 0,
  total: 0,
  result: null,
  dismiss: () => set({ status: "", done: 0, total: 0, result: null }),
}));

/**
 * Runs one download. `job` reports progress and resolves with the final
 * message. Returns false (and does nothing) when another one is in flight.
 */
export async function runDataSync(
  kind: DataSyncKind,
  startText: string,
  job: (onProgress: (p: DataSyncProgress) => void) => Promise<string>,
  errorText: (e: unknown) => string
): Promise<boolean> {
  const { setState, getState } = useDataSyncStore;
  if (getState().running) return false;
  setState({ running: kind, status: startText, done: 0, total: 0, result: null });
  try {
    const doneText = await job((p) =>
      setState({ status: `${p.phase}: ${p.done}/${p.total}`, done: p.done, total: p.total })
    );
    setState({ running: null, status: doneText, result: "ok" });
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(DATA_UPDATED_EVENT));
  } catch (e) {
    setState({ running: null, status: errorText(e), result: "error" });
  }
  return true;
}
