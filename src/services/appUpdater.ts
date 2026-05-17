// Tauri auto-updater wrapper. Polls our worker's `/updater/latest.json`
// on app startup, verifies signature against the embedded pubkey, and
// surfaces an "update available" state via a React hook for the UI to
// render a banner / dialog.
//
// Failure modes are silent — auto-update should NEVER block app startup
// or surface noisy errors. Worst case the user just doesn't get
// notified and keeps using the old version (manual download still works).

import { useEffect, useState } from "react";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export interface UpdateInfo {
  available: boolean;
  version?: string;
  currentVersion?: string;
  releaseNotes?: string;
}

/**
 * One-shot check. Returns info about whether an update is available.
 * Doesn't download or install — call `installUpdate()` for that.
 */
export async function checkForUpdate(): Promise<UpdateInfo> {
  if (!isTauri()) return { available: false };
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (!update?.available) return { available: false };
    return {
      available: true,
      version: update.version,
      currentVersion: update.currentVersion,
      releaseNotes: update.body ?? undefined,
    };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[updater] check failed:", e);
    return { available: false };
  }
}

/**
 * Download and install the latest update. Re-launches the app after install.
 * Returns true on success. Caller is responsible for showing UI feedback
 * during the download (a few MB, ~10s on a fast connection).
 */
export async function installUpdate(
  onProgress?: (downloaded: number, total: number) => void
): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const { relaunch } = await import("@tauri-apps/plugin-process");
    const update = await check();
    if (!update?.available) return false;
    let downloaded = 0;
    let total = 0;
    await update.downloadAndInstall((event) => {
      switch (event.event) {
        case "Started":
          total = event.data.contentLength ?? 0;
          break;
        case "Progress":
          downloaded += event.data.chunkLength;
          onProgress?.(downloaded, total);
          break;
        case "Finished":
          onProgress?.(total, total);
          break;
      }
    });
    await relaunch();
    return true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[updater] install failed:", e);
    return false;
  }
}

/**
 * React hook: checks for an update on mount and returns the result.
 * Re-runs only when the component remounts (intentional — no constant
 * polling of the updater endpoint).
 */
export function useUpdateCheck(enabled: boolean = true): UpdateInfo {
  const [info, setInfo] = useState<UpdateInfo>({ available: false });
  useEffect(() => {
    if (!enabled) return;
    // Stagger by 3s after mount so initial app load isn't blocked by the
    // network call to our worker.
    const t = setTimeout(() => {
      checkForUpdate().then(setInfo);
    }, 3000);
    return () => clearTimeout(t);
  }, [enabled]);
  return info;
}
