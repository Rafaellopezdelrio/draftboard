// Lobby scout — shows when champ select is active. Lists each teammate
// (and enemies when names visible) with rank, level, and a quick
// "smurf?" flag for accounts that look fresh. Replaces a manual lookup
// in Porofessor: you see immediately who's reliable on your team.

import { memo, useEffect, useState, type ReactNode } from "react";
import { Shield, Users, Star, ShieldAlert, Swords } from "lucide-react";
import { Panel } from "./ui/Panel";
import { scoutTeam, type ScoutedPlayer } from "../services/lobbyScout";
import { readLobby, dodgeHint } from "../engine/lobbyInsights";
import type { LcuChampSelectSession, LcuPlayer } from "../services/lcuService";
import type { ChampionDb } from "../types/champion";

interface Props {
  session: LcuChampSelectSession | null;
  db: ChampionDb;
}

function LobbyScoutPanelInner({ session, db }: Props) {
  const [myTeam, setMyTeam] = useState<Array<ScoutedPlayer | null>>([]);
  const [theirTeam, setTheirTeam] = useState<Array<ScoutedPlayer | null>>([]);
  const [loading, setLoading] = useState(false);

  // Re-scout whenever the set of summonerIds changes. Champion changes
  // (hover/lock) don't trigger a re-scan — only roster changes (player
  // dodges, role swaps).
  const myRosterKey = session?.myTeam
    .map((p) => p.summonerId)
    .filter(Boolean)
    .sort()
    .join(",");
  const theirRosterKey = session?.theirTeam
    .map((p) => p.summonerId)
    .filter(Boolean)
    .sort()
    .join(",");

  useEffect(() => {
    if (!session) {
      setMyTeam([]);
      setTheirTeam([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      scoutTeam(session.myTeam.map((p: LcuPlayer) => ({ cellId: p.cellId, championId: p.championId, summonerId: p.summonerId }))),
      scoutTeam(session.theirTeam.map((p: LcuPlayer) => ({ cellId: p.cellId, championId: p.championId, summonerId: p.summonerId }))),
    ]).then(([mine, theirs]) => {
      if (cancelled) return;
      setMyTeam(mine);
      setTheirTeam(theirs);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myRosterKey, theirRosterKey]);

  if (!session) return null;
  if (myTeam.length === 0 && theirTeam.length === 0) {
    return loading ? (
      <Panel padding="sm">
        <p className="text-[10px] text-white/30 italic">Cargando lobby scout...</p>
      </Panel>
    ) : null;
  }

  const read = readLobby(
    myTeam.filter((p): p is ScoutedPlayer => Boolean(p)),
    theirTeam.filter((p): p is ScoutedPlayer => Boolean(p))
  );
  const hasRead =
    read.carry || read.liability || read.topThreat || read.balance;
  const dodge = dodgeHint(read);

  return (
    <Panel padding="sm">
      <div className="flex items-center gap-2 mb-2">
        <Users className="w-3.5 h-3.5 text-accent" />
        <p className="text-[10px] uppercase tracking-widest text-accent font-semibold">
          Lobby scout
        </p>
      </div>

      {dodge && (
        <div className="mb-2 px-2 py-1.5 rounded text-[11px] font-medium bg-bad/10 text-bad border border-bad/40 leading-snug">
          ⚠ {dodge.text}
        </div>
      )}

      {hasRead && (
        <div className="mb-2 space-y-1">
          {read.carry && (
            <Callout
              icon={<Star className="w-3 h-3 text-good shrink-0" />}
              name={read.carry.name}
              reason={read.carry.reason}
              nameClass="text-good"
            />
          )}
          {read.liability && (
            <Callout
              icon={<ShieldAlert className="w-3 h-3 text-meh shrink-0" />}
              name={read.liability.name}
              reason={read.liability.reason}
              nameClass="text-meh"
            />
          )}
          {read.topThreat && (
            <Callout
              icon={<Swords className="w-3 h-3 text-bad shrink-0" />}
              name={read.topThreat.name}
              reason={read.topThreat.reason}
              nameClass="text-bad"
            />
          )}
          {read.balance && (
            <p className="text-[11px] text-white/70 leading-snug pl-[18px]">
              {read.balance.text}
            </p>
          )}
        </div>
      )}

      <TeamColumn label="Tu equipo" team={myTeam} db={db} colorClass="text-blue-300" />
      {theirTeam.some((p) => p) && (
        <div className="mt-2 pt-2 border-t border-white/5">
          <TeamColumn
            label="Enemigos"
            team={theirTeam}
            db={db}
            colorClass="text-red-300"
          />
        </div>
      )}
    </Panel>
  );
}

function Callout({
  icon,
  name,
  reason,
  nameClass,
}: {
  icon: ReactNode;
  name: string;
  reason: string;
  nameClass: string;
}) {
  return (
    <div className="flex items-start gap-1.5 text-[11px] leading-snug">
      <span className="mt-0.5">{icon}</span>
      <span className="min-w-0">
        <span className={`font-semibold ${nameClass}`}>{name}</span>
        <span className="text-white/60"> — {reason}</span>
      </span>
    </div>
  );
}

function TeamColumn({
  label,
  team,
  db,
  colorClass,
}: {
  label: string;
  team: Array<ScoutedPlayer | null>;
  db: ChampionDb;
  colorClass: string;
}) {
  const visible = team.filter((p): p is ScoutedPlayer => Boolean(p));
  if (visible.length === 0) return null;
  return (
    <div>
      <p className={`text-[9px] uppercase tracking-widest font-semibold mb-1 ${colorClass}`}>
        {label}
      </p>
      <ul className="space-y-1">
        {visible.map((p) => (
          <PlayerRow key={p.summonerId} p={p} db={db} />
        ))}
      </ul>
    </div>
  );
}

/** Maps a Riot rank string (e.g. "DIAMOND IV", "EMERALD II") to the
 *  CommunityDragon emblem URL. Returns null for unranked / unknown
 *  tiers so caller can render the fallback Shield icon. */
function rankEmblemUrl(rank: string | undefined | null): string | null {
  if (!rank) return null;
  const tier = rank.split(" ")[0]?.toLowerCase();
  const valid = [
    "iron",
    "bronze",
    "silver",
    "gold",
    "platinum",
    "emerald",
    "diamond",
    "master",
    "grandmaster",
    "challenger",
  ];
  if (!tier || !valid.includes(tier)) return null;
  // CDragon hosts ranked emblems under a stable path. Lowercase, no spaces.
  return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-mini-regalia/${tier}.png`;
}

function PlayerRow({ p, db }: { p: ScoutedPlayer; db: ChampionDb }) {
  const champ = Object.values(db.champions).find(
    (c) => Number(c.key) === p.championId
  );
  // Smurf heuristic: ranked stats on a low-level account = brand-new
  // account climbing fast. The 30-50 range is the typical smurf window
  // (account just hit the level required to play ranked).
  const smurfHint = p.level < 80 && p.soloRank && p.soloRank !== "IRON IV";

  const wrColor =
    p.soloWinRate >= 0.55
      ? "text-good"
      : p.soloWinRate >= 0.48
        ? "text-white/65"
        : "text-bad";

  const emblem = rankEmblemUrl(p.soloRank);

  return (
    <li className="flex items-center gap-2 text-[11px]">
      {champ && (
        <img
          src={champ.iconUrl}
          alt={champ.name}
          className="w-6 h-6 rounded shrink-0"
          loading="lazy"
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-white truncate">{p.summonerName}</span>
          <span className="text-white/35 text-[9px] shrink-0">lvl {p.level}</span>
          {smurfHint && (
            <span className="text-[8px] uppercase tracking-wider text-yellow-300 bg-yellow-300/10 px-1 rounded shrink-0">
              smurf?
            </span>
          )}
        </div>
        {p.soloRank && (
          <div className="flex items-center gap-1.5 text-[10px] text-white/55">
            {emblem ? (
              <img
                src={emblem}
                alt={p.soloRank}
                className="w-4 h-4 shrink-0"
                onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
              />
            ) : (
              <Shield className="w-2.5 h-2.5" />
            )}
            <span className="font-medium">
              {p.soloRank} · {p.soloLp} LP
            </span>
            <span className={`tabular-nums ${wrColor}`}>
              {(p.soloWinRate * 100).toFixed(0)}% en {p.soloGames}g
            </span>
          </div>
        )}
        {!p.soloRank && (
          <p className="text-[10px] text-white/30">Sin ranked esta temporada</p>
        )}
      </div>
    </li>
  );
}

/** Memoised — `session` comes from useLcuSync (stable across non-roster
 * updates), `db` is set once at boot. Together they make memo() worth
 * the wrapper. */
export const LobbyScoutPanel = memo(LobbyScoutPanelInner);
