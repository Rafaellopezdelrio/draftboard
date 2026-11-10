// Surface user-visible toasts for LCU lifecycle events:
//   - Client connect / disconnect transitions
//   - Champion lock-in (via window event from lcuSync)
//
// Extracted from App.tsx so the shell file stops growing with
// toast-event plumbing. Tests stay focused: each hook can mock its
// own deps without dragging in the full App state tree.

import { useEffect, useRef } from "react";
import type { LcuStatus } from "../services/lcuService";
import type { ChampionDb } from "../types/champion";
import { useToast } from "../components/ui/ToastContainer";
import { i18n } from "../i18n";

interface ChampionLockedDetail {
  championKey: string;
}

/**
 * Push a success toast when the LCU connects, a warn toast when it
 * disconnects. Tracks the previous value via a ref so the initial
 * mount doesn't fire either toast — only real transitions trigger.
 */
export function useLcuConnectToasts(lcuStatus: LcuStatus): void {
  const { push: pushToast } = useToast();
  const prevConnected = useRef<boolean | null>(null);
  useEffect(() => {
    if (prevConnected.current === null) {
      prevConnected.current = lcuStatus.connected;
      return;
    }
    if (prevConnected.current === lcuStatus.connected) return;
    prevConnected.current = lcuStatus.connected;
    if (lcuStatus.connected) {
      pushToast({
        type: "success",
        title: i18n.t("lcuToast.connectedTitle"),
        detail: i18n.t("lcuToast.connectedDetail"),
        durationMs: 3000,
      });
    } else {
      pushToast({
        type: "warn",
        title: i18n.t("lcuToast.disconnectedTitle"),
        detail: i18n.t("lcuToast.disconnectedDetail"),
        durationMs: 4000,
      });
    }
  }, [lcuStatus.connected, pushToast]);
}

/**
 * Listen for the `draft:champion-locked` window event dispatched by
 * lcuSync and surface a toast confirmation with the champion name.
 * Voice + toast both fire — toast covers users with audio muted.
 */
export function useChampionLockToast(db: ChampionDb | null): void {
  const { push: pushToast } = useToast();
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<ChampionLockedDetail>).detail;
      const champ = detail?.championKey ? db?.champions[detail.championKey] : null;
      pushToast({
        type: "success",
        title: i18n.t("voice.locked"),
        detail: champ?.name ?? "Locked in",
        durationMs: 2000,
      });
    };
    window.addEventListener("draft:champion-locked", handler);
    return () => window.removeEventListener("draft:champion-locked", handler);
  }, [db, pushToast]);
}
