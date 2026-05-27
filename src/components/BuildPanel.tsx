import { memo, useEffect, useMemo, useState } from "react";
import {
  loadAggregatedBuilds,
  loadAggregatedRunes,
  loadAggregatedSkillOrder,
  type BuildAgg,
  type RuneAgg,
  type SkillOrderAgg,
} from "../services/aggregateRepo";
import type { Champion, ChampionDb, Role } from "../types/champion";
import { applyRunes } from "../services/lcuService";
// UI_FEEDBACK_MS + SUMMONER_SPELL_META + applySummonerSpells now live
// inside build/SpellsRow which owns the apply flow.
import { MatchupGrid } from "./build/MatchupGrid";
import { ProBuildsSection } from "./build/ProBuildsSection";
import { BuildRow } from "./build/BuildRow";
import { SpellsRow } from "./build/SpellsRow";
import { ItemIcon, PerkIcon } from "./build/icons";
// fetchProBuilds + types now live inside ProBuildsSection.
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
import { suggestInGameAdaptations, type InGameSuggestion } from "../engine/inGameAdapter";
import { useLiveGame } from "../hooks/useLiveGame";
import { findMyPlayer } from "../services/liveClient";
import {
  classifyBuild,
  tierFromWinRate,
  type BuildClassification,
} from "../engine/buildClassifier";
import { lookupPerkId } from "../data/runePerkIds";
import { TierBadge } from "./ui/TierBadge";
import { useToast } from "./ui/ToastContainer";
import { getPerkIconUrl, subscribeToPerkIcons } from "../services/perkIcons";
// getItemMeta/subscribeToItemMeta now live in build/icons.tsx
import {
  getChampionSpells,
  spellIconUrl,
  subscribeToChampionSpells,
} from "../services/championSpells";

/**
 * Translates op.gg's English tree names to Spanish for UI consistency.
 * Falls through to the input string if already in Spanish or unknown.
 * Matching is exact + case-insensitive on the canonical English form.
 *
 * Hoisted to module top BEFORE consumers (RuneIcon, OpggBuildSection)
 * to avoid Vite HMR stalls where a partial reload leaves the helper
 * undefined for downstream JSX — surfaced as ReferenceError in
 * production (Sentry DRAFTBOARD-2).
 */
