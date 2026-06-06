// "Parche nuevo" banner — shows at the top of the app the first time
// the user opens it after a patch goes live. Compares the live DDragon
// patch against `prefs.lastSeenPatch`. When they differ:
//   - Banner appears with the new patch number + buff/nerf summary for
//     the user's top 5 mains
//   - Click → opens PatchImpactPanel detail (already exists)
//   - Dismiss → writes the new patch into lastSeenPatch so it never
//     shows for this patch again
//
// Drives onboarding for the "patch awareness" feature: even if the user
// never opens the Patch Impact panel, they see at-a-glance "Aatrox got
// buffed, Lee Sin got nerfed" the first time they launch post-patch.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, Sparkles, X } from "lucide-react";
import { usePrefsStore } from "../state/prefsStore";
import { getLatestPatchSummary, type PatchChange } from "../services/patchNotes";
import { displayPatch } from "../data/patchDisplay";
import type { ChampionDb } from "../types/champion";
import type { ChampionMasteryDto } from "../services/riotApi";

interface Props {
  db: ChampionDb;
  masteries: ChampionMasteryDto[];
  onOpenDetail?: () => void;
}

interface AffectedSummary {
  buffs: string[];
  nerfs: string[];
  reworks: string[];
}

export function PatchNewBanner({ db, masteries, onOpenDetail }: Props) {
  const { t } = useTranslation();
  const lastSeenPatch = usePrefsStore((s) => s.prefs.lastSeenPatch);
  const setPref = usePrefsStore((s) => s.set);
  const [summary, setSummary] = useState<AffectedSummary | null>(null);
  const [hasNotes, setHasNotes] = useState(false);

  // Compare on the MINOR patch (X.Y) not the build version (X.Y.Z). DDragon
  // ships incremental builds within a patch (16.10.1 → 16.10.2 → ...) that
  // don't carry new patch notes. Comparing raw would re-spam the banner
  // on every hotfix.
  const minorPatch = db.patch.split(".").slice(0, 2).join(".");
  const lastSeenMinor = lastSeenPatch.split(".").slice(0, 2).join(".");
  const isNewPatch = minorPatch !== lastSeenMinor;

  useEffect(() => {
    if (!isNewPatch) return;
    let cancelled = false;
    (async () => {
      const notes = await getLatestPatchSummary(db.patch);
      if (cancelled) return;
      if (!notes || notes.changes.length === 0) {
        setSummary({ buffs: [], nerfs: [], reworks: [] });
        setHasNotes(false);
        return;
      }
      setHasNotes(true);

      // Cross-reference with top 5 mains. Mastery-based, not personal-WR,
      // so it works even for unranked players.
      const mainIds = new Set(masteries.slice(0, 5).map((m) => m.championId));
      const buffs: string[] = [];
      const nerfs: string[] = [];
      const reworks: string[] = [];
      for (const change of notes.changes) {
        const champ = matchChampion(db, change);
        if (!champ) continue;
        if (!mainIds.has(Number(champ.key))) continue;
        if (change.type === "buff") buffs.push(champ.name);
        else if (change.type === "nerf") nerfs.push(champ.name);
        else if (change.type === "rework") reworks.push(champ.name);
      }
      setSummary({ buffs, nerfs, reworks });
    })();
    return () => {
      cancelled = true;
    };
  }, [db, masteries, isNewPatch]);

  if (!isNewPatch) return null;

  const dismiss = () => setPref("lastSeenPatch", db.patch);

  const totalForMains =
    (summary?.buffs.length ?? 0) +
    (summary?.nerfs.length ?? 0) +
    (summary?.reworks.length ?? 0);

  return (
    <div className="bg-gradient-to-r from-accent/15 to-purple-500/10 ring-1 ring-accent/30 rounded-lg px-3 py-2 flex items-center gap-3">
      <Sparkles className="w-4 h-4 text-accent shrink-0 animate-pulse" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-white">
          {t("patchBanner.newPatch")}{" "}
          <span className="text-accent">{displayPatch(db.patch)}</span>
          {lastSeenPatch && (
            <span className="text-white/40">
              {" "}
              {t("patchBanner.previous", { patch: displayPatch(lastSeenPatch) })}
            </span>
          )}
        </p>
        <p className="text-[10px] text-white/65 leading-snug mt-0.5">
          {totalForMains > 0 && summary ? (
            <>
              {summary.buffs.length > 0 && (
                <span className="text-good">
                  {t("patchBanner.buffs")} {summary.buffs.join(", ")}
                </span>
              )}
              {summary.buffs.length > 0 &&
                (summary.nerfs.length > 0 || summary.reworks.length > 0) &&
                " · "}
              {summary.nerfs.length > 0 && (
                <span className="text-bad">
                  {t("patchBanner.nerfs")} {summary.nerfs.join(", ")}
                </span>
              )}
              {summary.nerfs.length > 0 && summary.reworks.length > 0 && " · "}
              {summary.reworks.length > 0 && (
                <span className="text-purple-300">
                  {t("patchBanner.rework")} {summary.reworks.join(", ")}
                </span>
              )}
            </>
          ) : hasNotes ? (
            <span className="text-white/50">{t("patchBanner.noChange")}</span>
          ) : (
            <span className="text-white/50">{t("patchBanner.notIndexed")}</span>
          )}
        </p>
      </div>
      {onOpenDetail && hasNotes && (
        <button
          onClick={onOpenDetail}
          className="text-[10px] uppercase tracking-widest font-bold px-3 py-1.5 rounded bg-accent text-black hover:bg-accent/90 transition flex items-center gap-1"
        >
          {t("patchBanner.viewChanges")} <ChevronRight className="w-3 h-3" />
        </button>
      )}
      <button
        onClick={dismiss}
        className="p-1 rounded text-white/40 hover:text-white/70 hover:bg-white/5 transition"
        aria-label={t("patchBanner.dismiss")}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function matchChampion(
  db: ChampionDb,
  change: PatchChange
): { id: string; name: string; key: string } | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const target = norm(change.championId);
  for (const c of Object.values(db.champions)) {
    if (norm(c.id) === target || norm(c.name) === target) return c;
  }
  return null;
}
