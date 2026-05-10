import { useEffect, useState } from "react";
import {
  loadAggregatedBuilds,
  loadAggregatedRunes,
  loadAggregatedSkillOrder,
  type BuildAgg,
  type RuneAgg,
  type SkillOrderAgg,
} from "../services/aggregateRepo";
import type { ChampionDb, Role } from "../types/champion";
import { applyRunes } from "../services/lcuService";
import { usePrefsStore } from "../state/prefsStore";
import {
  suggestBuildAdaptations,
  type BuildAdaptation,
} from "../engine/adaptiveBuildEngine";

interface Props {
  db: ChampionDb;
  championKey: string;
  role: Role;
  enemyKeys?: string[];
}

const SKILL_LABEL = ["", "Q", "W", "E"];

export function BuildPanel({ db, championKey, role, enemyKeys = [] }: Props) {
  const [builds, setBuilds] = useState<BuildAgg[]>([]);
  const [runes, setRunes] = useState<RuneAgg | null>(null);
  const [skills, setSkills] = useState<SkillOrderAgg | null>(null);
  const [importStatus, setImportStatus] = useState<string>("");
  const showRuneButton = usePrefsStore((s) => s.prefs.showRuneImportButton);

  useEffect(() => {
    const champId = Number(championKey);
    Promise.all([
      loadAggregatedBuilds(db.patch, champId, role),
      loadAggregatedRunes(db.patch, champId, role),
      loadAggregatedSkillOrder(db.patch, champId, role),
    ]).then(([b, r, s]) => {
      setBuilds(b);
      setRunes(r);
      setSkills(s);
    });
  }, [db.patch, championKey, role]);

  const champ = db.champions[championKey];

  if (!champ) return null;

  const adaptations: BuildAdaptation[] = suggestBuildAdaptations({
    db,
    champion: champ,
    enemyKeys,
  });

  const noData = builds.length === 0 && !runes && !skills;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <img src={champ.iconUrl} alt={champ.name} className="w-8 h-8 rounded" />
        <h3 className="text-sm uppercase tracking-wide text-white/50">
          Build · {champ.name}
        </h3>
      </div>

      {noData && (
        <p className="text-xs text-white/40">
          Sin datos agregados aún. Sincroniza el meta en ⚙ para verlos.
        </p>
      )}

      {builds.length > 0 && (
        <div>
          <p className="text-xs text-white/50 mb-1">Items finales</p>
          <div className="flex flex-wrap gap-1">
            {builds[0].itemIds.map((id, i) => (
              <ItemIcon key={i} patch={db.patch} id={id} />
            ))}
          </div>
          <p className="text-xs text-white/40 mt-1">
            {((builds[0].wins / builds[0].games) * 100).toFixed(0)}% WR ·{" "}
            {builds[0].games} games
          </p>
        </div>
      )}

      {skills && (
        <div>
          <p className="text-xs text-white/50 mb-1">Habilidades</p>
          <p className="text-sm text-white">
            Primeros 3:{" "}
            <span className="text-accent">
              {skills.firstThree
                .split("")
                .map((s) => SKILL_LABEL[Number(s)])
                .join(" → ")}
            </span>
          </p>
          <p className="text-sm text-white">
            Maxear:{" "}
            <span className="text-accent">
              {skills.maxOrder
                .split("")
                .map((s) => SKILL_LABEL[Number(s)])
                .join(" > ")}
            </span>
          </p>
        </div>
      )}

      {adaptations.length > 0 && (
        <div>
          <p className="text-xs text-white/50 mb-1">Adaptaciones vs comp enemiga</p>
          <div className="space-y-1">
            {adaptations.map((a, i) => (
              <div
                key={i}
                className={`flex items-center gap-2 p-1.5 rounded text-xs ${a.priority === "core" ? "bg-bad/10 border border-bad/40" : "bg-meh/10 border border-meh/40"}`}
              >
                <ItemIcon patch={db.patch} id={a.itemId} />
                <div className="flex-1 min-w-0">
                  <p className="text-white">{a.itemName}</p>
                  <p className="text-white/60">{a.reason}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {runes && (
        <div>
          <div className="flex items-baseline justify-between mb-1">
            <p className="text-xs text-white/50">Runas</p>
            {showRuneButton && (
            <button
              className="text-xs text-accent hover:underline"
              onClick={async () => {
                setImportStatus("Aplicando...");
                const ok = await applyRunes({
                  name: `${champ.name} ${role}`,
                  primaryStyleId: runes.primaryStyle,
                  subStyleId: runes.subStyle,
                  selectedPerkIds: runes.perks,
                });
                setImportStatus(ok ? "✓ Aplicadas" : "Error — abre el cliente");
              }}
            >
              Aplicar al cliente →
            </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1 mb-1">
            {runes.perks.slice(0, 4).map((id, i) => (
              <PerkIcon key={i} id={id} />
            ))}
            <div className="w-2" />
            {runes.perks.slice(4).map((id, i) => (
              <PerkIcon key={`s${i}`} id={id} small />
            ))}
          </div>
          {importStatus && (
            <p className="text-xs text-white/60">{importStatus}</p>
          )}
        </div>
      )}
    </div>
  );
}

function ItemIcon({ patch, id }: { patch: string; id: number }) {
  return (
    <img
      src={`https://ddragon.leagueoflegends.com/cdn/${patch}/img/item/${id}.png`}
      alt={`Item ${id}`}
      className="w-8 h-8 rounded border border-border-subtle"
      title={`Item ${id}`}
    />
  );
}

function PerkIcon({ id, small = false }: { id: number; small?: boolean }) {
  const size = small ? "w-5 h-5" : "w-8 h-8";
  return (
    <img
      src={`https://raw.communitydragon.org/latest/game/assets/perks/${id}.png`}
      alt={`Perk ${id}`}
      className={`${size} rounded`}
      onError={(e) => ((e.target as HTMLImageElement).style.opacity = "0.3")}
      title={`Perk ${id}`}
    />
  );
}
