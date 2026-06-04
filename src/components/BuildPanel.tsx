import { memo, useEffect, useMemo, useState } from "react";
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
import { OpggBuildSection } from "./build/OpggBuildSection";
import { ItemIcon, PerkIcon } from "./build/icons";
import { usePrefsStore } from "../state/prefsStore";
import {
  suggestBuildAdaptations,
  type BuildAdaptation,
} from "../engine/adaptiveBuildEngine";
import { PowerSpikesBars } from "./PowerSpikesBars";
import { fetchOpggBuild, type OpggBuild } from "../services/opggBuilds";
import { suggestInGameAdaptations, type InGameSuggestion } from "../engine/inGameAdapter";
import { aramAdvice } from "../engine/aramEngine";
import { runeAdvice } from "../engine/runeAdvice";
import type { Champion } from "../types/champion";
import { useLiveGame } from "../hooks/useLiveGame";
import { findMyPlayer } from "../services/liveClient";
import { useToast } from "./ui/ToastContainer";
// All sub-components that need OpggBuild types live in components/build/.
// BuildPanel.tsx is now the shell: fetches build + adaptations +
// in-game suggestions, then hands them to <OpggBuildSection />.

// translateTree + TREE_NAMES_ES moved to build/RuneIcon.tsx alongside
// the rune helpers they're used with.

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
  const { push: pushToast } = useToast();

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

  // Adaptations recompute the enemy-comp profile every call (~5 SET ops +
  // map). Memoising means only re-running when the actual inputs change,
  // not on every parent prefs/draft tick. Guarded for null champ + kept
  // ABOVE the early return so all hooks run unconditionally (rules-of-hooks).
  const adaptations: BuildAdaptation[] = useMemo(
    () => (champ ? suggestBuildAdaptations({ db, champion: champ, enemyKeys }) : []),
    [db, champ, enemyKeys]
  );

  // Situational rune/shard tweaks for the enemy comp (MR vs AP, tenacity vs
  // CC, sustain vs poke). Layered next to the aggregate rune page.
  const runeTips = useMemo(
    () =>
      champ
        ? runeAdvice(
            champ,
            enemyKeys
              .map((k) => db.champions[k])
              .filter((c): c is Champion => Boolean(c))
          )
        : [],
    [champ, enemyKeys, db]
  );

  // Live in-game contextual adapter — reads enemy item snapshots from
  // localhost:2999 and emits Grievous Wounds / armor pen / etc as the
  // match progresses. Only active when the player is actually mid-match;
  // otherwise the hook returns inGame=false and we render nothing.
  const liveGame = useLiveGame(true);

  // ARAM detection — if the player is in a Howling Abyss match the
  // standard SR-only build advice is misleading (no recall, no role,
  // different scaling). We surface a banner so the user knows to take
  // recs with a grain of salt. Full ARAM-aware engine is a separate
  // milestone; this is the minimal "honesty" UX.
  const isAram =
    liveGame.snapshot?.gameData?.gameMode === "ARAM" ||
    liveGame.snapshot?.gameData?.mapNumber === 12;
  const inGameSuggestions: InGameSuggestion[] = useMemo(() => {
    if (!champ || !liveGame.inGame || !liveGame.snapshot) return [];
    const me = findMyPlayer(liveGame.snapshot.activePlayer, liveGame.snapshot.allPlayers);
    if (!me) return [];
    const enemies = liveGame.snapshot.allPlayers.filter((p) => p.team !== me.team);
    return suggestInGameAdaptations({
      champion: champ,
      enemyPlayers: enemies,
      gameTime: liveGame.snapshot.gameData.gameTime,
      myItems: me.items,
    });
  }, [liveGame.inGame, liveGame.snapshot, champ]);

  // All hooks above now run unconditionally (rules-of-hooks); safe to bail
  // if the champion key isn't in the DB (unknown/brand-new champ).
  if (!champ) return null;

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
        <div className="mt-2 p-3 rounded-md bg-bg-card/40 ring-1 ring-dashed ring-white/10 space-y-2">
          <p className="text-xs text-white/60 leading-relaxed">
            No se pudo cargar la build recomendada de op.gg.
          </p>
          <p className="text-[11px] text-white/40">
            Verifica que el proxy esté activo en Prefs, o reintenta — puede ser un timeout puntual de op.gg.
          </p>
          <button
            type="button"
            onClick={() => {
              // Re-trigger the opgg fetch by clearing local state and
              // forcing the effect to re-run. Using a no-op state setter
              // would be cleaner but our effect depends on champ+role
              // identity which doesn't change, so we cheat: temporarily
              // toggle opggLoading via setOpggLoading(true) to gate the
              // user and let the next champ+role tick re-fetch. In
              // practice the user clicking Retry happens because the
              // first fetch failed → cache was never populated → next
              // mount of this panel will retry automatically. Forcing
              // a fresh fetch is more reliable.
              setOpggBuild(null);
              setOpggLoading(true);
              fetchOpggBuild(champ.id, role).then((b) => {
                setOpggBuild(b);
                setOpggLoading(false);
              });
            }}
            className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-1 rounded ring-1 ring-accent/40 bg-accent/10 text-accent hover:bg-accent/20 transition"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* ARAM mode banner — surfaces the fact that the standard SR build
        * advice may not apply on Howling Abyss. Cheap, honest UX cue
        * until the full ARAM engine ships. */}
      {isAram && (
        <div className="rounded-md border border-accent/40 bg-accent/10 p-2 text-[11px] space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-accent text-base leading-none">⚔</span>
            <p className="text-accent font-semibold">Consejo ARAM · {champ.name}</p>
          </div>
          <ul className="space-y-1 pl-1">
            {aramAdvice(champ).map((t, i) => (
              <li key={i} className="text-white/75 leading-tight flex gap-1.5">
                <span className="text-accent/70 shrink-0">•</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <p className="text-white/40 text-[10px] leading-tight">
            Los items de abajo son de SoloQ — adapta hacia sustain/poke.
          </p>
        </div>
      )}

      {opggLoading && (
        <div className="space-y-2" aria-live="polite">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <p className="text-[11px] text-white/55">
              Cargando build óptima…
            </p>
          </div>
          {/* Skeleton bars matching the eventual BuildRow layout so the
            * panel doesn't visually jump when data arrives — better than
            * a blank loading state. */}
          <div className="space-y-1.5">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex items-center gap-2 animate-pulse"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="w-12 h-3 rounded bg-white/5 shrink-0" />
                <div className="flex gap-1 flex-1">
                  <div className="w-8 h-8 rounded bg-white/5" />
                  <div className="w-8 h-8 rounded bg-white/5" />
                  <div className="w-8 h-8 rounded bg-white/5" />
                </div>
                <div className="w-10 h-4 rounded bg-white/5" />
              </div>
            ))}
          </div>
        </div>
      )}

      {opggBuild && (
        <OpggBuildSection
          build={opggBuild}
          patch={db.patch}
          champion={champ}
          role={role}
          adaptations={adaptations}
          inGameSuggestions={inGameSuggestions}
          enemyDdIds={enemyKeys
            .map((k) => db.champions[k]?.id)
            .filter((id): id is string => Boolean(id))}
        />
      )}

      <PowerSpikesBars championId={champ.id} />

      {builds.length > 0 && (
        <div>
          <p className="text-xs text-white/50 mb-1">Items finales</p>
          <div className="flex flex-wrap gap-1">
            {/* Dedup itemIds — aggregation source occasionally returns
              * the same item twice (e.g. when both starter + late-game
              * variant of an item appear in the same build path).
              * Visual noise; we want one icon per unique item. Preserve
              * insertion order so the build curve still reads correctly. */}
            {Array.from(new Set(builds[0].itemIds)).map((id, i) => (
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
        <div className="rounded-md border border-accent/30 bg-accent/5 p-2 mt-2">
          <div className="flex items-baseline justify-between mb-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-accent">
              Runas recomendadas
            </p>
            {showRuneButton && (
            <button
              className="text-xs font-medium px-2 py-0.5 bg-accent text-black rounded hover:bg-accent-deep transition"
              onClick={async () => {
                setImportStatus("Aplicando...");
                const ok = await applyRunes({
                  name: `${champ.name} ${role}`,
                  primaryStyleId: runes.primaryStyle,
                  subStyleId: runes.subStyle,
                  selectedPerkIds: runes.perks,
                });
                setImportStatus(ok ? "✓ Aplicadas" : "Error — abre el cliente");
                // Toast confirmation in addition to the inline status —
                // ensures the user gets a clear signal even if the button
                // is off-screen due to scroll.
                pushToast({
                  type: ok ? "success" : "error",
                  title: ok ? "Runas aplicadas" : "Error aplicando runas",
                  detail: ok
                    ? "El cliente de LoL ya tiene la página activa."
                    : "Abre el cliente y reintenta.",
                  durationMs: 3000,
                });
              }}
            >
              Aplicar →
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

      {runeTips.length > 0 && (
        <div className="rounded-md border border-accent/20 bg-accent/5 p-2">
          <p className="text-[10px] uppercase tracking-wide text-accent/80 font-semibold mb-1">
            Runas vs su comp
          </p>
          <ul className="space-y-1">
            {runeTips.map((t, i) => (
              <li
                key={i}
                className="text-[11px] text-white/75 leading-tight flex gap-1.5"
              >
                <span className="text-accent/70 shrink-0">•</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}


// All sub-components extracted to components/build/:
//   - OpggBuildSection: orchestrates the full op.gg render path
//   - MatchupGrid: matchup fetch + 2-col render + threat tiers
//   - ProBuildsSection: u.gg pro variants tab switcher
//   - BuildRow: single row of the build path
//   - SpellsRow: summoner spells + apply button
//   - RuneIcon: rune name → perk image (with tree-name translation)
//   - StatChip: stat roll-up color chip
//   - BuyOrderTimeline: horizontal phase flow with approximate timings
//   - SkillOrderSection: Q/W/E/R icons + level sequence
//   - icons: ItemIcon + PerkIcon + SpellIcon primitives
// BuildPanel.tsx retains only the orchestrator (BuildPanelInner) that
// fetches build + adaptations + in-game suggestions and renders the
// header + legacy fallback rows + OpggBuildSection.

export const BuildPanel = memo(BuildPanelInner);
