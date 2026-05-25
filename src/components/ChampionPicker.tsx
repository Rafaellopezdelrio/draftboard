// Modal champion picker. Mouse + click is the PRIMARY interaction.
//
// Previous version layered an arrow-key listbox pattern on top with
// onMouseEnter sync and scrollIntoView per activeIndex change. That
// killed performance: moving the cursor over the 150-champ grid fired
// setActiveIndex on every hover → entire grid re-rendered + every
// activeIndex change scrolled the container, which fought the user's
// own mouse wheel (scroll snap back). Result: app froze the PC and
// mouse wheel stopped working.
//
// Current contract — what we KEEP:
//   - role="dialog" + aria-modal + aria-labelledby (screen readers)
//   - role="listbox" + role="option" (semantics for assistive tech)
//   - Focus trap (Tab/Shift+Tab stay inside the modal)
//   - Click + Enter on focused button -> onPick (browser defaults)
//   - Input search filter + role tabs
//
// What we DROPPED (broke mouse, low value):
//   - Arrow Up/Down/Left/Right grid nav
//   - onMouseEnter → setActiveIndex (caused re-render storm)
//   - scrollIntoView effect (fought user's wheel scroll)
//   - aria-activedescendant (only useful with the dropped nav)

import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Champion, Role } from "../types/champion";
import { useEscape } from "../hooks/useKeyboardShortcuts";
import { useFocusTrap } from "../hooks/useFocusTrap";

interface Props {
  champions: Champion[];
  excludeKeys?: string[];
  onPick: (champ: Champion) => void;
  onClose: () => void;
}

/** Role values are constants — labels come from i18n at render time so
 * the picker re-renders correctly when the user changes UI language. */
const ROLE_VALUES: Array<Role | "ALL"> = [
  "ALL",
  "TOP",
  "JUNGLE",
  "MIDDLE",
  "BOTTOM",
  "UTILITY",
];
const ROLE_I18N_KEY: Record<Role | "ALL", string> = {
  ALL: "championPicker.roles.all",
  TOP: "championPicker.roles.top",
  JUNGLE: "championPicker.roles.jungle",
  MIDDLE: "championPicker.roles.middle",
  BOTTOM: "championPicker.roles.bottom",
  UTILITY: "championPicker.roles.utility",
};

const TITLE_ID = "champion-picker-title";
const LISTBOX_ID = "champion-picker-listbox";

export function ChampionPicker({
  champions,
  excludeKeys = [],
  onPick,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "ALL">("ALL");

  const dialogRef = useRef<HTMLDivElement | null>(null);
  useEscape(onClose);
  useFocusTrap(dialogRef, true);

  const exclude = useMemo(() => new Set(excludeKeys), [excludeKeys]);
  const filtered = useMemo(() => {
    const needle = q.toLowerCase();
    return champions
      .filter((c) => !exclude.has(c.key))
      .filter((c) => roleFilter === "ALL" || c.roles.includes(roleFilter))
      .filter((c) => c.name.toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [q, champions, exclude, roleFilter]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={TITLE_ID}
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="animate-[scaleIn_180ms_ease-out] glass border border-border-strong rounded-lg p-4 w-[680px] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={TITLE_ID} className="sr-only">
          {t("championPicker.title")}
        </h2>
        <div className="flex gap-2 mb-3">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("championPicker.searchPlaceholder")}
            aria-label={t("championPicker.searchAriaLabel")}
            aria-controls={LISTBOX_ID}
            className="flex-1 bg-bg px-3 py-2 rounded outline-none border border-border-subtle focus:border-accent text-white"
          />
        </div>
        <div
          role="tablist"
          aria-label={t("championPicker.filterByRoleAria")}
          className="flex gap-1 mb-3"
        >
          {ROLE_VALUES.map((value) => (
            <button
              key={value}
              role="tab"
              aria-selected={roleFilter === value}
              onClick={() => setRoleFilter(value)}
              className={`px-3 py-1.5 text-xs rounded border ${
                roleFilter === value
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border-subtle text-white/70 hover:border-white/30"
              }`}
            >
              {t(ROLE_I18N_KEY[value])}
            </button>
          ))}
        </div>
        <div
          id={LISTBOX_ID}
          role="listbox"
          aria-label={t("championPicker.listAriaLabel")}
          className="grid grid-cols-8 gap-2 overflow-y-auto pr-1"
        >
          {filtered.map((c) => (
            <button
              key={c.key}
              role="option"
              aria-selected={false}
              onClick={() => onPick(c)}
              className="group flex flex-col items-center gap-1 p-1 rounded hover:bg-bg-card transition"
              title={c.name}
            >
              <img
                src={c.iconUrl}
                alt={c.name}
                loading="lazy"
                className="w-12 h-12 rounded border border-border-subtle group-hover:border-accent"
              />
              <span className="text-[10px] text-white/70 truncate w-full text-center">
                {c.name}
              </span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p
              role="status"
              aria-live="polite"
              className="col-span-8 text-center text-white/40 py-8"
            >
              {t("championPicker.noResults")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
