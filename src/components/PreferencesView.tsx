import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, X } from "lucide-react";
import { usePrefsStore, type Preferences } from "../state/prefsStore";
import { useEscape } from "../hooks/useKeyboardShortcuts";
import { useFocusTrap } from "../hooks/useFocusTrap";

const PREFS_TITLE_ID = "preferences-view-title";
import {
  disableAutostart,
  enableAutostart,
  isAutostartEnabled,
} from "../services/autostart";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import {
  PROVIDER_LABELS,
  PROVIDER_SIGNUP_URLS,
  type AiProvider,
} from "../services/aiProvider";

interface Props {
  onClose: () => void;
}

interface Section {
  title: string;
  items: Array<{
    key: keyof Preferences;
    label: string;
    detail?: string;
    danger?: boolean;
  }>;
}

const SECTIONS: Section[] = [
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

// Presets — one click applies a coherent set of toggles. Beats hunting
// 30+ individual toggles when the user just wants "leave me alone" or
// "all assistance on". The pref keys listed inside each preset are
// FORCED to the given value; other prefs are untouched (so the preset
// doesn't wipe e.g. the user's API key).
type BoolPrefKey = {
  [K in keyof Preferences]: Preferences[K] extends boolean ? K : never;
}[keyof Preferences];

interface Preset {
  id: string;
  label: string;
  description: string;
  values: Partial<Record<BoolPrefKey, boolean>>;
}

const PRESETS: Preset[] = [
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
function matchesQuery(item: { label: string; detail?: string }, q: string): boolean {
  if (!q.trim()) return true;
  const needle = q.trim().toLowerCase();
  return (
    item.label.toLowerCase().includes(needle) ||
    (item.detail?.toLowerCase().includes(needle) ?? false)
  );
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
      items: sec.items.filter((it) => matchesQuery(it, query)),
    })).filter((sec) => sec.items.length > 0);
  }, [query]);

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
          <h2 id={PREFS_TITLE_ID} className="text-lg font-semibold text-accent">{t("preferences.title")}</h2>
          <button
            onClick={() => setConfirmReset(true)}
            className="text-xs text-white/50 hover:text-bad"
          >
            Restablecer todo
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar preferencia... (ej: runas, ai, voz)"
            className="w-full bg-bg-elev/60 pl-8 pr-8 py-1.5 text-sm rounded-md ring-1 ring-border-subtle focus:ring-accent text-white outline-none transition"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
              aria-label="Limpiar búsqueda"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Presets row — hidden during search to keep results focused */}
        {!query && (
          <div className="mb-4 pb-3 border-b border-border-subtle/40">
            <p className="text-[10px] uppercase tracking-widest text-white/40 mb-1.5">
              Presets · 1 click
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p)}
                  className="text-left p-2 rounded bg-bg-card/50 ring-1 ring-border-subtle hover:bg-bg-hover hover:ring-accent/40 transition"
                  title={p.description}
                >
                  <p className="text-[11px] font-semibold text-white">{p.label}</p>
                  <p className="text-[9px] text-white/45 mt-0.5 leading-snug">
                    {p.description}
                  </p>
                </button>
              ))}
            </div>
            <button
              onClick={disableAllLcuAuto}
              className="mt-2 w-full text-[10px] uppercase tracking-widest text-bad/80 hover:text-bad py-1.5 rounded ring-1 ring-bad/30 hover:bg-bad/5 transition"
              title="Apaga auto-aplicar runas, hechizos, item sets y on-hover. No toca nada de la UI ni de los datos."
            >
              ⛔ Desactivar TODAS las auto-acciones LCU
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
                {sec.title}
              </h3>
              <div className="space-y-1">
                {sec.items.map((item) => (
                  <Toggle
                    key={item.key}
                    label={item.label}
                    detail={item.detail}
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
              Sin resultados para "{query}".
            </p>
          )}
        </div>

        <div className="flex justify-end mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-accent text-black font-medium rounded"
          >
            Hecho
          </button>
        </div>
      </div>
      {confirmReset && (
        <ConfirmDialog
          title="¿Restablecer todas las preferencias?"
          message="Esto borrará tus toggles, claves de API, prefs de meta y tema. Tu historial de partidas y datos personales NO se tocan. La acción no se puede deshacer."
          confirmLabel="Restablecer"
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

function RiotProxyField() {
  const proxyUrl = usePrefsStore((s) => s.prefs.riotProxyUrl);
  const set = usePrefsStore((s) => s.set);
  const active = proxyUrl.trim().length > 0;
  return (
    <section>
      <h3 className="text-xs uppercase tracking-wide text-white/50 mb-2 flex items-center gap-2">
        <span>Riot API — modo premium (proxy)</span>
        {active && (
          <span className="text-[9px] uppercase tracking-widest text-good bg-good/15 px-1.5 py-0.5 rounded">
            ✓ activo
          </span>
        )}
      </h3>
      <div className="space-y-2">
        <input
          type="text"
          value={proxyUrl}
          onChange={(e) => set("riotProxyUrl", e.target.value.trim())}
          placeholder="https://draftboard-riot-proxy.tu-cuenta.workers.dev"
          className="w-full bg-bg text-white text-sm px-3 py-2 rounded border border-border-subtle focus:border-accent outline-none font-mono"
        />
        <p className="text-xs text-white/60 leading-relaxed">
          {active ? (
            <>
              <span className="text-good">✓</span> Usando proxy. No necesitas tu propia
              API key Riot. Más rápido (caché en edge) y la key nunca caduca.
            </>
          ) : (
            <>
              Pega aquí la URL de tu Cloudflare Worker para evitar tener que
              renovar la dev key cada 24h. Ver{" "}
              <code className="text-accent">cloudflare-worker/README.md</code> en el
              repo para deployar (gratis, ~5 min).
            </>
          )}
        </p>
      </div>
    </section>
  );
}

/**
 * Theme accent picker. Lets the user pick the brand color variant.
 * Default mint, with sapphire/amber/rose alternatives. Change is
 * instant — CSS overrides --color-accent via data-attribute applied
 * in App.tsx, no reload required.
 */
function ThemeAccentField() {
  const theme = usePrefsStore((s) => s.prefs.accentTheme);
  const set = usePrefsStore((s) => s.set);
  type Theme = "mint" | "sapphire" | "amber" | "rose";
  const themes: Array<{ key: Theme; label: string; hex: string; emoji: string }> = [
    { key: "mint", label: "Mint", hex: "#4ecdc4", emoji: "🌿" },
    { key: "sapphire", label: "Sapphire", hex: "#4dabf7", emoji: "💎" },
    { key: "amber", label: "Amber", hex: "#fbbf24", emoji: "🏆" },
    { key: "rose", label: "Rose", hex: "#ff6b8a", emoji: "🌸" },
  ];
  return (
    <section>
      <h3 className="text-xs uppercase tracking-wide text-white/50 mb-2">
        Color de marca
      </h3>
      <div className="grid grid-cols-4 gap-2">
        {themes.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => set("accentTheme", t.key)}
            className={`flex flex-col items-center gap-1.5 p-2 rounded border transition ${
              theme === t.key
                ? "border-accent ring-2 ring-accent/40 bg-accent/5"
                : "border-border-subtle bg-bg-card/40 hover:border-accent/40"
            }`}
            title={`Aplica color ${t.label} a botones, badges y resaltados.`}
          >
            <div
              className="w-8 h-8 rounded-full ring-2 ring-white/10"
              style={{ backgroundColor: t.hex }}
            />
            <span className="text-[10px] uppercase tracking-wider text-white/70 font-semibold">
              {t.emoji} {t.label}
            </span>
          </button>
        ))}
      </div>
      <p className="text-[11px] text-white/40 mt-2">
        El cambio es inmediato. Mint es el predeterminado.
      </p>
    </section>
  );
}

