// Shows the user which of their mains were affected by the latest patch.

import { memo, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ChampionDb } from "../types/champion";
import type { ChampionMasteryDto } from "../services/riotApi";
import { getLatestPatchSummary, type PatchChange } from "../services/patchNotes";
import { Panel, PanelHeader } from "./ui/Panel";
import { displayPatch } from "../data/patchDisplay";
import { TrendingUp, TrendingDown, RefreshCw, ArrowRightLeft, FileText } from "lucide-react";

interface Props {
  db: ChampionDb;
  masteries: ChampionMasteryDto[];
}

interface Affected {
  championId: number;
  championName: string;
  iconUrl: string;
  type: PatchChange["type"];
  details: string[];
  isMain: boolean;
}

function PatchImpactPanelInner({ db, masteries }: Props) {
  const [affected, setAffected] = useState<Affected[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    (async () => {
      const summary = await getLatestPatchSummary(db.patch);
      if (!summary || summary.changes.length === 0) {
        setAffected([]);
        setLoading(false);
        return;
      }

      const myChampIds = new Set(masteries.slice(0, 15).map((m) => m.championId));

      const results: Affected[] = [];
      for (const change of summary.changes) {
        // Match change.championId (e.g. "LeeSin") to our champion DB
        const champ = Object.values(db.champions).find(
          (c) =>
            c.id.toLowerCase() === change.championId.toLowerCase() ||
            c.name.toLowerCase() === change.championId.toLowerCase() ||
            c.id.toLowerCase().replace(/[^a-z]/g, "") ===
              change.championId.toLowerCase().replace(/[^a-z]/g, "")
        );
        if (!champ) continue;
        const numericId = Number(champ.key);
        if (!myChampIds.has(numericId)) continue;
        results.push({
          championId: numericId,
          championName: champ.name,
          iconUrl: champ.iconUrl,
          type: change.type,
          details: change.details.slice(0, 3),
          isMain: masteries[0]?.championId === numericId,
        });
      }
      setAffected(results);
      setLoading(false);
    })();
  }, [db, masteries]);

  if (loading) return null;
  if (affected.length === 0) return null;

  return (
    <Panel padding="sm">
      <PanelHeader
        icon={<FileText className="w-3 h-3" />}
        title="Patch impact"
        subtitle={displayPatch(db.patch)}
      />
      <div className="space-y-1.5">
        {affected.map((a) => (
          <ImpactCard key={a.championId} affected={a} />
        ))}
      </div>
    </Panel>
  );
}

function ImpactCard({ affected: a }: { affected: Affected }) {
  const { t } = useTranslation();
  const colors = {
    buff: { ring: "ring-good/40", bg: "bg-good/5", text: "text-good", Icon: TrendingUp },
    nerf: { ring: "ring-bad/40", bg: "bg-bad/5", text: "text-bad", Icon: TrendingDown },
    rework: {
      ring: "ring-purple-400/40",
      bg: "bg-purple-400/5",
      text: "text-purple-300",
      Icon: RefreshCw,
    },
    adjust: {
      ring: "ring-meh/40",
      bg: "bg-meh/5",
      text: "text-meh",
      Icon: ArrowRightLeft,
    },
  };
  const c = colors[a.type];
  return (
    <div className={`p-2 rounded ring-1 ${c.ring} ${c.bg}`}>
      <div className="flex items-center gap-2">
        <img
          src={a.iconUrl}
          alt={a.championName}
          className="w-8 h-8 rounded ring-1 ring-border-subtle"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-xs text-white font-medium truncate">
              {a.championName}
            </p>
            {a.isMain && (
              <span className="text-[9px] uppercase tracking-widest text-accent">
                {t("common.yourMain")}
              </span>
            )}
          </div>
          <p className={`text-[10px] uppercase tracking-widest font-bold ${c.text}`}>
            <c.Icon className="w-2.5 h-2.5 inline -mt-0.5 mr-0.5" />
            {a.type}
          </p>
        </div>
      </div>
      {a.details.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 ml-10">
          {a.details.slice(0, 2).map((d, i) => (
            <li key={i} className="text-[11px] text-white/65 leading-snug">
              • {d}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Memoised — masteries and db come from App's state. Only re-render
 * when those change, not on every prefs/draft tick. */
export const PatchImpactPanel = memo(PatchImpactPanelInner);
