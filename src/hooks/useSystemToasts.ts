// System-level toasts that exist outside the normal request/response
// flow: service-layer fetch failures, mid-session patch updates, and
// post-quarantine DB corruption recovery. Each was its own useEffect
// in App.tsx — collected here so the shell only mounts a single hook
// for "system events the user must see."
//
// All three are pushToast-driven, share the same lifecycle (mount once
// per dependency change), and have no other consumers — so combining
// them costs nothing.

import { useEffect } from "react";
import type { Toast } from "../components/ui/ToastContainer";
import { subscribeFetchFailure } from "../services/fetchNotify";
import { PATCH_UPDATED_EVENT } from "../state/scheduledJobs";
import {
  didRecoverFromCorruption,
  consumeCorruptionRecovery,
} from "../db/client";
import { BOOT_TIMEOUTS_MS } from "../config";

type PushToast = (toast: Omit<Toast, "id">) => number;

/** Mounts all three system-toast effects. `pushToast` should be stable
 * across renders (it is — ToastContainer's push is referentially stable). */
export function useSystemToasts(pushToast: PushToast): void {
  // ── 1. Fetch-failure bridge ──
  // Services emit via fetchNotify (throttled 30s/source) when a retry
  // chain exhausts. Without this, panels just render empty silently.
  useEffect(() => {
    return subscribeFetchFailure(({ source, error }) => {
      pushToast({
        type: "warn",
        title: `No se pudo cargar: ${source}`,
        detail:
          typeof error === "object" && error && "message" in error
            ? String((error as { message: unknown }).message).slice(0, 140)
            : "Comprueba tu conexión o reintenta en unos segundos.",
        durationMs: 6000,
      });
    });
  }, [pushToast]);

  // ── 2. Mid-session patch update ──
  // scheduledJobs fires when DDragon reports a newer version. We show
  // a sticky toast with a "Recargar" action so the user can opt into
  // refreshing tier list + builds without forced reload.
  useEffect(() => {
    function onPatchUpdate(e: Event) {
      const ce = e as CustomEvent<{ previous: string; latest: string }>;
      const latest = ce.detail?.latest ?? "?";
      pushToast({
        type: "info",
        title: `Nuevo parche ${latest} detectado`,
        detail: "Recarga la app para actualizar tier-list, builds y matchups.",
        durationMs: 0, // sticky — user opts in
        action: {
          label: "Recargar",
          onClick: () => window.location.reload(),
        },
      });
    }
    window.addEventListener(PATCH_UPDATED_EVENT, onPatchUpdate);
    return () => window.removeEventListener(PATCH_UPDATED_EVENT, onPatchUpdate);
  }, [pushToast]);

  // ── 3. DB corruption recovery ──
  // Polled once shortly after mount — by then any first getDb() call
  // (from prefs load) has set the flag if quarantine + recovery happened.
  useEffect(() => {
    const t = setTimeout(() => {
      if (didRecoverFromCorruption()) {
        pushToast({
          type: "warn",
          title: "Datos restablecidos",
          detail:
            "Tu base de datos estaba dañada y se ha guardado a un lado. La app arranca con datos en blanco para que puedas seguir usándola.",
          durationMs: 12000,
        });
        consumeCorruptionRecovery();
      }
    }, BOOT_TIMEOUTS_MS.recoveryProbeDelay);
    return () => clearTimeout(t);
  }, [pushToast]);
}
