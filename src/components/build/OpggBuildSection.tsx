// Main op.gg build composition view. Owns the layout for the build's
// header (classifier name + tier + sample size + copy button), stats
// roll-up chips, build path rows, buy-order timeline, in-game counter
// recs, draft-time comp adaptations, skill order, summoner spells,
// rune block, matchup grid, and pro builds section.
//
// All the heavy sub-components (BuildRow, SpellsRow, RuneIcon, etc)
// live in sibling files under build/. This file is the orchestrator
// that wires them to a single op.gg payload.
//
// Extracted from BuildPanel.tsx (it was a 365-LOC function-inside-
// function before this split — the parent component is much easier to
// reason about now).

import type { Champion, Role } from "../../types/champion";
import { pickBestBuild, pickMostPopular, type OpggBuild } from "../../services/opggBuilds";
import { pickCoherentSpells } from "../../services/spellCoherence";
import {
  classifyBuild,
  tierFromWinRate,
  type BuildClassification,
} from "../../engine/buildClassifier";
import type { BuildAdaptation } from "../../engine/adaptiveBuildEngine";
import type { InGameSuggestion } from "../../engine/inGameAdapter";
import { TierBadge } from "../ui/TierBadge";
import { useToast } from "../ui/ToastContainer";
import { BuildRow } from "./BuildRow";
import { SpellsRow } from "./SpellsRow";
import { RuneIcon, translateTree } from "./RuneIcon";
import { StatChip } from "./StatChip";
import { BuyOrderTimeline } from "./BuyOrderTimeline";
import { SkillOrderSection } from "./SkillOrderSection";
import { MatchupGrid } from "./MatchupGrid";
import { ProBuildsSection } from "./ProBuildsSection";
import { ItemIcon } from "./icons";

interface Props {
  build: OpggBuild;
  patch: string;
  champion: Champion;
  role: Role;
  adaptations: BuildAdaptation[];
  inGameSuggestions: InGameSuggestion[];
}

