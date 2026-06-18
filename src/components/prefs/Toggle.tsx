// Single labelled checkbox row used throughout PreferencesView.
// Wired up with role="switch" + aria-describedby so screen readers
// announce both the label and the detail text correctly.

import { useTranslation } from "react-i18next";

interface Props {
  label: string;
  detail?: string;
  danger?: boolean;
  checked: boolean;
  onChange: (v: boolean) => void;
}

export function Toggle({ label, detail, danger, checked, onChange }: Props) {
  const { t } = useTranslation();
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
            <span className="ml-2 text-xs text-meh" aria-label={t("prefs.toggle.advancedAria")}>
              ⚠️ {t("prefs.toggle.advanced")}
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
