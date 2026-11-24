// Team mode card: five friends pick how they want to play before (or during)
// champ select; the picks that fit come first. One click, optional.

import { useTranslation } from "react-i18next";
import { TEAM_STYLES, type TeamStyle } from "../engine/teamStyle";

interface Props {
  style: TeamStyle | null;
  suggested: TeamStyle | null;
  onChange: (style: TeamStyle | null) => void;
  /** In champ select: one line of buttons, no explanations. */
  compact?: boolean;
}

export function TeamStylePicker({ style, suggested, onChange, compact = false }: Props) {
  const { t } = useTranslation();
  const name = (s: TeamStyle) => t(`teamMode.styles.${s}.name`);
  return (
    <section
      className="rounded-2xl bg-bg-elev/60 border border-accent/40 p-4 flex flex-col gap-2"
      aria-label={t("teamMode.title")}
      data-testid="team-style-picker"
    >
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <p className="text-[11px] uppercase tracking-[0.14em] text-accent font-bold">{t("teamMode.title")}</p>
        <p className="text-xs text-white/55">
          {style
            ? t("teamMode.active", { style: name(style) })
            : suggested
              ? t("teamMode.suggested", { style: name(suggested) })
              : t("teamMode.optional")}
        </p>
      </div>
      {!compact && <p className="text-sm text-white/70">{t("teamMode.intro")}</p>}
      <div className="flex flex-wrap gap-2">
        {TEAM_STYLES.map((s) => {
          const on = style === s;
          return (
            <button
              key={s}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? null : s)}
              title={t(`teamMode.styles.${s}.what`)}
              className={`rounded-xl px-3 py-1.5 text-sm font-semibold border transition ${
                on
                  ? "bg-accent text-black border-accent"
                  : "border-border-strong text-white/80 hover:text-white hover:bg-bg-hover"
              }`}
            >
              {name(s)}
              {s === suggested && !on && <span className="ml-1.5 text-[10px] text-accent">★</span>}
            </button>
          );
        })}
      </div>
      {!compact && (
        <ul className="text-xs text-white/55 space-y-0.5">
          {TEAM_STYLES.map((s) => (
            <li key={s}>
              <span className="text-white/75 font-semibold">{name(s)}:</span> {t(`teamMode.styles.${s}.what`)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
