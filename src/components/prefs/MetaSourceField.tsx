// Meta-tier data source picker + pro-play window-days input. The days
// field uses a local string state so per-keystroke clamping doesn't fight
// the user typing intermediate values ("3" → clamp to 7 → input shows 7
// → user can never finish typing 30). Commit on blur/Enter.

import { useEffect, useState } from "react";
import { usePrefsStore } from "../../state/prefsStore";

export function MetaSourceField() {
  const source = usePrefsStore((s) => s.prefs.metaSource);
  const days = usePrefsStore((s) => s.prefs.proPlayDaysWindow);
  const set = usePrefsStore((s) => s.set);
  const [daysInput, setDaysInput] = useState(String(days));

  // Keep local string in sync if pref changes from outside (e.g. another window).
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