export function OpggBuildSection({
  build,
  patch,
  champion,
  role,
  adaptations,
  inGameSuggestions,
}: Props) {
  // OPTIMAL build: highest WR with significant sample (not just most
  // popular). Falls back to most-popular if no option meets the
  // sample threshold.
  const top = {
    starter: pickBestBuild(build.starterItems),
    boots: pickBestBuild(build.boots),
    core: pickBestBuild(build.coreItems),
    fourth: pickBestBuild(build.fourthItems),
    fifth: pickBestBuild(build.fifthItems),
    sixth: pickBestBuild(build.sixthItems),
  };
  // Skill order: optimal = highest WR among options. Runes: most-
  // popular is usually optimal too (op.gg ranks by play count + WR).
  const skill = build.skills.reduce<typeof build.skills[number] | null>(
    (best, s) => {
      if (!best) return s;
      const sWR = s.play > 0 ? s.win / s.play : 0;
      const bWR = best.play > 0 ? best.win / best.play : 0;
      return sWR > bWR ? s : best;
    },
    null
  );
  const rune = pickMostPopular(build.runes);

  // Classification — derives the human-readable archetype name,
  // playstyle description, total stats, and tier from the core 3.
  // Pure heuristic via ITEM_TAGS (no API call). Falls back to
  // "Build estándar" when core items don't match a known archetype.
  const coreIds = top.core
    ? Array.from(new Set(top.core.ids)).filter((id) => id > 0)
    : [];
  const classification: BuildClassification | null =
    coreIds.length > 0 ? classifyBuild(coreIds) : null;
  const coreWR = top.core && top.core.play > 0 ? top.core.win / top.core.play : 0;
  const buildTier =
    top.core && top.core.play >= 500 ? tierFromWinRate(coreWR) : null;

  // Copy build to clipboard — exports a compact text summary the
  // user can paste in Discord or post-match analysis.
  const { push: pushToast } = useToast();
  const handleCopy = async () => {
    const lines: string[] = [];
    lines.push(`${classification?.name ?? "Build"} · ${champion.name} ${role}`);
    if (classification) lines.push(classification.description);
    if (top.starter)
      lines.push(`Inicio: ${top.starter.ids.filter((id) => id > 0).join(", ")}`);
    if (top.boots)
      lines.push(`Botas: ${top.boots.ids.filter((id) => id > 0).join(", ")}`);
    if (top.core) lines.push(`Core 3: ${coreIds.join(", ")}`);
    if (top.fourth)
      lines.push(`4º: ${top.fourth.ids.filter((id) => id > 0).join(", ")}`);
    if (rune) {
      lines.push(
        `Runas: ${rune.primaryPage} (${rune.primaryRunes.join(", ")}) / ${rune.secondaryPage} (${rune.secondaryRunes.join(", ")})`
      );
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
      {/* Build header — name + tier + sample size. Replaces the generic
        * "Build óptima · op.gg" line with a concrete archetype label
        * so the user knows AT A GLANCE what playstyle this build is. */}
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
              <span
                className={
                  top.core.win / top.core.play >= 0.52
                    ? "text-good"
                    : "text-white/55"
                }
              >
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
        * Lets the user compare archetypes without doing math. */}
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
            <StatChip
              label="CRIT"
              value={classification.stats.critItems}
              color="bad"
            />
          )}
        </div>
      )}

      {/* Build path: starter → boots → 3 core → final items */}
      <div className="space-y-1.5">
        {top.starter && (
          <BuildRow label="Inicio" path={top.starter} patch={patch} />
        )}
        {top.boots && <BuildRow label="Botas" path={top.boots} patch={patch} />}
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

      {/* Buy order timeline — compact horizontal flow with approximate
        * purchase timings. Helps the user answer "what should I buy
        * at 12min?" at a glance. */}
      <BuyOrderTimeline
        starter={top.starter}
        boots={top.boots}
        core={top.core}
        fourth={top.fourth}
        fifth={top.fifth}
        sixth={top.sixth}
        patch={patch}
      />

      {/* In-game contextual counters — TOP priority when player is
        * mid-match. Driven by real enemy item snapshots, so signals
        * are concrete ("they have 230 armor, buy Lord Dominik's").
        * Highest signal-to-noise of any BuildPanel section. */}
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
                  <p className="text-white font-medium leading-tight">
                    {s.itemName}
                  </p>
                  <p className="text-white/60 text-[10px] leading-tight mt-0.5">
                    {s.reason}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Draft-time adaptations vs enemy comp — based on champion
        * tags, not live items. Useful during champ select before any
        * items are bought. Lower priority than live counters. */}
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
                  <p className="text-white font-medium leading-tight">
                    {a.itemName}
                  </p>
                  <p className="text-white/60 text-[10px] leading-tight mt-0.5">
                    {a.reason}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Skill order — Q/W/E/R icons + level sequence. */}
      {skill && (
        <div className="border-t border-white/5 pt-2 space-y-1.5">
          <SkillOrderSection
            order={skill.order}
            championId={champion.id}
            patch={patch}
          />
        </div>
      )}

      {/* Summoner spells — op.gg's dominant combo passed through our
        * coherence layer (Galio mid → TP not Ignite, etc). */}
      {(() => {
        const opggPair = build.summonerSpells?.[0];
        const coherent = pickCoherentSpells(champion, role, opggPair?.ids);
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

      {/* Runes — Mobalytics-style block with real perk icons. */}
      {rune && (
        <div className="mt-2 rounded-md border border-accent/40 bg-gradient-to-br from-accent/10 via-accent/5 to-transparent p-3">
          <div className="flex items-baseline justify-between mb-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-accent">
              Runas recomendadas
            </p>
            <p className="text-[10px] text-white/55">
              {translateTree(rune.primaryPage)} /{" "}
              {translateTree(rune.secondaryPage)}
            </p>
          </div>
          {/* Primary tree — keystone left, sub-runes right. */}
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
          {/* Secondary tree — smaller icons, no keystone. */}
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
          {/* Stat shards. */}
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

      {/* Matchup grid — top-4 wins / top-4 losses with threat tiers. */}
      <MatchupGrid championDdId={champion.id} role={role} />

      {/* Pro builds — clustered variants from u.gg pro match data. */}
      <ProBuildsSection
        championId={Number(champion.key)}
        role={role}
        patch={patch}
      />
    </div>
  );
}
