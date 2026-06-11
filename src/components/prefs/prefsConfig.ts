// Static configuration for PreferencesView: section definitions, one-click
// presets, and helper types/utilities. Lives outside the view so the
// component shell stays focused on layout + state plumbing, and so this
// table-of-toggles can be reviewed/extended without touching JSX.
//
// Each item references a `keyof Preferences` — TypeScript catches typos
// at compile time. Adding a new pref to prefsStore + this file is the
// only change needed to expose it in the modal.
//
// i18n: `title`, `label`, `detail`, and preset `label`/`description` hold
// i18n KEY strings (prefsConfig.*), not display text — same key-config
// pattern as appCommands.ts. PreferencesView resolves them through t() at
// render so the taxonomy is bilingual without duplicating this table.

import type { Preferences } from "../../state/prefsStore";

export interface Section {
  /** i18n key (prefsConfig.sections.*). */
  title: string;
  items: Array<{
    key: keyof Preferences;
    /** i18n key (prefsConfig.items.*.label). */
    label: string;
    /** i18n key (prefsConfig.items.*.detail). */
    detail?: string;
    danger?: boolean;
  }>;
}

/** Only the keys of Preferences whose value is a boolean. Used by the
 * preset definitions so we can't accidentally try to "preset" a string
 * pref like riotProxyUrl. */
export type BoolPrefKey = {
  [K in keyof Preferences]: Preferences[K] extends boolean ? K : never;
}[keyof Preferences];

export interface Preset {
  id: string;
  /** i18n key (prefsConfig.presets.*.label). */
  label: string;
  /** i18n key (prefsConfig.presets.*.description). */
  description: string;
  values: Partial<Record<BoolPrefKey, boolean>>;
}

export const SECTIONS: Section[] = [
  {
    title: "prefsConfig.sections.draftPanels",
    items: [
      { key: "showSuggestions", label: "prefsConfig.items.showSuggestions.label" },
      { key: "showDraftWinrate", label: "prefsConfig.items.showDraftWinrate.label" },
      { key: "showCompAnalysis", label: "prefsConfig.items.showCompAnalysis.label" },
      { key: "showBuildPanel", label: "prefsConfig.items.showBuildPanel.label" },
      { key: "showEnemyScout", label: "prefsConfig.items.showEnemyScout.label" },
    ],
  },
  {
    title: "prefsConfig.sections.scoring",
    items: [
      {
        key: "usePersonalStats",
        label: "prefsConfig.items.usePersonalStats.label",
        detail: "prefsConfig.items.usePersonalStats.detail",
      },
      {
        key: "useMastery",
        label: "prefsConfig.items.useMastery.label",
        detail: "prefsConfig.items.useMastery.detail",
      },
      {
        key: "useMetaTier",
        label: "prefsConfig.items.useMetaTier.label",
        detail: "prefsConfig.items.useMetaTier.detail",
      },
    ],
  },
  {
    title: "prefsConfig.sections.safetyUx",
    items: [
      {
        key: "safeMode",
        label: "prefsConfig.items.safeMode.label",
        detail: "prefsConfig.items.safeMode.detail",
      },
      {
        key: "beginnerMode",
        label: "prefsConfig.items.beginnerMode.label",
        detail: "prefsConfig.items.beginnerMode.detail",
      },
    ],
  },
  {
    title: "prefsConfig.sections.lcuAuto",
    items: [
      {
        key: "showRuneImportButton",
        label: "prefsConfig.items.showRuneImportButton.label",
      },
      {
        key: "autoApplyRunes",
        label: "prefsConfig.items.autoApplyRunes.label",
        detail: "prefsConfig.items.autoApplyRunes.detail",
        danger: true,
      },
      {
        key: "autoApplyOnHover",
        label: "prefsConfig.items.autoApplyOnHover.label",
        detail: "prefsConfig.items.autoApplyOnHover.detail",
        danger: true,
      },
      {
        key: "showSpellImportButton",
        label: "prefsConfig.items.showSpellImportButton.label",
      },
      {
        key: "autoApplySpells",
        label: "prefsConfig.items.autoApplySpells.label",
        detail: "prefsConfig.items.autoApplySpells.detail",
        danger: true,
      },
      {
        key: "autoApplyItemSet",
        label: "prefsConfig.items.autoApplyItemSet.label",
        detail: "prefsConfig.items.autoApplyItemSet.detail",
      },
      {
        key: "notifyOnEnemyHotStreak",
        label: "prefsConfig.items.notifyOnEnemyHotStreak.label",
      },
    ],
  },
  {
    title: "prefsConfig.sections.coachPostGame",
    items: [
      { key: "coachAfterMatch", label: "prefsConfig.items.coachAfterMatch.label" },
      { key: "coachShowGpi", label: "prefsConfig.items.coachShowGpi.label" },
    ],
  },
  {
    title: "prefsConfig.sections.realtime",
    items: [
      { key: "liveTimer", label: "prefsConfig.items.liveTimer.label" },
      { key: "liveScoutRefresh", label: "prefsConfig.items.liveScoutRefresh.label" },
      {
        key: "showInGameOverlay",
        label: "prefsConfig.items.showInGameOverlay.label",
        detail: "prefsConfig.items.showInGameOverlay.detail",
      },
    ],
  },
  {
    title: "prefsConfig.sections.ui",
    items: [{ key: "compactMode", label: "prefsConfig.items.compactMode.label" }],
  },
  {
    title: "prefsConfig.sections.privacy",
    items: [
      {
        key: "telemetryEnabled",
        label: "prefsConfig.items.telemetryEnabled.label",
        detail: "prefsConfig.items.telemetryEnabled.detail",
      },
    ],
  },
  {
    title: "prefsConfig.sections.voiceCoach",
    items: [
      {
        key: "voiceCoachEnabled",
        label: "prefsConfig.items.voiceCoachEnabled.label",
        detail: "prefsConfig.items.voiceCoachEnabled.detail",
      },
    ],
  },
  {
    title: "prefsConfig.sections.aiCoach",
    items: [
      {
        key: "aiCoachEnabled",
        label: "prefsConfig.items.aiCoachEnabled.label",
        detail: "prefsConfig.items.aiCoachEnabled.detail",
      },
    ],
  },
];

