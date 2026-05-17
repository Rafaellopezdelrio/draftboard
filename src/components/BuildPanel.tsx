import { memo, useEffect, useState } from "react";
import {
  loadAggregatedBuilds,
  loadAggregatedRunes,
  loadAggregatedSkillOrder,
  type BuildAgg,
  type RuneAgg,
  type SkillOrderAgg,
} from "../services/aggregateRepo";
import type { Champion, ChampionDb, Role } from "../types/champion";
import { applyRunes, applySummonerSpells } from "../services/lcuService";
import { SUMMONER_SPELL_META } from "../services/opggBuilds";
import { fetchOpggMatchups, type OpggMatchup } from "../services/opggMatchups";
import { pickCoherentSpells } from "../services/spellCoherence";
import { usePrefsStore } from "../state/prefsStore";
import {
  suggestBuildAdaptations,
  type BuildAdaptation,
} from "../engine/adaptiveBuildEngine";
import { PowerSpikesBars } from "./PowerSpikesBars";
import {
  fetchOpggBuild,
  pickBestBuild,
  pickMostPopular,
  type OpggBuild,
  type OpggBuildPath,
} from "../services/opggBuilds";

interface Props {
  db: ChampionDb;
  championKey: string;
  role: Role;
  enemyKeys?: string[];
}

const SKILL_LABEL = ["", "Q", "W", "E"];

