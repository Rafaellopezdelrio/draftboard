import { usePrefsStore, type Preferences } from "../state/prefsStore";

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
    title: "AI Coach (Anthropic)",
    items: [
      {
        key: "aiCoachEnabled",
        label: "Habilitar AI Coach (requiere API key)",
        detail: "Análisis natural de cada partida con Claude. Necesitas tu propia clave Anthropic.",
      },
    ],
  },
];

export function PreferencesView({ onClose }: Props) {
  const { prefs, set, reset } = usePrefsStore();

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="animate-[scaleIn_180ms_ease-out] bg-bg-elev border border-border-subtle rounded-lg p-4 w-[640px] max-h-[85vh] overflow-y-auto"
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

function AnthropicKeyField() {
  const key = usePrefsStore((s) => s.prefs.anthropicApiKey);
  const lang = usePrefsStore((s) => s.prefs.aiCoachLanguage);
  const set = usePrefsStore((s) => s.set);
  return (
    <section>
      <h3 className="text-xs uppercase tracking-wide text-white/50 mb-2">
        Anthropic API Key (para AI Coach)
      </h3>
      <input
        type="password"
        value={key}
        onChange={(e) => set("anthropicApiKey", e.target.value)}
        placeholder="sk-ant-..."
        className="w-full bg-bg px-3 py-2 rounded outline-none border border-border-subtle focus:border-accent text-white text-sm"
      />
      <a
        href="https://console.anthropic.com/settings/keys"
        target="_blank"
        rel="noreferrer"
        className="text-xs text-accent/80 hover:text-accent"
      >
        Obtén tu key en console.anthropic.com →
      </a>
      <div className="mt-2 flex items-center gap-2">
        <label className="text-xs text-white/50">Idioma del coach</label>
        <select
          value={lang}
          onChange={(e) => set("aiCoachLanguage", e.target.value as "es" | "en")}
          className="bg-bg text-white text-xs px-2 py-1 rounded border border-border-subtle"
        >
          <option value="es">Español</option>
          <option value="en">English</option>
        </select>
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