// One click applies a coherent set of toggles. Beats hunting 30+ individual
// switches when the user just wants "leave me alone" or "all assistance on".
// The pref keys listed inside each preset are FORCED to the given value;
// other prefs are untouched (so the preset doesn't wipe e.g. the user's
// API key).
export const PRESETS: Preset[] = [
  {
    id: "beginner",
    label: "prefsConfig.presets.beginner.label",
    description: "prefsConfig.presets.beginner.description",
    values: {
      showSuggestions: true,
      showDraftWinrate: true,
      showCompAnalysis: true,
      showBuildPanel: true,
      showEnemyScout: true,
      usePersonalStats: true,
      useMastery: true,
      useMetaTier: true,
      showRuneImportButton: true,
      showSpellImportButton: true,
      autoApplyRunes: true,
      autoApplyOnHover: false,
      autoApplySpells: false,
      autoApplyItemSet: true,
      coachAfterMatch: true,
      coachShowGpi: true,
      beginnerMode: true,
      safeMode: false,
      liveTimer: true,
      liveScoutRefresh: true,
    },
  },
  {
    id: "competitive",
    label: "prefsConfig.presets.competitive.label",
    description: "prefsConfig.presets.competitive.description",
    values: {
      showSuggestions: true,
      showDraftWinrate: false,
      showCompAnalysis: false,
      showBuildPanel: true,
      showEnemyScout: true,
      usePersonalStats: true,
      useMastery: true,
      useMetaTier: true,
      showRuneImportButton: true,
      showSpellImportButton: true,
      autoApplyRunes: true,
      autoApplyOnHover: true,
      autoApplySpells: true,
      autoApplyItemSet: true,
      coachAfterMatch: false,
      coachShowGpi: false,
      beginnerMode: false,
      safeMode: false,
      liveTimer: true,
      liveScoutRefresh: true,
    },
  },
  {
    id: "silent",
    label: "prefsConfig.presets.silent.label",
    description: "prefsConfig.presets.silent.description",
    values: {
      showSuggestions: true,
      showDraftWinrate: true,
      showCompAnalysis: true,
      showBuildPanel: true,
      showEnemyScout: true,
      showRuneImportButton: false,
      showSpellImportButton: false,
      autoApplyRunes: false,
      autoApplyOnHover: false,
      autoApplySpells: false,
      autoApplyItemSet: false,
      coachAfterMatch: false,
      voiceCoachEnabled: false,
      notifyOnEnemyHotStreak: false,
      safeMode: true,
    },
  },
];

/** Match a single toggle entry against the search query (label + detail).
 * `label`/`detail` are i18n keys, so the caller passes a translate fn and we
 * match against the RESOLVED display text — search works in both languages. */
export function matchesQuery(
  item: { label: string; detail?: string },
  q: string,
  t: (key: string) => string
): boolean {
  if (!q.trim()) return true;
  const needle = q.trim().toLowerCase();
  return (
    t(item.label).toLowerCase().includes(needle) ||
    (item.detail ? t(item.detail).toLowerCase().includes(needle) : false)
  );
}