function BuildPanelInner({ db, championKey, role, enemyKeys = [] }: Props) {
  const [builds, setBuilds] = useState<BuildAgg[]>([]);
  const [runes, setRunes] = useState<RuneAgg | null>(null);
  const [skills, setSkills] = useState<SkillOrderAgg | null>(null);
  const [opggBuild, setOpggBuild] = useState<OpggBuild | null>(null);
  const [opggLoading, setOpggLoading] = useState(false);
  const [importStatus, setImportStatus] = useState<string>("");
  const showRuneButton = usePrefsStore((s) => s.prefs.showRuneImportButton);

  const champ = db.champions[championKey];

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

  // Fetch op.gg build in parallel with synced aggregates.
  // Op.gg gives the broadest, most up-to-date recommendation; synced data
  // is a backup if op.gg fails.
  useEffect(() => {
    if (!champ) return;
    let cancelled = false;
    setOpggLoading(true);
    setOpggBuild(null);
    fetchOpggBuild(champ.id, role).then((b) => {
      if (cancelled) return;
      setOpggBuild(b);
      setOpggLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [champ, role]);

  if (!champ) return null;

  const adaptations: BuildAdaptation[] = suggestBuildAdaptations({
    db,
    champion: champ,
    enemyKeys,
  });

  // "No data" only true when BOTH op.gg AND local synced data are empty
  const noData =
    !opggBuild && !opggLoading && builds.length === 0 && !runes && !skills;

  return (
    <div
      className="relative space-y-3 p-3 rounded-lg overflow-hidden border border-border-subtle"
      style={{
        backgroundImage: `linear-gradient(180deg, rgba(11,14,20,0.7) 0%, rgba(11,14,20,0.95) 70%), url(${champ.splashUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center 20%",
      }}
    >
      <div className="flex items-center gap-2">
        <img src={champ.iconUrl} alt={champ.name} className="w-8 h-8 rounded" />
        <h3 className="text-sm uppercase tracking-wide text-white/70">
          Build · {champ.name}
        </h3>
      </div>

      {noData && (
        <div className="mt-2 p-3 rounded-md bg-bg-card/40 ring-1 ring-dashed ring-white/10">
          <p className="text-xs text-white/60 leading-relaxed">
            No se pudo cargar la build recomendada de op.gg.
          </p>
          <p className="text-[11px] text-white/40 mt-1">
            Verifica que el proxy esté activo en Prefs.
          </p>
        </div>
      )}

      {opggLoading && (
        <p className="text-[11px] text-white/40 italic">
          Cargando build recomendada de op.gg...
        </p>
      )}

      {opggBuild && (
        <OpggBuildSection
          build={opggBuild}
          patch={db.patch}
          champion={champ}
          role={role}
        />
      )}

      <PowerSpikesBars championId={champ.id} />

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

/**
 * Renders op.gg's recommended build: starter → boots → core 3 → 4th/5th/6th
 * with WR/pickrate badges, plus skill order and rune page.
 */
function OpggBuildSection({
  build,
  patch,
  champion,
  role,
}: {
  build: OpggBuild;
  patch: string;
  champion: Champion;
  role: Role;
}) {
  // OPTIMAL build: highest WR with significant sample (not just most popular).
  // Falls back to most-popular if no option meets the sample threshold.
  const top = {
    starter: pickBestBuild(build.starterItems),
    boots: pickBestBuild(build.boots),
    core: pickBestBuild(build.coreItems),
    fourth: pickBestBuild(build.fourthItems),
    fifth: pickBestBuild(build.fifthItems),
    sixth: pickBestBuild(build.sixthItems),
  };
  // Skill order and runes: optimal = highest WR among options
  const skill = build.skills.reduce<typeof build.skills[number] | null>(
    (best, s) => {
      if (!best) return s;
      const sWR = s.play > 0 ? s.win / s.play : 0;
      const bWR = best.play > 0 ? best.win / best.play : 0;
      return sWR > bWR ? s : best;
    },
    null
  );
  const rune = pickMostPopular(build.runes); // runes: most-popular is usually optimal already

  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between">
        <p className="text-[10px] uppercase tracking-widest text-accent font-semibold">
          ⚡ Build óptima · op.gg
        </p>
        <p className="text-[9px] text-white/35">mejor WR con muestra significativa</p>
      </div>

      {/* Build path: starter → boots → 3 core → final items */}
      <div className="space-y-1.5">
        {top.starter && (
          <BuildRow label="Inicio" path={top.starter} patch={patch} />
        )}
        {top.boots && (
          <BuildRow label="Botas" path={top.boots} patch={patch} />
        )}
        {top.core && (
          <BuildRow label="Core 3" path={top.core} patch={patch} highlight />
        )}
        {top.fourth && (
          <BuildRow label="4º item" path={top.fourth} patch={patch} />
        )}
        {top.fifth && (
          <BuildRow label="5º item" path={top.fifth} patch={patch} />
        )}
        {top.sixth && (
          <BuildRow label="6º item" path={top.sixth} patch={patch} />
        )}
      </div>

      {/* Skill order */}
      {skill && (
        <div className="border-t border-white/5 pt-2">
          <p className="text-[10px] uppercase tracking-widest text-white/45 mb-1">
            Subida habilidades
          </p>
          <div className="flex flex-wrap gap-0.5">
            {skill.order.split("").slice(0, 18).map((s, i) => (
              <span
                key={i}
                className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold rounded bg-bg-card ring-1 ring-border-subtle"
                title={`Nivel ${i + 1}: ${s}`}
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Summoner spells: op.gg's dominant combo passed through our
          coherence layer, which enforces Smite for jungle and may
          override the 2nd spell based on champion archetype (e.g.
          Galio mid → TP not Ignite). The original op.gg pickRate/WR
          numbers are still shown so the user knows the underlying
          dominant pick — `overrode=true` is hinted via the reason
          string under the spells. */}
      {(() => {
        const opggPair = build.summonerSpells?.[0];
        const coherent = pickCoherentSpells(
          champion,
          role,
          opggPair?.ids
        );
        const pickRate = opggPair?.pickRate ?? 0;
        const winRate = opggPair?.winRate ?? 0;
        return (
          <SpellsRow
            spell1Id={coherent.ids[0]}
            spell2Id={coherent.ids[1]}
            patch={patch}
            pickRate={pickRate}
            winRate={winRate}
            reason={coherent.reason}
            overrode={coherent.overrode}
          />
        );
      })()}

      {/* Runes */}
      {rune && (
        <div className="border-t border-white/5 pt-2">
          <p className="text-[10px] uppercase tracking-widest text-white/45 mb-1">
            Runas · {rune.primaryPage} / {rune.secondaryPage}
          </p>
          <p className="text-xs text-white/70">
            <span className="text-accent">{rune.primaryRunes[0]}</span> + {" "}
            {rune.primaryRunes.slice(1).join(", ")} | {rune.secondaryRunes.join(", ")}
          </p>
        </div>
      )}

      {/* Full matchup grid — real WR vs every common opponent in role.
          Replaces the old 3+3 counter teaser with op.gg's full scraped
          list (~60 matchups). Sorted: top 4 you beat + top 4 you lose to,
          with sample sizes shown for credibility. */}
      <MatchupGrid championDdId={champion.id} role={role} />
    </div>
  );
}

function MatchupGrid({
  championDdId,
  role,
}: {
  championDdId: string;
  role: Role;
}) {
  const [matchups, setMatchups] = useState<OpggMatchup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMatchups([]);
    fetchOpggMatchups(championDdId, role).then((m) => {
      if (cancelled) return;
      setMatchups(m);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [championDdId, role]);

  if (loading) {
    return (
      <div className="border-t border-white/5 pt-2">
        <p className="text-[10px] text-white/30 italic">Cargando matchups...</p>
      </div>
    );
  }
  if (matchups.length === 0) return null;

  // Filter to entries with enough sample size (≥50 games) so we don't
  // surface noise from rare matchups, then sort: lowest WR = hardest for us.
  const significant = matchups.filter((m) => m.play >= 50);
  const sortedByWr = [...significant].sort((a, b) => b.winRate - a.winRate);
  const youBeat = sortedByWr.filter((m) => m.winRate >= 50).slice(0, 4);
  const youLose = [...sortedByWr]
    .filter((m) => m.winRate < 50)
    .reverse() // lowest WR first
    .slice(0, 4);

  return (
    <div className="border-t border-white/5 pt-2 grid grid-cols-2 gap-3">
      <MatchupColumn
        title="Ganas vs"
        color="text-good"
        entries={youBeat}
      />
      <MatchupColumn
        title="Pierdes vs"
        color="text-bad"
        entries={youLose}
      />
    </div>
  );
}

function MatchupColumn({
  title,
  color,
  entries,
}: {
  title: string;
  color: string;
  entries: OpggMatchup[];
}) {
  if (entries.length === 0) {
    return (
      <div>
        <p className={`text-[10px] uppercase tracking-widest ${color} mb-1`}>
          {title}
        </p>
        <p className="text-[10px] text-white/35 italic">Sin datos</p>
      </div>
    );
  }
  return (
    <div>
      <p className={`text-[10px] uppercase tracking-widest ${color} mb-1`}>
        {title}
      </p>
      <ul className="space-y-0.5">
        {entries.map((m) => (
          <li
            key={m.championKey}
            className="flex items-center justify-between text-[11px] text-white/70"
            title={`${m.play.toLocaleString()} partidas`}
          >
            <span className="truncate pr-1">{m.championName}</span>
            <span
              className={`tabular-nums text-[10px] font-medium ${
                m.winRate >= 50 ? "text-good" : "text-bad"
              }`}
            >
              {m.winRate.toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BuildRow({
  label,
  path,
  patch,
  highlight = false,
}: {
  label: string;
  path: OpggBuildPath;
  patch: string;
  highlight?: boolean;
}) {
  const winRate = path.play > 0 ? path.win / path.play : 0;
  const wrColor =
    winRate >= 0.52 ? "text-good" : winRate >= 0.49 ? "text-white/65" : "text-bad/80";
  return (
    <div
      className={`flex items-center gap-2 ${
        highlight ? "p-1.5 rounded bg-accent/10 ring-1 ring-accent/30" : ""
      }`}
      title={`${path.play.toLocaleString()} partidas · ${(path.pickRate * 100).toFixed(1)}% pick rate`}
    >
      <span className="text-[10px] uppercase tracking-wider text-white/45 w-12 shrink-0">
        {label}
      </span>
      <div className="flex gap-1 flex-1">
        {path.ids.map((id, i) => (
          <ItemIcon key={i} patch={patch} id={id} />
        ))}
      </div>
      <div className="flex flex-col items-end shrink-0 leading-tight">
        <span className={`text-[11px] tabular-nums font-semibold ${wrColor}`}>
          {(winRate * 100).toFixed(0)}% WR
        </span>
        <span className="text-[9px] tabular-nums text-white/30">
          {(path.pickRate * 100).toFixed(0)}% PR
        </span>
      </div>
    </div>
  );
}

/**
 * Renders the recommended summoner spell combo + a button to import them
 * into the live client (only shown if user enabled showSpellImportButton
 * AND the LCU is reachable — applySummonerSpells fails silently otherwise
 * so we don't need to gate the button further).
 */
function SpellsRow({
  spell1Id,
  spell2Id,
  patch,
  pickRate,
  winRate,
  reason,
  overrode,
}: {
  spell1Id: number;
  spell2Id: number;
  patch: string;
  pickRate: number;
  winRate: number;
  reason: string;
  overrode: boolean;
}) {
  const showButton = usePrefsStore((s) => s.prefs.showSpellImportButton);
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
      setTimeout(() => setApplied(false), 1500);
    }
  };
  return (
    <div className="border-t border-white/5 pt-2">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] uppercase tracking-widest text-white/45">
          Hechizos de invocador
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
            {applied ? "✓ Aplicado" : applying ? "..." : "Aplicar"}
          </button>
        )}
      </div>
      {/* When we overrode op.gg's dominant pick to keep coherence with
          the champion's archetype, surface the reasoning so the user
          knows it's intentional and not random. */}
      <p
        className={`text-[9px] mt-1 ${
          overrode ? "text-accent/70" : "text-white/30"
        }`}
      >
        {overrode ? "↳ " : ""}
        {reason}
      </p>
    </div>
  );
}

function SpellIcon({
  id,
  meta,
  patch,
}: {
  id: number;
  meta?: { name: string; icon: string };
  patch: string;
}) {
  // Data Dragon hosts summoner spell icons by their internal filename
  // (e.g. SummonerFlash.png). We fall back to communitydragon ID-based
  // path if the meta map doesn't have this spell — covers Mark/Snowball
  // and any future additions without us having to update the map.
  const src = meta
    ? `https://ddragon.leagueoflegends.com/cdn/${patch}/img/spell/${meta.icon}`
    : `https://raw.communitydragon.org/latest/game/data/spells/icons2d/summoner_flash.png`;
  return (
    <img
      src={src}
      alt={meta?.name ?? `Spell ${id}`}
      className="w-8 h-8 rounded border border-border-subtle"
      title={meta?.name ?? `Spell ${id}`}
      onError={(e) => ((e.target as HTMLImageElement).style.opacity = "0.3")}
    />
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

export const BuildPanel = memo(BuildPanelInner);
