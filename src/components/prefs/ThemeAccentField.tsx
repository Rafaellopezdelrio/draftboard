// Theme accent picker. Mint default, with sapphire/amber/rose alternatives.
// CSS overrides --color-accent via data-attribute applied in App.tsx, so
// the change is instant — no reload required.

import { usePrefsStore } from "../../state/prefsStore";

type Theme = "mint" | "sapphire" | "amber" | "rose";

const THEMES: Array<{ key: Theme; label: string; hex: string; emoji: string }> = [
  { key: "mint", label: "Mint", hex: "#4ecdc4", emoji: "🌿" },
  { key: "sapphire", label: "Sapphire", hex: "#4dabf7", emoji: "💎" },
  { key: "amber", label: "Amber", hex: "#fbbf24", emoji: "🏆" },
  { key: "rose", label: "Rose", hex: "#ff6b8a", emoji: "🌸" },
];

export function ThemeAccentField() {
  const theme = usePrefsStore((s) => s.prefs.accentTheme);
  const set = usePrefsStore((s) => s.set);
  return (
    <section>
      <h3 className="text-xs uppercase tracking-wide text-white/50 mb-2">
        Color de marca
      </h3>
      <div className="grid grid-cols-4 gap-2">
        {THEMES.map((t) => (
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