const TREE_NAMES_ES: Record<string, string> = {
  Precision: "Precisión",
  Domination: "Dominación",
  Sorcery: "Hechicería",
  Resolve: "Determinación",
  Inspiration: "Inspiración",
};
function translateTree(name: string | undefined): string {
  if (!name) return "";
  const direct = TREE_NAMES_ES[name];
  if (direct) return direct;
  for (const k of Object.keys(TREE_NAMES_ES)) {
    if (k.toLowerCase() === name.toLowerCase()) return TREE_NAMES_ES[k];
  }
  return name;
}

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

  if (!champ) return null;

  // Adaptations recompute the enemy-comp profile every call (~5 SET ops +
  // map). Memoising means only re-running when the actual inputs change,
  // not on every parent prefs/draft tick.
  const adaptations: BuildAdaptation[] = useMemo(
    () => suggestBuildAdaptations({ db, champion: champ, enemyKeys }),
    [db, champ, enemyKeys]
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
    if (!liveGame.inGame || !liveGame.snapshot) return [];
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
        <div className="rounded-md border border-accent/40 bg-accent/10 p-2 flex items-start gap-2 text-[11px]">
          <span className="text-accent text-base leading-none">⚔</span>
          <div className="flex-1">
            <p className="text-accent font-semibold">Modo ARAM detectado</p>
            <p className="text-white/65 leading-tight">
              Build óptima abajo es de SoloQ. ARAM-specific recs llegarán en próximo update.
            </p>
          </div>
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
  adaptations,
  inGameSuggestions,
}: {
  build: OpggBuild;
  patch: string;
  champion: Champion;
  role: Role;
  adaptations: BuildAdaptation[];
  inGameSuggestions: InGameSuggestion[];
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

  // ----- Build classification: derives name, description, stats roll-up
  // and tier from the core 3 item path. Pure heuristic via ITEM_TAGS
  // so no API call needed. Falls back to "Build estándar" if core
  // items don't match a known archetype. -----
  const coreIds = top.core ? Array.from(new Set(top.core.ids)).filter((id) => id > 0) : [];
  const classification: BuildClassification | null =
    coreIds.length > 0 ? classifyBuild(coreIds) : null;
  const coreWR = top.core && top.core.play > 0 ? top.core.win / top.core.play : 0;
  const buildTier = top.core && top.core.play >= 500 ? tierFromWinRate(coreWR) : null;

  // ----- Copy build to clipboard — exports a compact text summary the
  // user can paste in Discord or post-match analysis. Includes name,
  // items, runes, skills. Items by ID so it's stable across patches. -----
  const { push: pushToast } = useToast();
  const handleCopy = async () => {
    const lines: string[] = [];
    lines.push(`${classification?.name ?? "Build"} · ${champion.name} ${role}`);
    if (classification) lines.push(classification.description);
    if (top.starter)
      lines.push(`Inicio: ${top.starter.ids.filter((id) => id > 0).join(", ")}`);
    if (top.boots) lines.push(`Botas: ${top.boots.ids.filter((id) => id > 0).join(", ")}`);
    if (top.core) lines.push(`Core 3: ${coreIds.join(", ")}`);
    if (top.fourth) lines.push(`4º: ${top.fourth.ids.filter((id) => id > 0).join(", ")}`);
    if (rune) {
      lines.push(`Runas: ${rune.primaryPage} (${rune.primaryRunes.join(", ")}) / ${rune.secondaryPage} (${rune.secondaryRunes.join(", ")})`);
    }
    if (skill) lines.push(`Habilidades: ${skill.order}`);
    lines.push(`Patch ${patch}`);
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      pushToast({
        type: "success",
        title: "Build copiada",
        detail: "Pégala en Discord o donde quieras compartirla.",
        durationMs: 2500,
      });
    } catch {
      pushToast({
        type: "error",
        title: "No se pudo copiar",
        detail: "El navegador bloqueó el acceso al portapapeles.",
      });
    }
  };

  return (
    <div className="space-y-2.5">
      {/* Build header — name (auto-classified) + tier badge + sample
        * size. Replaces the generic "Build óptima · op.gg" line with
        * a concrete archetype label so the user knows AT A GLANCE
        * what playstyle this build commits them to. */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            {buildTier && <TierBadge tier={buildTier} size="sm" />}
            <p className="text-sm font-bold text-white truncate">
              {classification?.name ?? "Build óptima"}
            </p>
            <span className="text-[9px] uppercase tracking-widest text-accent/70 shrink-0">
              op.gg
            </span>
          </div>
          {classification && (
            <p className="text-[10px] text-white/55 leading-tight">
              {classification.description}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {top.core && (
            <p className="text-[9px] text-white/45 tabular-nums whitespace-nowrap">
              {(top.core.play / 1000).toFixed(1)}k partidas ·{" "}
              <span className={top.core.win / top.core.play >= 0.52 ? "text-good" : "text-white/55"}>
                {((top.core.win / top.core.play) * 100).toFixed(1)}% WR
              </span>
            </p>
          )}
          <button
            onClick={handleCopy}
            className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-bg-card/60 ring-1 ring-border-subtle text-white/60 hover:text-accent hover:ring-accent/50 transition"
            title="Copia la build entera al portapapeles para Discord"
          >
            ⧉ Copiar
          </button>
        </div>
      </div>

      {/* Build stats roll-up — total AD/AP/HP/MR/armor from core 3.
        * Lets the user compare archetypes ("this build has 240 AD",
        * "that one only 180 AD but 800 HP") without doing math. */}
      {classification && (
        <div className="flex flex-wrap gap-1 text-[10px]">
          {classification.stats.ad > 0 && (
            <StatChip label="AD" value={classification.stats.ad} color="bad" />
          )}
          {classification.stats.ap > 0 && (
            <StatChip label="AP" value={classification.stats.ap} color="accent" />
          )}
          {classification.stats.hp > 0 && (
            <StatChip label="HP" value={classification.stats.hp} color="good" />
          )}
          {classification.stats.armor > 0 && (
            <StatChip label="ARM" value={classification.stats.armor} color="meh" />
          )}
          {classification.stats.mr > 0 && (
            <StatChip label="MR" value={classification.stats.mr} color="info" />
          )}
          {classification.stats.critItems > 0 && (
            <StatChip label="CRIT" value={classification.stats.critItems} color="bad" />
          )}
        </div>
      )}

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

      {/* Buy order timeline — compact horizontal flow showing the
        * expected purchase progression. Times are rough (Riot doesn't
        * expose actual avg purchase timing per item, only path winrates)
        * so we map slot position to a rough lane state. Helps the user
        * answer "what should I buy at 12min?" at a glance. */}
      <BuyOrderTimeline
        starter={top.starter}
        boots={top.boots}
        core={top.core}
        fourth={top.fourth}
        fifth={top.fifth}
        sixth={top.sixth}
        patch={patch}
      />

      {/* In-game contextual counters — TOP priority when player is mid-match.
        * Driven by enemy item snapshots, so signals are concrete ("they have
        * 230 armor, buy Lord Dominik's"). Highest signal-to-noise of any
        * BuildPanel section because the data is real-time, not heuristic. */}
      {inGameSuggestions.length > 0 && (
        <div className="border-t border-accent/30 pt-2">
          <p className="text-[10px] uppercase tracking-widest text-accent font-semibold mb-1.5">
            🔴 Counters live · según items enemigos
          </p>
          <div className="space-y-1">
            {inGameSuggestions.map((s) => (
              <div
                key={s.key}
                className={`flex items-start gap-2 p-1.5 rounded text-[11px] ${
                  s.priority === "core"
                    ? "bg-bad/10 border border-bad/40"
                    : "bg-meh/10 border border-meh/40"
                }`}
                title={s.reason}
              >
                <ItemIcon patch={patch} id={s.itemId} />
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium leading-tight">{s.itemName}</p>
                  <p className="text-white/60 text-[10px] leading-tight mt-0.5">{s.reason}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Draft-time adaptations vs enemy comp — based on champion tags
        * (Marksman/Mage/Tank etc), not live items. Useful during champ
        * select before any items are bought. Lower priority than live
        * counters so we render below them. */}
      {adaptations.length > 0 && (
        <div className="border-t border-white/5 pt-2">
          <p className="text-[10px] uppercase tracking-widest text-white/45 mb-1.5">
            Adaptaciones vs comp enemiga
          </p>
          <div className="space-y-1">
            {adaptations.map((a, i) => (
              <div
                key={i}
                className={`flex items-start gap-2 p-1.5 rounded text-[11px] ${
                  a.priority === "core"
                    ? "bg-bad/10 border border-bad/40"
                    : "bg-meh/10 border border-meh/40"
                }`}
              >
                <ItemIcon patch={patch} id={a.itemId} />
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium leading-tight">{a.itemName}</p>
                  <p className="text-white/60 text-[10px] leading-tight mt-0.5">{a.reason}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Skill order — top row shows ABILITY ICONS (Q/W/E/R real
        * pictures) with their first-pick-level overlaid; bottom row
        * shows the level-by-level progression as letter chips so the
        * user knows the macro pattern. Real icons fetched async from
        * DDragon champion data; falls back to letters while loading. */}
      {skill && (
        <div className="border-t border-white/5 pt-2 space-y-1.5">
          <SkillOrderSection
            order={skill.order}
            championId={champion.id}
            patch={patch}
          />
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

      {/* Runes — Mobalytics-style block. Keystone large with glow,
        * sub-runes in a horizontal row, secondary tree below smaller,
        * stat shards in compact pill row at bottom. Tree names get
        * translated to Spanish via TREE_NAMES_ES so the user sees
        * consistent locale across the whole panel. */}
      {rune && (
        <div className="mt-2 rounded-md border border-accent/40 bg-gradient-to-br from-accent/10 via-accent/5 to-transparent p-3">
          <div className="flex items-baseline justify-between mb-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-accent">
              Runas recomendadas
            </p>
            <p className="text-[10px] text-white/55">
              {translateTree(rune.primaryPage)} / {translateTree(rune.secondaryPage)}
            </p>
          </div>
          {/* Primary tree — keystone left, sub-runes right in a single row.
            * Visual hierarchy: keystone biggest, then perks normal size. */}
          <div className="mb-2.5">
            <p className="text-[9px] uppercase tracking-widest text-accent/80 mb-1.5 font-semibold">
              {translateTree(rune.primaryPage)}
            </p>
            <div className="flex items-center gap-2">
              <RuneIcon name={rune.primaryRunes[0]} keystone />
              <div className="flex items-center gap-1.5">
                {rune.primaryRunes.slice(1).map((n, i) => (
                  <RuneIcon key={i} name={n} />
                ))}
              </div>
            </div>
          </div>
          {/* Secondary tree — smaller icons, no keystone */}
          {rune.secondaryRunes.length > 0 && (
            <div className="mb-2.5">
              <p className="text-[9px] uppercase tracking-widest text-white/55 mb-1.5 font-semibold">
                {translateTree(rune.secondaryPage)}
              </p>
              <div className="flex items-center gap-1.5">
                {rune.secondaryRunes.map((n, i) => (
                  <RuneIcon key={i} name={n} />
                ))}
              </div>
            </div>
          )}
          {/* Stat shards — flat AD/AS/Health row */}
          {rune.statMods && rune.statMods.length > 0 && (
            <div>
              <p className="text-[9px] uppercase tracking-widest text-white/40 mb-1">
                Fragmentos
              </p>
              <div className="flex items-center gap-1 flex-wrap">
                {rune.statMods.map((n, i) => (
                  <RuneIcon key={i} name={n} small />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Full matchup grid — real WR vs every common opponent in role.
          Replaces the old 3+3 counter teaser with op.gg's full scraped
          list (~60 matchups). Sorted: top 4 you beat + top 4 you lose to,
          with sample sizes shown for credibility. */}
      <MatchupGrid championDdId={champion.id} role={role} />

      {/* Pro builds — clustered variants from u.gg's pro match data.
          Shows 2-3 archetypes pros are running this patch with the actual
          pros that played them. The killer feature that op.gg/dpm don't
          have programatically. */}
      <ProBuildsSection championId={Number(champion.key)} role={role} patch={patch} />
    </div>
  );
}

// MatchupGrid + MatchupColumn extracted to components/build/MatchupGrid.tsx
// (see import at the top of this file). Removed from here to shrink
// BuildPanel.tsx — the sub-components are independent + tested via
// their own boundary.

// ProBuildsSection extracted to components/build/ProBuildsSection.tsx.

// BuildRow + SpellsRow extracted to components/build/.

// ItemIcon / PerkIcon / SpellIcon extracted to components/build/icons.tsx.
// Imported at the top of this file. Shared with the split-out
// sub-sections (MatchupGrid, ProBuildsSection, etc).

/**
 * Renders a rune by its string name (e.g. "Conqueror", "Triunfo").
 * Resolves to a DataDragon perk ID via RUNE_NAME_TO_PERK_ID and renders
 * an actual perk icon. Falls back to a styled text chip when the name
 * isn't in our map — better than rendering a broken image with alt text.
 */
/**
 * Resolve a rune string to a perk ID. Handles three cases:
 *   1. Numeric string ("5005") — op.gg sometimes ships statMods as raw IDs.
 *      Pass through directly.
 *   2. Named string ("Conqueror") — look up via RUNE_NAME_TO_PERK_ID.
 *   3. Anything else — null (caller renders text fallback).
 *
 * Without this, statMod IDs like 5005/5001 fell through to text chips
 * because they don't match any English/Spanish key in our map.
 */
function resolveRuneId(name: string): number | null {
  if (!name) return null;
  // Numeric? Use directly. Riot's stat shards are 5001/5002/5003/5005/5007/5008/5011/5013.
  if (/^\d+$/.test(name)) {
    const n = parseInt(name, 10);
    if (n > 0) return n;
  }
  return lookupPerkId(name);
}

function RuneIcon({
  name,
  keystone = false,
  small = false,
}: {
  name: string;
  keystone?: boolean;
  small?: boolean;
}) {
  const perkId = resolveRuneId(name);
  const size = keystone ? "w-12 h-12" : small ? "w-6 h-6" : "w-8 h-8";

  // Force a re-render once perks.json finishes loading. Until then,
  // getPerkIconUrl returns a generic fallback URL that's still visible
  // (so the panel never has empty cells), but on real load the icons
  // swap to the proper per-perk images automatically.
  const [, force] = useState(0);
  useEffect(() => {
    return subscribeToPerkIcons(() => force((n) => n + 1));
  }, []);

  if (perkId === null) {
    // Unknown rune name — render a text chip rather than a broken icon.
    return (
      <span
        className={`inline-flex items-center justify-center px-1.5 ${keystone ? "py-1 text-[10px]" : "py-0.5 text-[9px]"} bg-bg-card/60 ring-1 ring-border-subtle rounded text-white/70`}
        title={`Sin icono: ${name}`}
      >
        {name}
      </span>
    );
  }

  const src = getPerkIconUrl(perkId);
  // Wrap the img in a span so we can show a tooltip on hover via a
  // styled pseudo-element rather than the browser's native `title`
  // attribute. Native tooltips render as huge OS-level popups that
  // overlap adjacent rune icons (Sentry screenshot showed
  // "Legend: Haste" tooltip covering the next 3 runes). The styled
  // tooltip is small, dark-themed, and never bleeds outside the
  // panel.
  return (
    <span
      className={`relative inline-block group/rune`}
      aria-label={name}
    >
      <img
        src={src}
        alt={name}
        className={`${size} rounded ${keystone ? "ring-2 ring-accent/70 shadow-[0_0_8px_rgba(78,205,196,0.45)] bg-black/40 p-0.5" : "ring-1 ring-border-subtle bg-black/30"}`}
        onError={(e) => {
          // Manifest URL also failed — fade to placeholder rather
          // than showing the alt text.
          const img = e.currentTarget;
          img.style.opacity = "0.3";
        }}
      />
      {/* Compact custom tooltip — appears on hover, dark themed,
        * never extends beyond the panel column so it doesn't cover
        * adjacent runes. opacity-based show/hide so layout doesn't
        * jump. */}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-7 px-1.5 py-0.5 rounded bg-bg-elev/95 border border-border-subtle text-[10px] text-white whitespace-nowrap opacity-0 group-hover/rune:opacity-100 transition-opacity z-30 shadow-md"
      >
        {name}
      </span>
    </span>
  );
}

/**
 * Compact colored chip for a single stat value. Used in the build stats
 * roll-up row so the user can compare archetypes (AD/AP/HP/MR/etc)
 * without doing math. Colors mirror good/bad/info/meh from the global
 * Tailwind palette so the visual language stays consistent.
 */
function StatChip({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "good" | "bad" | "meh" | "accent" | "info";
}) {
  const palette = {
    good: "bg-good/15 text-good ring-good/40",
    bad: "bg-bad/15 text-bad ring-bad/40",
    meh: "bg-meh/15 text-meh ring-meh/40",
    accent: "bg-accent/15 text-accent ring-accent/40",
    info: "bg-blue-500/15 text-blue-300 ring-blue-500/40",
  }[color];
  return (
    <span
      className={`inline-flex items-baseline gap-1 px-1.5 py-0.5 rounded ring-1 tabular-nums font-medium ${palette}`}
    >
      <span className="opacity-70 text-[9px] uppercase">{label}</span>
      <span>{value}</span>
    </span>
  );
}

/**
 * Buy order timeline — horizontal compact flow of build progression.
 * X-axis = expected purchase order, each cell = 1 item slot. Times
 * are heuristic (Riot doesn't expose purchase timings per item path)
 * but anchored to typical SoloQ progression: starter at 0min,
 * boots ~5-7min, core 3 by ~25min, full build by 35min+.
 */
function BuyOrderTimeline({
  starter,
  boots,
  core,
  fourth,
  fifth,
  sixth,
  patch,
}: {
  starter: OpggBuildPath | null;
  boots: OpggBuildPath | null;
  core: OpggBuildPath | null;
  fourth: OpggBuildPath | null;
  fifth: OpggBuildPath | null;
  sixth: OpggBuildPath | null;
  patch: string;
}) {
  const phases: Array<{ label: string; time: string; ids: number[]; emphasis: boolean }> = [];
  if (starter) phases.push({ label: "Inicio", time: "0:00", ids: starter.ids, emphasis: false });
  if (boots) phases.push({ label: "Botas", time: "~6:00", ids: boots.ids, emphasis: false });
  if (core) phases.push({ label: "Core 3", time: "~22:00", ids: core.ids, emphasis: true });
  if (fourth) phases.push({ label: "4º", time: "~28:00", ids: fourth.ids, emphasis: false });
  if (fifth) phases.push({ label: "5º", time: "~35:00", ids: fifth.ids, emphasis: false });
  if (sixth) phases.push({ label: "6º", time: "~40:00+", ids: sixth.ids, emphasis: false });
  if (phases.length === 0) return null;

  return (
    <div className="border-t border-white/5 pt-2">
      <p className="text-[10px] uppercase tracking-widest text-white/45 mb-1.5">
        Orden de compra · timeline
      </p>
      <div className="flex items-stretch gap-1 overflow-x-auto pb-1">
        {phases.map((p, i) => {
          const ids = Array.from(new Set(p.ids)).filter((id) => id > 0);
          if (ids.length === 0) return null;
          return (
            <div
              key={i}
              className={`flex flex-col items-center gap-0.5 shrink-0 ${p.emphasis ? "ring-1 ring-accent/40 rounded p-1 bg-accent/5" : ""}`}
              title={`${p.label} · aprox ${p.time}`}
            >
              <span className="text-[9px] uppercase tracking-wider text-white/45">
                {p.time}
              </span>
              <div className="flex gap-0.5">
                {ids.slice(0, 3).map((id, j) => (
                  <img
                    key={j}
                    src={`https://ddragon.leagueoflegends.com/cdn/${patch}/img/item/${id}.png`}
                    alt=""
                    className="w-6 h-6 rounded border border-border-subtle"
                    onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                  />
                ))}
              </div>
              <span className={`text-[9px] uppercase tracking-wider ${p.emphasis ? "text-accent font-semibold" : "text-white/45"}`}>
                {p.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Skill order with real ability icons. Top row: Q/W/E/R icons sized
 * larger with their first-leveled level number badge. Bottom row: the
 * full 18-level priority pattern as small letter chips. Falls back to
 * pure letters until DDragon champion data loads.
 */
function SkillOrderSection({
  order,
  championId,
  patch,
}: {
  order: string;
  championId: string;
  patch: string;
}) {
  // Force re-render when champion spell data finishes loading. The
  // first call to getChampionSpells kicks the fetch; subsequent calls
  // return cached data.
  const [, force] = useState(0);
  useEffect(() => {
    return subscribeToChampionSpells(() => force((n) => n + 1));
  }, []);
  const spells = getChampionSpells(patch, championId);

  // Compute first-level priority — what skill the player levels at 1,
  // 2, 3, then which is maxed first. Shows the macro pattern at a glance.
  const firstThree = order.slice(0, 3).split("");
  const skillFirstLevel: Record<string, number> = {};
  for (let i = 0; i < order.length; i++) {
    const s = order[i];
    if (skillFirstLevel[s] === undefined) skillFirstLevel[s] = i + 1;
  }

  const skillIndex = (letter: string): number => {
    if (letter === "Q") return 0;
    if (letter === "W") return 1;
    if (letter === "E") return 2;
    if (letter === "R") return 3;
    return -1;
  };

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] uppercase tracking-widest text-white/45">
        Subida de habilidades
      </p>

      {/* Top row: 4 ability icons (or letter fallback) with level badge */}
      <div className="flex items-center gap-1.5">
        {["Q", "W", "E", "R"].map((letter) => {
          const idx = skillIndex(letter);
          const spell = idx >= 0 && spells?.spells[idx];
          const lvl = skillFirstLevel[letter];
          // Highlight the first-three priority skills so the user knows
          // what to level at 1/2/3.
          const isPriority = firstThree.includes(letter);
          return (
            <div
              key={letter}
              className={`relative ${isPriority ? "ring-2 ring-accent/60 rounded" : ""}`}
              title={spell ? `${letter}: ${spell.name}` : `${letter}: nivel ${lvl ?? "?"}`}
            >
              {spell ? (
                <img
                  src={spellIconUrl(patch, spell.image)}
                  alt={spell.name}
                  className="w-9 h-9 rounded border border-border-subtle"
                  onError={(e) => ((e.currentTarget as HTMLImageElement).style.opacity = "0.3")}
                />
              ) : (
                <span className="inline-flex items-center justify-center w-9 h-9 text-base font-bold rounded bg-bg-card border border-border-subtle text-accent">
                  {letter}
                </span>
              )}
              {/* Level badge in bottom-right corner — shows when player
                * first puts a point in this skill. */}
              {lvl && (
                <span className="absolute -bottom-1 -right-1 text-[9px] font-bold bg-accent text-black rounded-full w-4 h-4 inline-flex items-center justify-center ring-1 ring-bg">
                  {lvl}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom row: full 18-level letter sequence */}
      <div className="flex flex-wrap gap-0.5">
        {order.split("").slice(0, 18).map((s, i) => (
          <span
            key={i}
            className={`inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold rounded ring-1 ${
              s === "R"
                ? "bg-accent/20 ring-accent/50 text-accent"
                : "bg-bg-card ring-border-subtle text-white/80"
            }`}
            title={`Nivel ${i + 1}: ${s}`}
          >
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

export const BuildPanel = memo(BuildPanelInner);
