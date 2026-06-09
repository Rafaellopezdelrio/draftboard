// Summoner spell combo row with optional "Apply" button.
//
// When the user has `showSpellImportButton` pref on AND the LCU is
// reachable, the button calls applySummonerSpells which patches
// /lol-champ-select/v1/session/my-selection. Fails silently if not in
// champ select.
//
// Extracted from BuildPanel.tsx for clarity. Owns its own apply state
// (applying/applied flash + toast).

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { applySummonerSpells } from "../../services/lcuService";
import { UI_FEEDBACK_MS } from "../../config";
import { SUMMONER_SPELL_META } from "../../services/opggBuilds";
import { usePrefsStore } from "../../state/prefsStore";
import { useToast } from "../ui/ToastContainer";
import { SpellIcon } from "./icons";

interface Props {
  spell1Id: number;
  spell2Id: number;
  patch: string;
  /** op.gg pick rate of this combo (0-1). */
  pickRate: number;
  /** op.gg win rate of this combo (0-1). */
  winRate: number;
  /** Human-readable reason from the coherence layer. */
  reason: string;
  /** True when our coherence layer overrode op.gg's dominant pick. */
  overrode: boolean;
}

export function SpellsRow({
  spell1Id,
  spell2Id,
  patch,
  pickRate,
  winRate,
  reason,
  overrode,
}: Props) {
  const showButton = usePrefsStore((s) => s.prefs.showSpellImportButton);
  const { push: pushToast } = useToast();
  const { t } = useTranslation();
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const meta1 = SUMMONER_SPELL_META[spell1Id];
  const meta2 = SUMMONER_SPELL_META[spell2Id];
  const wrColor =
    winRate >= 0.52 ? "text-good" : winRate >= 0.49 ? "text-white/65" : "text-bad/80";

  const handleApply = async () => {
    setApplying(true);
    const ok = await applySummonerSpells(spell1Id, spell2Id);
    setApplying(false);
    if (ok) {
      setApplied(true);
      setTimeout(() => setApplied(false), UI_FEEDBACK_MS.appliedFlash);
    }
    pushToast({
      type: ok ? "success" : "error",
      title: ok ? t("build.spellsApplied") : t("build.spellsApplyError"),
      detail: ok
        ? `${meta1?.name ?? `Spell ${spell1Id}`} + ${meta2?.name ?? `Spell ${spell2Id}`}`
        : t("build.spellsNotInChampSelect"),
      durationMs: 2500,
    });
  };

  return (
    <div className="border-t border-white/5 pt-2">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] uppercase tracking-widest text-white/45">
          {t("build.summonerSpells")}
        </p>
        <div className="flex flex-col items-end shrink-0 leading-tight">
          <span className={`text-[11px] tabular-nums font-semibold ${wrColor}`}>
            {(winRate * 100).toFixed(0)}% WR
          </span>
          <span className="text-[9px] tabular-nums text-white/30">
            {(pickRate * 100).toFixed(0)}% PR
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <SpellIcon id={spell1Id} meta={meta1} patch={patch} />
        <SpellIcon id={spell2Id} meta={meta2} patch={patch} />
        <span className="text-xs text-white/70 flex-1">
          {meta1?.name ?? `Spell ${spell1Id}`} + {meta2?.name ?? `Spell ${spell2Id}`}
        </span>
        {showButton && (
          <button
            onClick={handleApply}
            disabled={applying}
            className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded ring-1 transition ${
              applied
                ? "bg-good/20 ring-good/60 text-good"
                : "bg-accent/10 ring-accent/40 text-accent hover:bg-accent/20"
            } ${applying ? "opacity-50" : ""}`}
          >
            {applied ? `✓ ${t("build.spellApplied")}` : applying ? "..." : t("build.spellApply")}
          </button>
        )}
      </div>
      {/* When we overrode op.gg's dominant pick to keep coherence with
          the champion's archetype, surface the reasoning so the user
          knows it's intentional and not random. */}
      <p
        className={`text-[9px] mt-1 ${overrode ? "text-accent/70" : "text-white/30"}`}
      >
        {overrode ? "↳ " : ""}
        {reason}
      </p>
    </div>
  );
}
