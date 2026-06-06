// Help overlay listing every keyboard shortcut in the app. Triggered by
// Ctrl+/ or by the "Atajos" entry in the command palette. Single source
// of truth — when we add a new shortcut, update the SHORTCUTS table here.

import { Keyboard, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEscape } from "../hooks/useKeyboardShortcuts";

interface Shortcut {
  keys: string;
  label: string;
  detail?: string;
}

interface Group {
  title: string;
  items: Shortcut[];
}

interface Props {
  onClose: () => void;
}

export function ShortcutsHelp({ onClose }: Props) {
  const { t } = useTranslation();
  useEscape(onClose);

  const GROUPS: Group[] = [
    {
      title: t("shortcuts.groupNav"),
      items: [
        { keys: "Ctrl + K", label: t("shortcuts.openPalette") },
        { keys: "Ctrl + /", label: t("shortcuts.viewShortcuts") },
        { keys: "Esc", label: t("shortcuts.closeModal") },
      ],
    },
    {
      title: t("shortcuts.groupDraft"),
      items: [
        { keys: "1 – 5", label: t("shortcuts.selectRole"), detail: "TOP, JUNGLE, MID, BOT, SUP" },
        { keys: "R", label: t("shortcuts.resetDraft") },
      ],
    },
    {
      title: t("shortcuts.groupOverlay"),
      items: [
        { keys: t("shortcuts.dragTopBar"), label: t("shortcuts.moveOverlay") },
        { keys: t("shortcuts.xOnChip"), label: t("shortcuts.hideOverlay") },
        { keys: t("shortcuts.forceOverlayKeys"), label: t("shortcuts.forceOverlay") },
      ],
    },
    {
      title: t("shortcuts.groupDialogs"),
      items: [
        { keys: "Enter", label: t("shortcuts.confirmAction") },
        { keys: "Esc", label: t("shortcuts.cancel") },
      ],
    },
  ];

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-bg-card border border-border-strong rounded-lg w-full max-w-lg p-6 space-y-4 shadow-2xl max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-accent" />
            <h2 className="text-lg font-semibold text-white">
              {t("shortcuts.title")}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label={t("common.close")}
            className="text-white/40 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          {GROUPS.map((g) => (
            <section key={g.title}>
              <h3 className="text-[10px] uppercase tracking-widest text-white/40 mb-1.5">
                {g.title}
              </h3>
              <ul className="space-y-1">
                {g.items.map((s) => (
                  <li
                    key={s.keys + s.label}
                    className="flex items-baseline justify-between gap-3 text-sm"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-white/80">{s.label}</span>
                      {s.detail && (
                        <span className="text-[10px] text-white/45 ml-2">
                          {s.detail}
                        </span>
                      )}
                    </div>
                    <kbd className="font-mono text-[10px] bg-bg-elev border border-border-subtle px-2 py-0.5 rounded text-white/85 shrink-0">
                      {s.keys}
                    </kbd>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <p className="text-[10px] text-white/40 text-center pt-2 border-t border-border-subtle">
          {t("shortcuts.footer")}
        </p>
      </div>
    </div>
  );
}
