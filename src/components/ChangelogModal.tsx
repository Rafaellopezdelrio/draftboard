// "What's new" modal — surfaced once when the running app version doesn't
// match `prefs.lastChangelogVersionShown`. Suppressed on first install
// (null lastShown) so brand-new users don't see release notes for a
// version they never had. After dismiss we write the current version to
// the pref so the modal stays quiet until the NEXT update.

import { useEffect, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { usePrefsStore } from "../state/prefsStore";
import { getChangelogFor } from "../data/changelog";
import { useFocusTrap } from "../hooks/useFocusTrap";

function appVersion(): string {
  // Vite injects this at build time from package.json. Falls back to
  // dev label outside Tauri or when the define is missing.
  return typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0-dev";
}

interface Props {
  /** Manual control mode — when set the modal renders regardless of
   * version comparison. Used by the About modal's "Ver novedades" button. */
  forceVersion?: string;
  onClose?: () => void;
}

export function ChangelogModal({ forceVersion, onClose }: Props) {
  const loaded = usePrefsStore((s) => s.loaded);
  const lastShown = usePrefsStore((s) => s.prefs.lastChangelogVersionShown);
  const setPref = usePrefsStore((s) => s.set);
  const [dismissed, setDismissed] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialogRef, true);

  const targetVersion = forceVersion ?? appVersion();
  const entry = getChangelogFor(targetVersion);

  // First-launch suppression: brand-new install (lastShown null) AND no
  // explicit force → don't greet the user with release notes for a
  // version they never had. We mark the current version as seen silently
  // so the next real update is the first time they see this modal.
  useEffect(() => {
    if (!loaded || forceVersion) return;
    if (lastShown === null) {
      setPref("lastChangelogVersionShown", appVersion());
    }
  }, [loaded, lastShown, forceVersion, setPref]);

  if (!loaded) return null;
  if (!entry) return null;
  if (dismissed) return null;

  // Auto-mode: only render when current version differs from last shown
  // AND lastShown is non-null (first install path already handled).
  if (!forceVersion) {
    if (lastShown === null) return null;
    if (lastShown === targetVersion) return null;
  }

  const handleClose = () => {
    if (!forceVersion) {
      setPref("lastChangelogVersionShown", targetVersion);
    }
    setDismissed(true);
    onClose?.();
  };

  return (
    <div
      role="dialog"
      aria-labelledby="changelog-title"
      aria-modal="true"
      className="fixed inset-0 z-[80] bg-black/75 flex items-center justify-center p-4"
      onClick={handleClose}
    >
      <div
        ref={dialogRef}
        className="bg-bg-card border border-accent/30 rounded-lg w-full max-w-md p-6 space-y-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start gap-2">
          <Sparkles className="w-5 h-5 text-accent shrink-0 mt-0.5" />
          <div className="flex-1">
            <h2 id="changelog-title" className="text-lg font-semibold text-white">
              Novedades de Draftboard
            </h2>
            <p className="text-xs text-white/55 mt-0.5">
              v{entry.version} · {entry.date}
            </p>
          </div>
          <button
            onClick={handleClose}
            aria-label="Cerrar"
            className="text-white/40 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <ul className="space-y-2 text-sm text-white/85">
          {entry.highlights.map((h, i) => (
            <li key={i} className="leading-snug">
              {h}
            </li>
          ))}
        </ul>

        <button
          onClick={handleClose}
          className="w-full px-4 py-2 bg-accent text-black font-medium rounded hover:bg-accent-deep transition"
        >
          Entendido
        </button>
      </div>
    </div>
  );
}