function MetaSourceField() {
  const source = usePrefsStore((s) => s.prefs.metaSource);
  const days = usePrefsStore((s) => s.prefs.proPlayDaysWindow);
  const set = usePrefsStore((s) => s.set);
  // Local string state for the days input. Required because clamping
  // Number(e.target.value) on every keystroke broke typing intermediate
  // values — e.g. typing "30" first hit "3" → clamp to min=7 → input
  // shows "7" → user can never finish typing 30. We hold local string
  // while typing, then validate + persist on blur or Enter.
  const [daysInput, setDaysInput] = useState(String(days));
  // Keep local in sync if pref changes from outside (e.g. another window).
  useEffect(() => {
    setDaysInput(String(days));
  }, [days]);
  const commitDays = () => {
    const n = parseInt(daysInput, 10);
    if (!Number.isFinite(n)) {
      setDaysInput(String(days)); // revert to last valid value
      return;
    }
    const clamped = Math.max(7, Math.min(90, n));
    setDaysInput(String(clamped));
    if (clamped !== days) set("proPlayDaysWindow", clamped);
  };
  return (
    <section>
      <h3 className="text-xs uppercase tracking-wide text-white/50 mb-2">
        Fuente del meta tier
      </h3>
      <div className="space-y-2">
        <select
          value={source}
          onChange={(e) =>
            set("metaSource", e.target.value as "opgg" | "proplay" | "soloq" | "blend" | "dpm")
          }
          className="w-full bg-bg text-white text-sm px-3 py-2 rounded border border-border-subtle"
        >
          <option value="dpm">🎯 dpm.lol (filtrado por tu rango — Iron → Challenger · default)</option>
          <option value="proplay">🏆 Pro play (LCK/LEC/LCS/LPL) — requiere sync</option>
          <option value="soloq">SoloQ Master+ — requiere sync + API key Riot</option>
          <option value="blend">Mezcla pro + SoloQ — requiere sync</option>
          {/* op.gg deprecated as primary source — only show when user
            * is currently on it so they can stay or migrate to dpm.
            * Hidden by default to nudge new installs to the better source. */}
          {source === "opgg" && (
            <option value="opgg">⚡ op.gg legacy (cambia a dpm.lol)</option>
          )}
        </select>
        <p className="text-xs text-white/60">
          {source === "opgg" &&
            "Datos live de op.gg via nuestro proxy. 170+ champs, sin configurar nada. Lo más completo."}
          {source === "dpm" &&
            "Datos live de dpm.lol filtrados por rango y región. Elige tu bracket exacto desde el botón de Tier List."}
          {source === "proplay" &&
            "Usa picks/winrates de las ligas pro. Refleja el meta competitivo. Sincroniza desde ⚙."}
          {source === "soloq" &&
            "Master+ SoloQ. Datos masivos pero meta de SoloQ (no pro)."}
          {source === "blend" &&
            "Mezcla pro (alto signal) + SoloQ (alto volumen). Pondera según games."}
        </p>
        {source !== "soloq" && (
          <div className="flex items-center gap-2 pt-1">
            <label
              htmlFor="proPlayDaysInput"
              className="text-xs text-white/50"
            >
              Ventana pro (días)
            </label>
            <input
              id="proPlayDaysInput"
              type="number"
              min={7}
              max={90}
              value={daysInput}
              onChange={(e) => setDaysInput(e.target.value)}
              onBlur={commitDays}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  (e.currentTarget as HTMLInputElement).blur();
                }
              }}
              className="w-20 bg-bg text-white text-xs px-2 py-1 rounded border border-border-subtle focus:border-accent outline-none"
              title="7-90 días. Pulsa Enter o cambia foco para guardar."
            />
            <span className="text-[10px] text-white/40">
              {daysInput !== String(days) ? "sin guardar" : "guardado"}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

function AnthropicKeyField() {
  const provider = usePrefsStore((s) => s.prefs.aiProvider);
  const groqKey = usePrefsStore((s) => s.prefs.groqApiKey);
  const geminiKey = usePrefsStore((s) => s.prefs.geminiApiKey);
  const anthropicKey = usePrefsStore((s) => s.prefs.anthropicApiKey);
  const lang = usePrefsStore((s) => s.prefs.aiCoachLanguage);
  const proxyUrl = usePrefsStore((s) => s.prefs.riotProxyUrl);
  const set = usePrefsStore((s) => s.set);
  // When proxy active AND provider is Groq, the user does NOT need their own key
  // — the proxy injects the shared production key.
  const proxyHandlesIt = provider === "groq" && proxyUrl.trim().length > 0;

  const currentKey =
    provider === "groq" ? groqKey : provider === "gemini" ? geminiKey : anthropicKey;
  const setKey = (v: string) => {
    if (provider === "groq") set("groqApiKey", v);
    else if (provider === "gemini") set("geminiApiKey", v);
    else set("anthropicApiKey", v);
  };
  const placeholder =
    provider === "groq"
      ? "gsk_..."
      : provider === "gemini"
        ? "AIza..."
        : "sk-ant-...";

  return (
    <section>
      <h3 className="text-xs uppercase tracking-wide text-white/50 mb-2">
        AI provider
      </h3>
      <div className="space-y-2">
        <select
          value={provider}
          onChange={(e) => set("aiProvider", e.target.value as AiProvider)}
          className="w-full bg-bg text-white text-sm px-3 py-2 rounded border border-border-subtle"
        >
          {(Object.keys(PROVIDER_LABELS) as AiProvider[]).map((p) => (
            <option key={p} value={p}>
              {PROVIDER_LABELS[p]}
            </option>
          ))}
        </select>

        {proxyHandlesIt ? (
          <p className="text-xs text-good bg-good/10 border border-good/30 rounded p-2">
            ✓ AI Coach activo automáticamente vía proxy. No necesitas configurar
            nada. (Power users: pega tu propia key abajo para usar tu propia cuota.)
          </p>
        ) : (
          <>
            {provider === "groq" && (
              <p className="text-xs text-good">
                ✓ 100% gratis. Sin tarjeta. Crea cuenta y copia la key (30s).
              </p>
            )}
            {provider === "gemini" && (
              <p className="text-xs text-good">
                ✓ Cuota gratuita generosa. Necesita cuenta Google.
              </p>
            )}
            {provider === "anthropic" && (
              <p className="text-xs text-meh">
                ⚠️ Pago por uso (≈ 0.005-0.03$ por respuesta). Mejor calidad.
              </p>
            )}
          </>
        )}

        <input
          type="password"
          value={currentKey}
          onChange={(e) => setKey(e.target.value)}
          placeholder={proxyHandlesIt ? "opcional — proxy ya inyecta key compartida" : placeholder}
          className="w-full bg-bg px-3 py-2 rounded outline-none border border-border-subtle focus:border-accent text-white text-sm"
        />
        {!proxyHandlesIt && (
          <a
            href={PROVIDER_SIGNUP_URLS[provider]}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-accent/80 hover:text-accent block"
          >
            Obtén tu key gratis en {new URL(PROVIDER_SIGNUP_URLS[provider]).hostname} →
          </a>
        )}

        <div className="flex items-center gap-2 pt-1">
          <label className="text-xs text-white/50">Idioma del coach</label>
          <select
            value={lang}
            onChange={(e) =>
              set("aiCoachLanguage", e.target.value as "es" | "en")
            }
            className="bg-bg text-white text-xs px-2 py-1 rounded border border-border-subtle"
          >
            <option value="es">Español</option>
            <option value="en">English</option>
          </select>
        </div>
      </div>
    </section>
  );
}

function Toggle({
  label,
  detail,
  danger,
  checked,
  onChange,
}: {
  label: string;
  detail?: string;
  danger?: boolean;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  // Unique id wiring up the visible label to the checkbox for screen
  // readers and click-target expansion. Without it, hitting the visual
  // label was a click-on-label trick that worked only because the input
  // is a descendant — assistive tech and tabIndex flows didn't get the
  // association. `aria-describedby` carries the detail line.
  const labelId = `pref-${label.replace(/\W+/g, "-").toLowerCase()}`;
  const detailId = detail ? `${labelId}-detail` : undefined;
  return (
    <label
      className="flex items-start gap-3 p-2 rounded hover:bg-bg-card cursor-pointer"
      htmlFor={labelId}
    >
      <input
        id={labelId}
        type="checkbox"
        role="switch"
        aria-checked={checked}
        aria-describedby={detailId}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 accent-accent"
      />
      <div className="flex-1">
        <p className={`text-sm ${danger ? "text-meh" : "text-white"}`}>
          {label}
          {danger && (
            <span className="ml-2 text-xs text-meh" aria-label="opción avanzada">
              ⚠️ avanzado
            </span>
          )}
        </p>
        {detail && (
          <p id={detailId} className="text-xs text-white/50 mt-0.5">
            {detail}
          </p>
        )}
      </div>
    </label>
  );
}

/**
 * Stand-alone toggle for the "start with Windows" autostart registration.
 * Not a regular pref because the source of truth is the Windows registry,
 * not our SQLite prefsStore — we read it on mount and re-read after every
 * flip so the UI reflects the actual OS state even if another process
 * (e.g. uninstaller, registry cleaner) changed it.
 */
function AutostartField() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    isAutostartEnabled().then(setEnabled);
  }, []);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (enabled) await disableAutostart();
      else await enableAutostart();
      const next = await isAutostartEnabled();
      setEnabled(next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h3 className="text-xs uppercase tracking-wide text-white/50 mb-2">
        Inicio
      </h3>
      <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-white/5 transition">
        <input
          type="checkbox"
          checked={!!enabled}
          disabled={busy || enabled === null}
          onChange={toggle}
          className="w-4 h-4 accent-accent"
        />
        <div className="flex-1">
          <p className="text-sm text-white">
            Iniciar con Windows
            {busy && <span className="ml-2 text-xs text-white/40">aplicando...</span>}
          </p>
          <p className="text-xs text-white/50 mt-0.5">
            Arranca Draftboard al iniciar sesión (minimizado en bandeja del sistema).
          </p>
        </div>
      </label>
    </section>
  );
}
