// Native (OS-level) notification dispatcher. Used for events where the
// user is likely alt-tabbed away from Draftboard — they're in LoL's
// fullscreen client, so toast/in-app UI cues won't reach them. Native
// notifications pop over LoL itself (Windows toast / macOS banner).
//
// Permission flow:
//   1. First call requests permission (browser dialog).
//   2. If granted, subsequent calls show notifications directly.
//   3. If denied, we degrade silently — caller's other cues (TTS, toast)
//      still work, so users don't lose info.
//
// Safe to call from anywhere; the requestPermission step de-dups so we
// never prompt twice.

let permissionState: NotificationPermission | "unsupported" = "default";
let askedOnce = false;

function isSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/** Detect current permission without prompting. Cheap; safe in renders. */
export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (!isSupported()) return "unsupported";
  return Notification.permission;
}

/** Prompt the user for notification permission (idempotent — only fires once
 *  per session). Returns the resulting state. */
export async function ensureNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!isSupported()) return "unsupported";
  if (askedOnce) return permissionState;
  askedOnce = true;
  if (Notification.permission === "granted") {
    permissionState = "granted";
    return "granted";
  }
  if (Notification.permission === "denied") {
    permissionState = "denied";
    return "denied";
  }
  try {
    const res = await Notification.requestPermission();
    permissionState = res;
    return res;
  } catch {
    permissionState = "denied";
    return "denied";
  }
}

interface NotifyOpts {
  title: string;
  body?: string;
  /** Dedup tag — notifications with the same tag replace each other.
   *  Use for repeating signals (e.g. "your-turn") so they don't stack. */
  tag?: string;
  /** Auto-dismiss after this ms (Windows ignores; we still set it for
   *  browsers that honor `requireInteraction: false`). */
  durationMs?: number;
  /** Click handler. Useful for "focus draftboard" actions. */
  onClick?: () => void;
}

/**
 * Fire a native OS notification. No-op when permission isn't granted or
 * the platform doesn't support the Notifications API. Failures are
 * swallowed so a notification problem never bubbles up into the UI.
 */
export function nativeNotify(opts: NotifyOpts): void {
  if (!isSupported()) return;
  if (Notification.permission !== "granted") return;
  try {
    const n = new Notification(opts.title, {
      body: opts.body,
      tag: opts.tag,
      // icon: app icon — Tauri serves it under the asset protocol; we use
      // /icon.png at the public root so this works in dev and prod alike.
      icon: "/icon.png",
      silent: false,
    });
    if (opts.onClick) {
      n.onclick = () => {
        try {
          window.focus();
        } catch {
          /* nothing to do — focus often refused outside user gestures */
        }
        opts.onClick?.();
        n.close();
      };
    }
    if (opts.durationMs && opts.durationMs > 0) {
      setTimeout(() => n.close(), opts.durationMs);
    }
  } catch {
    /* swallow — Notification ctor can throw on some platforms */
  }
}
