import { usePrefsStore, type Preferences } from "../state/prefsStore";
import { useEscape } from "../hooks/useKeyboardShortcuts";
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
    ],
  },
  {
    title: "Interfaz",
    items: [{ key: "compactMode", label: "Modo compacto (paneles más densos)" }],
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

export function PreferencesView({ onClose }: Props) {
  useEscape(onClose);
  const { prefs, set, reset } = usePrefsStore();

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="animate-[scaleIn_180ms_ease-out] glass border border-border-strong rounded-lg p-4 w-[640px] max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-lg font-semibold text-accent">Preferencias</h2>
          <button
            onClick={() => reset()}
            className="text-xs text-white/50 hover:text-bad"
          >
            Restablecer todo
          </button>
        </div>

        <div className="space-y-5">
          <RiotProxyField />
          <MetaSourceField />
          <AnthropicKeyField />
          {SECTIONS.map((sec) => (
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

function MetaSourceField() {
  const source = usePrefsStore((s) => s.prefs.metaSource);
  const days = usePrefsStore((s) => s.prefs.proPlayDaysWindow);
  const set = usePrefsStore((s) => s.set);
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
          <option value="opgg">⚡ op.gg live (millones de partidas — default)</option>
          <option value="dpm">🎯 dpm.lol (filtrado por tu rango — Iron → Challenger)</option>
          <option value="proplay">🏆 Pro play (LCK/LEC/LCS/LPL) — requiere sync</option>
          <option value="soloq">SoloQ Master+ — requiere sync + API key Riot</option>
          <option value="blend">Mezcla pro + SoloQ — requiere sync</option>
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
            <label className="text-xs text-white/50">Ventana pro (días)</label>
            <input
              type="number"
              min={7}
              max={90}
              value={days}
              onChange={(e) =>
                set("proPlayDaysWindow", Math.max(7, Math.min(90, Number(e.target.value))))
              }
              className="w-20 bg-bg text-white text-xs px-2 py-1 rounded border border-border-subtle"
            />
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
  return (
    <label className="flex items-start gap-3 p-2 rounded hover:bg-bg-card cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 accent-accent"
      />
      <div className="flex-1">
        <p className={`text-sm ${danger ? "text-meh" : "text-white"}`}>
          {label}
          {danger && <span className="ml-2 text-xs text-meh">⚠️ avanzado</span>}
        </p>
        {detail && <p className="text-xs text-white/50 mt-0.5">{detail}</p>}
      </div>
    </label>
  );
}
