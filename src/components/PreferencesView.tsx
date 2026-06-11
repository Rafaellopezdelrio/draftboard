// Preferences modal — the surface where the user controls every toggle,
// preset, and provider key. Heavy lifting (data tables, individual
// section fields) lives in src/components/prefs/* — this file owns
// only the dialog shell, search box, preset row, and the SECTIONS map
// loop. Keeps the file under 200 LOC instead of 850+.

import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, X } from "lucide-react";
import { usePrefsStore } from "../state/prefsStore";
import { useEscape } from "../hooks/useKeyboardShortcuts";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import {
  SECTIONS,
  PRESETS,
  matchesQuery,
  type BoolPrefKey,
  type Preset,
} from "./prefs/prefsConfig";
import { Toggle } from "./prefs/Toggle";
import { AutostartField } from "./prefs/AutostartField";
import { RiotProxyField } from "./prefs/RiotProxyField";
import { MetaSourceField } from "./prefs/MetaSourceField";
import { ThemeAccentField } from "./prefs/ThemeAccentField";
import { AnthropicKeyField } from "./prefs/AnthropicKeyField";

const PREFS_TITLE_ID = "preferences-view-title";

interface Props {
  onClose: () => void;
}

export function PreferencesView({ onClose }: Props) {
  const { t } = useTranslation();
  useEscape(onClose);
  const { prefs, set, reset } = usePrefsStore();
  const [query, setQuery] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);

  // Filter sections by query. If a section has zero matching items, we
  // hide it entirely so the user sees a focused result list.
  const visibleSections = useMemo(() => {
    if (!query.trim()) return SECTIONS;
    return SECTIONS.map((sec) => ({
      ...sec,
      items: sec.items.filter((it) => matchesQuery(it, query, t)),
    })).filter((sec) => sec.items.length > 0);
  }, [query, t]);

  // Apply a preset: write each declared key, leave the rest alone. We
  // await each set() so the SQLite-backed persistence finishes before
  // the user closes the modal.
  const applyPreset = async (preset: Preset) => {
    for (const [key, value] of Object.entries(preset.values)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await set(key as any, value as any);
    }
  };

  const disableAllLcuAuto = async () => {
    const keys: BoolPrefKey[] = [
      "autoApplyRunes",
      "autoApplyOnHover",
      "autoApplySpells",
      "autoApplyItemSet",
    ];
    for (const k of keys) await set(k, false);
  };

  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialogRef, true);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={PREFS_TITLE_ID}
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="animate-[scaleIn_180ms_ease-out] glass border border-border-strong rounded-lg p-4 w-[640px] max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between mb-3">
          <h2 id={PREFS_TITLE_ID} className="text-lg font-semibold text-accent">
            {t("preferences.title")}
          </h2>
          <button
            onClick={() => setConfirmReset(true)}
            className="text-xs text-white/50 hover:text-bad"
          >
            {t("preferences.resetAll")}
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("preferences.searchPlaceholder")}
            className="w-full bg-bg-elev/60 pl-8 pr-8 py-1.5 text-sm rounded-md ring-1 ring-border-subtle focus:ring-accent text-white outline-none transition"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
              aria-label={t("preferences.clearSearch")}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Presets row — hidden during search to keep results focused */}
        {!query && (
          <div className="mb-4 pb-3 border-b border-border-subtle/40">
            <p className="text-[10px] uppercase tracking-widest text-white/40 mb-1.5">
              {t("preferences.presetsLabel")}
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p)}
                  className="text-left p-2 rounded bg-bg-card/50 ring-1 ring-border-subtle hover:bg-bg-hover hover:ring-accent/40 transition"
                  title={t(p.description)}
                >
                  <p className="text-[11px] font-semibold text-white">{t(p.label)}</p>
                  <p className="text-[9px] text-white/45 mt-0.5 leading-snug">
                    {t(p.description)}
                  </p>
                </button>
              ))}
            </div>
            <button
              onClick={disableAllLcuAuto}
              className="mt-2 w-full text-[10px] uppercase tracking-widest text-bad/80 hover:text-bad py-1.5 rounded ring-1 ring-bad/30 hover:bg-bad/5 transition"
              title={t("preferences.disableAllTitle")}
            >
              ⛔ {t("preferences.disableAll")}
            </button>
          </div>
        )}

        <div className="space-y-5">
          {!query && (
            <>
              <AutostartField />
              <RiotProxyField />
              <MetaSourceField />
              <ThemeAccentField />
              <AnthropicKeyField />
            </>
          )}
          {visibleSections.map((sec) => (
            <section key={sec.title}>
              <h3 className="text-xs uppercase tracking-wide text-white/50 mb-2">
                {t(sec.title)}
              </h3>
              <div className="space-y-1">
                {sec.items.map((item) => (
                  <Toggle
                    key={item.key}
                    label={t(item.label)}
                    detail={item.detail ? t(item.detail) : undefined}
                    danger={item.danger}
                    checked={prefs[item.key] as boolean}
                    onChange={(v) => set(item.key, v)}
                  />
                ))}
              </div>
            </section>
          ))}
          {visibleSections.length === 0 && (
            <p className="text-sm text-white/40 italic text-center py-6">
              {t("preferences.noResults", { query })}
            </p>
          )}
        </div>

        <div className="flex justify-end mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-accent text-black font-medium rounded"
          >
            {t("preferences.done")}
          </button>
        </div>
      </div>
      {confirmReset && (
        <ConfirmDialog
          title={t("preferences.confirmResetTitle")}
          message={t("preferences.confirmResetMsg")}
          confirmLabel={t("preferences.confirmResetLabel")}
          destructive
          onConfirm={() => {
            reset();
            setConfirmReset(false);
          }}
          onCancel={() => setConfirmReset(false)}
        />
      )}
    </div>
  );
}
