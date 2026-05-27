// Static configuration for PreferencesView: section definitions, one-click
// presets, and helper types/utilities. Lives outside the view so the
// component shell stays focused on layout + state plumbing, and so this
// table-of-toggles can be reviewed/extended without touching JSX.
//
// Each item references a `keyof Preferences` — TypeScript catches typos
// at compile time. Adding a new pref to prefsStore + this file is the
// only change needed to expose it in the modal.

import type { Preferences } from "../../state/prefsStore";

export interface Section {
  title: string;
  items: Array<{
    key: keyof Preferences;
    label: string;
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
  label: string;
  description: string;
  values: Partial<Record<BoolPrefKey, boolean>>;
}

export const SECTIONS: Section[] = [
  {
    title: "Paneles del draft",
    items: [
      { key: "showSuggestions", label: "Top picks sugeridos" },
      { key: "showDraftWinrate", label: "Probabilidad de ganar el draft" },
      { key: "showCompAnalysis", label: "Análisis de composición" },
      { key: "showBuildPanel", label: "Panel de build (items, runas, skills)" },
      { key: "showEnemyScout", label: "Scout de enemigos" },
    ],
  },
  {
    title: "Cómo se calculan las sugerencias",
    items: [
      {
        key: "usePersonalStats",
        label: "Mi winrate personal por campeón",
        detail: "Usa tus partidas reales para puntuar campeones que dominas",
      },
      {
        key: "useMastery",
        label: "Mis maestrías",
        detail: "Sube los campeones con maestría 5+ en el ranking",
      },
      {
        key: "useMetaTier",
        label: "Tier list del meta global",
        detail: "Datos de partidas Master+ (sincroniza en ⚙ > Sincronizar meta)",
      },
    ],
  },
  {
    title: "Seguridad y experiencia",
    items: [
      {
        key: "safeMode",
        label: "Modo seguro (desactiva todas las acciones automáticas)",
        detail: "Solo lectura. Tú haces todos los clicks. La opción más conservadora frente al ToS de Riot.",
      },
      {
        key: "beginnerMode",
        label: "Modo principiante",
        detail: "Más explicaciones, tooltips y razones detrás de cada sugerencia.",
      },
    ],
  },
  {
    title: "Acciones automáticas (LCU)",
    items: [
      {
        key: "showRuneImportButton",
        label: "Mostrar botón 'Aplicar runas al cliente'",
      },
      {
        key: "autoApplyRunes",
        label: "Aplicar runas al confirmar campeón (lock-in)",
        detail: "Aplica automáticamente las runas recomendadas al cerrar tu pick",
        danger: true,
      },
      {
        key: "autoApplyOnHover",
        label: "Aplicar runas al hover (intent)",
        detail: "Aplica las runas en cuanto pones intent, antes del lock",
        danger: true,
      },
      {
        key: "showSpellImportButton",
        label: "Mostrar botón 'Aplicar hechizos al cliente'",
      },
      {
        key: "autoApplySpells",
        label: "Aplicar hechizos al confirmar campeón (lock-in)",
        detail: "Sobrescribe los summoner spells con los recomendados al lockear",
        danger: true,
      },
      {
        key: "autoApplyItemSet",
        label: "Generar item set al cliente (visible en tienda in-game)",
        detail: "Añade un item set 'Draftboard' a tu cuenta con starter/boots/core/situational al lockear. No borra tus otros sets.",
      },
      {
        key: "notifyOnEnemyHotStreak",
        label: "Avisar si un enemigo está en racha",
      },
    ],
  },
  {
    title: "Coach (post-game)",
    items: [
      { key: "coachAfterMatch", label: "Abrir coach automáticamente al acabar partida" },
      { key: "coachShowGpi", label: "Mostrar GPI score y radar" },
    ],
  },
  {
    title: "Tiempo real",
    items: [
      { key: "liveTimer", label: "Mostrar timer del champ select en cabecera" },
      { key: "liveScoutRefresh", label: "Refrescar scout enemigos cada 60s" },
      {
        key: "showInGameOverlay",
        label: "Overlay transparente in-game",
        detail: "Ventana pequeña always-on-top con timer, scores y objetivos. Click-through automático en zonas vacías. Aparece solo durante partidas reales.",
      },
    ],
  },
  {
    title: "Interfaz",
    items: [{ key: "compactMode", label: "Modo compacto (paneles más densos)" }],
  },
  {
    title: "Privacidad",
    items: [
      {
        key: "telemetryEnabled",
        label: "Enviar reportes de error anónimos (Sentry)",
        detail:
          "Solo crashes y trazas de error — sin nombres, sin chat, sin partidas. Ayuda a arreglar bugs rápido. Cumple GDPR.",
      },
    ],
  },
  {
    title: "Coach por voz",
    items: [
      {
        key: "voiceCoachEnabled",
        label: "Anuncios de voz en draft",
        detail: "TTS del navegador anuncia bans recomendados, picks fuertes y enemigos en racha.",
      },
    ],
  },
  {
    title: "AI Coach",
    items: [
      {
        key: "aiCoachEnabled",
        label: "Habilitar AI Coach",
        detail: "Análisis natural con LLM. Por defecto Groq (gratis). Configura la key abajo.",
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
    label: "Principiante",
    description: "Toda la ayuda visible, auto-acciones moderadas",
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
    label: "Competitivo",
    description: "Panel limpio, automatización plena, sin distracciones",
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
    label: "Silencioso",
    description: "Solo lecturas. La app NO toca tu cliente de LoL.",
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

/** Match a single toggle entry against the search query (label + detail). */
export function matchesQuery(
  item: { label: string; detail?: string },
  q: string
): boolean {
  if (!q.trim()) return true;
  const needle = q.trim().toLowerCase();
  return (
    item.label.toLowerCase().includes(needle) ||
    (item.detail?.toLowerCase().includes(needle) ?? false)
  );
}
