import { useEffect, useState } from "react";
import {
  lcuPositionToRole,
  subscribeChampSelect,
  subscribeStatus,
  fetchCurrentChampSelect,
  type LcuChampSelectSession,
  type LcuStatus,
} from "../services/lcuService";
import { useDraftStore } from "./draftStore";
import { trackEvent } from "../services/breadcrumbs";
import { voiceCoach } from "../services/voiceCoach";
import { nativeNotify } from "../services/nativeNotify";

// Safety re-sync interval. Events (Rust WS → Tauri bus) are the primary,
// low-latency path; this poll is the backstop that re-reads the LCU
// (source of truth) so the board self-heals if an event is ever missed or
// the IPC bridge degrades (the "Couldn't find callback id… app reloaded
// while Rust running async" class — seen on HMR remounts and slow async).
const CHAMP_SELECT_RESYNC_MS = 4000;

// Shared dedup across BOTH the event path and the poll path. Without it,
// every real change would be applied twice (once by the event, once by the
// next poll) → redundant store writes → wasted re-renders. JSON of the
// payload is the signature: comprehensive (can't under-capture a field) and
// cheap at this frequency. Reset to "" on the null/leave frame so re-entering
// champ select always applies its first frame.
let lastAppliedRaw = "";

export function useLcuSync() {
  const [status, setStatus] = useState<LcuStatus>({ connected: false });
  // Track the latest champ-select session so consumers (LobbyScoutPanel,
  // etc.) can react to roster changes. Cleared when we leave the lobby.
  const [session, setSession] = useState<LcuChampSelectSession | null>(null);

  useEffect(() => {
    // Apply only when the payload actually changed (see lastAppliedRaw).
    // Returns true when applied so the caller knows to update React state.
    const applyIfChanged = (s: LcuChampSelectSession | null): boolean => {
      const raw = s ? JSON.stringify(s) : "";
      if (raw === lastAppliedRaw) return false;
      lastAppliedRaw = raw;
      applySession(s);
      return true;
    };

    const unsubStatus = subscribeStatus(setStatus);
    const unsubData = subscribeChampSelect((s) => {
      if (applyIfChanged(s)) setSession(s);
    });
    // Self-seed the current champ-select session on mount. The WS only
    // fires on CHANGE and the Rust bootstrap GET emits once at watcher
    // connect — both can fire BEFORE this listener mounts (cold boot while
    // already in champ select, or an HMR remount), leaving the board empty
    // until the next pick/ban. Pull it directly so the board fills now.
    void fetchCurrentChampSelect().then((s) => {
      if (s && applyIfChanged(s)) setSession(s);
    });

    // Backstop poll — re-reads the session every few seconds and applies it
    // only when it differs from what's already on the board. Cheap: a 404
    // (not in champ select) returns null fast and is a no-op.
    let cancelled = false;
    const pollId = setInterval(async () => {
      if (cancelled) return;
      const s = await fetchCurrentChampSelect();
      if (cancelled) return;
      // s === null means champ select has ended (404 / not in select). We must
      // let that through so applySession(null) resets the board. The WebSocket
      // doesn't always deliver an exit frame (it can just go silent), so this
      // poll is the only thing that clears a finished draft — previously the
      // `!s` early-return swallowed the null and the dead draft (teams, bans,
      // local pick) stayed frozen on screen until a manual Ctrl+R / reload.
      if (applyIfChanged(s)) setSession(s);
    }, CHAMP_SELECT_RESYNC_MS);

    return () => {
      cancelled = true;
      clearInterval(pollId);
      unsubStatus.then((fn) => fn());
      unsubData.then((fn) => fn());
    };
  }, []);

  return { status, session };
}

let lastLockedChamp: string | null = null;
let lastLoggedAramShape = "";
// Last champ-select timer phase seen. Used to tell "champ select ended ->
// game is loading" (FINALIZATION/GAME_STARTING) from "champ select ended ->
// dodge / back to lobby" (any earlier phase). On the former we PRESERVE the
// board so the draft + matchup stay visible through the whole game (the user
// expects them until the match finishes); on the latter we reset.
let lastChampSelectPhase: string | null = null;
// TTS turn-detection dedupe — we only speak once per ban/pick turn.
// Reset to null when the action transitions to completed (lock-in) or
// when the cellId changes. Same pattern as lastLockedChamp.
let lastSpokenMyBanTurnId: number | null = null;
let lastSpokenMyPickTurnId: number | null = null;
let lastSpokenEnemyBanIds: Set<number> = new Set();
// Blind-pick diagnostic: tracks the cell we last warned about to
// dedup the "my champ + intent both 0" log so it doesn't spam every
// frame.
let lastBlindWarnedCell: number | null = null;

/** Compact signature of a session frame for log dedup. */
let lastDiagSignature = "";

// Debug flag (read once at module load). OFF → frame logs use console.log
// = devtools only, NOT bridged to the disk log (logger.ts only mirrors
// warn/info/error), so the hot path pays zero IPC + disk cost. Set
// localStorage["draftboard:debug-lcu"]="1" + reload to promote frames to
// console.info (disk-mirrored) for live tracing.
const DEBUG_LCU =
  typeof localStorage !== "undefined" &&
  localStorage.getItem("draftboard:debug-lcu") === "1";

function diagnosticLog(s: LcuChampSelectSession) {
  // Compact deterministic signature: phase + ban+pick count + my cell
  // championId. Changes only when something material changes.
  const myTeam = Array.isArray(s.myTeam) ? s.myTeam : [];
  const theirTeam = Array.isArray(s.theirTeam) ? s.theirTeam : [];
  const myBans = Array.isArray(s.bans?.myTeamBans) ? s.bans!.myTeamBans.length : 0;
  const enemyBans = Array.isArray(s.bans?.theirTeamBans) ? s.bans!.theirTeamBans.length : 0;
  const actionBans = Array.isArray(s.actions)
    ? s.actions.flat().filter((a) => a?.type === "ban" && a.championId > 0).length
    : 0;
  const actionPicks = Array.isArray(s.actions)
    ? s.actions.flat().filter((a) => a?.type === "pick" && a.championId > 0).length
    : 0;
  const myPicks = myTeam.filter((p) => p.championId > 0).length;
  const enemyPicks = theirTeam.filter((p) => p.championId > 0).length;
  const sig = `${s.timer?.phase ?? "?"}|team${myTeam.length}+${theirTeam.length}|b${myBans}+${enemyBans}|ab${actionBans}|ap${actionPicks}|p${myPicks}+${enemyPicks}|cell${s.localPlayerCellId}`;
  if (sig === lastDiagSignature) return;
  lastDiagSignature = sig;
  // Sig carries phase, roster sizes, and WHERE pick data lives — myTeam
  // picks (p) vs actions[][] picks (ap). DEBUG_LCU promotes to console.info
  // (disk) for tracing; default console.log keeps it devtools-only + cheap.
  if (DEBUG_LCU) {
    // eslint-disable-next-line no-console
    console.info(`[lcuSync] frame: ${sig}`);
  } else {
    // eslint-disable-next-line no-console
    console.log(`[lcuSync] frame: ${sig}`);
  }
}

/**
 * Reset everything when the user leaves champ select (dodge, queue exit,
 * game start). Clears the board so the dead draft doesn't linger, and
 * resets all the once-per-session dedup vars (TTS turns, blind-pick warn,
 * ARAM shape log, frame signature) so the NEXT champ select starts fresh —
 * otherwise stale action.id / signature values could suppress legitimate
 * announcements or skip the first frame. `myRole` is intentionally
 * preserved (the user may have set it manually for out-of-select planning).
 */
function leaveChampSelect() {
  // Always reset the per-session dedup state so the NEXT champ select starts
  // clean (TTS turns, blind-pick warn, frame signature, voice).
  lastSpokenMyBanTurnId = null;
  lastSpokenMyPickTurnId = null;
  lastSpokenEnemyBanIds = new Set();
  lastLockedChamp = null;
  lastBlindWarnedCell = null;
  lastLoggedAramShape = "";
  lastDiagSignature = "";
  voiceCoach.resetSession();

  // PRESERVE the board when the draft just finished and the game is loading
  // (last phase was FINALIZATION / GAME_STARTING). The user wants the draft +
  // matchup to stay on screen for the whole game, not vanish the instant the
  // loading screen appears. Only a real exit BEFORE finalization (dodge, queue
  // cancel) clears the board.
  const gameStarting =
    lastChampSelectPhase === "FINALIZATION" ||
    lastChampSelectPhase === "GAME_STARTING";
  if (gameStarting) return;

  const store = useDraftStore.getState();
  store.reset();
  store.setLocalSelection(null, null, null);
  store.setEnemySummonerIds([]);
  store.setPhase(null, null);
}

/**
 * Exported for unit tests — apply a champ-select session payload to the
 * draft store. Defensive against malformed/null payloads (ARAM lacks
 * `bans`, mid-transition events may lack `theirTeam`, Delete events
 * deliver `null` data through Tauri's event bus).
 */
export function __testOnly_applySession(
  s: LcuChampSelectSession | null | undefined
) {
  applySession(s);
}

function applySession(s: LcuChampSelectSession | null | undefined) {
  // Defensive: Rust emits `envelope.data` which may be `null` on Delete
  // events, or the WebSocket can deliver a payload with missing arrays
  // (ARAM has no bans, and certain mid-transition frames lack theirTeam).
  // Treat any malformed shape as a no-op rather than crashing the store
  // — a crash here silently breaks pick rendering with no error in the UI.
  if (!s || typeof s !== "object") {
    leaveChampSelect();
    return;
  }

  const myTeam = Array.isArray(s.myTeam) ? s.myTeam : [];
  const theirTeam = Array.isArray(s.theirTeam) ? s.theirTeam : [];

  // Left champ select. Rust filters the `null` Delete event (it only emits
  // when `data.is_object()`), so leaving NEVER arrives as null here — it
  // arrives as an emptied session object (no players, localPlayerCellId -1).
  // Without this branch the null-clear above never fired in production and
  // the previous draft's bans + local selection stayed frozen on the board
  // after the game started. Both teams empty is unambiguous: a live champ
  // select always has at least the local player in myTeam.
  if (myTeam.length === 0 && theirTeam.length === 0) {
    leaveChampSelect();
    return;
  }

  // ARAM diagnostic: when both teams come in fully populated but champion
  // IDs are still 0, log once per shape change so we can see what field
  // the LCU is actually using. Removed once the shape is confirmed.
  if (
    myTeam.length === 5 &&
    theirTeam.length === 5 &&
    myTeam.every((p) => !p.championId) &&
    theirTeam.every((p) => !p.championId)
  ) {
    const shape = JSON.stringify({
      myKeys: Object.keys(myTeam[0] ?? {}),
      theirKeys: Object.keys(theirTeam[0] ?? {}),
    });
    if (shape !== lastLoggedAramShape) {
      lastLoggedAramShape = shape;
      // eslint-disable-next-line no-console
      console.warn("[lcuSync] champ select session has no championIds — fields:", shape);
    }
  }

  const store = useDraftStore.getState();
  const myCell = s.localPlayerCellId;
  const myPlayer = [...myTeam, ...theirTeam].find(
    (p) => p.cellId === myCell
  );

  // ── Pick fallback from actions[][] ──
  // In BLIND PICK queue (430), Riot leaves myTeam[].championId AND
  // championPickIntent at 0 the entire phase, but DOES populate the pick
  // action's `championId` for the local player (whether hovered or locked).
  // We build a per-cell pick map here and use it as fallback below.
  // Same map covers ally/enemy slot iteration so blind-pick allies and
  // enemies also appear in the UI (previously the whole board stayed
  // empty for the entire phase).
  //
  // The map gives us both the locked champ (act.completed=true) and the
  // hover champ (act.completed=false). We pick locked over hover when
  // both exist for the same cell.
  const cellPickMap = new Map<number, { locked: number; hover: number }>();
  if (Array.isArray(s.actions)) {
    for (const group of s.actions) {
      if (!Array.isArray(group)) continue;
      for (const act of group) {
        if (!act || act.type !== "pick" || !act.championId || act.championId <= 0) continue;
        const cellId = act.actorCellId;
        if (typeof cellId !== "number") continue;
        const existing = cellPickMap.get(cellId) ?? { locked: 0, hover: 0 };
        if (act.completed) existing.locked = act.championId;
        else existing.hover = act.championId;
        cellPickMap.set(cellId, existing);
      }
    }
  }
  const pickFromActions = (cellId: number | undefined): { locked: string | null; intent: string | null } => {
    if (typeof cellId !== "number") return { locked: null, intent: null };
    const entry = cellPickMap.get(cellId);
    if (!entry) return { locked: null, intent: null };
    return {
      locked: entry.locked > 0 ? String(entry.locked) : null,
      intent: entry.hover > 0 ? String(entry.hover) : null,
    };
  };
  if (myPlayer) {
    const role = lcuPositionToRole(myPlayer.assignedPosition);
    if (role) store.setMyRole(role);
    const fromMyTeam = {
      locked: myPlayer.championId > 0 ? String(myPlayer.championId) : null,
      intent:
        myPlayer.championPickIntent && myPlayer.championPickIntent > 0
          ? String(myPlayer.championPickIntent)
          : null,
    };
    const fromActions = pickFromActions(myCell);
    // Prefer myTeam fields when populated (draft pick) and fall back to
    // actions[][] map (blind pick — populated there but not in myTeam).
    const locked = fromMyTeam.locked ?? fromActions.locked;
    const intent = fromMyTeam.intent ?? fromActions.intent;

    // Diagnostic — still warn once if BOTH paths returned null, which
    // would mean Riot's session shape is unrecognised (new queue type,
    // schema change). Helps catch regressions vs the silent-empty state.
    // Dedup on `=== null`, NOT `!lastBlindWarnedCell`: cell 0 is falsy, so the
    // truthy check re-warned every poll for the local player at cellId 0 (the
    // common case) — flooding the log with identical "no champ" warnings.
    if (locked === null && intent === null && lastBlindWarnedCell === null) {
      lastBlindWarnedCell = myCell;
      // eslint-disable-next-line no-console
      // Log the ACTUAL values, not just field names — custom games + new
      // queue shapes need this to tell apart "championId genuinely 0" from a
      // localPlayerCellId / cellId mismatch (my cell points at the wrong slot).
      console.warn(
        `[lcuSync] my cell ${myCell} has no champ in myTeam OR actions —`,
        `championId=${myPlayer.championId}`,
        `pickIntent=${myPlayer.championPickIntent}`,
        `localPlayerCellId=${s.localPlayerCellId}`,
        `myTeamCells=[${myTeam.map((p) => `${p.cellId}:${p.championId}`).join(",")}]`,
        `actionPickCells=[${[...cellPickMap.keys()].join(",") || "none"}]`,
        `fields=${Object.keys(myPlayer ?? {}).join(",")}`
      );
    }
    if (locked !== null) lastBlindWarnedCell = null;

    store.setLocalSelection(myCell, intent, locked);

    // Fire lock event the first time we see this champion locked.
    if (locked && locked !== lastLockedChamp) {
      lastLockedChamp = locked;
      trackEvent("draft.pick", "Local champion locked", { championKey: locked });
      window.dispatchEvent(
        new CustomEvent("draft:champion-locked", { detail: { championKey: locked } })
      );
      // Audible confirmation. Dedup by champKey so reopen of champ select
      // with same hover doesn't repeat. session reset clears via resetSession.
      voiceCoach.speak("Campeón bloqueado", `lock-${locked}`);
    }
    if (!locked) lastLockedChamp = null;
  }

  if (s.timer) {
    store.setPhase(s.timer.phase, Math.max(0, Math.round(s.timer.adjustedTimeLeftInPhase / 1000)));
    // Remember the phase so leaveChampSelect can tell "game starting" (preserve
    // the board) from "dodge / left lobby" (reset it).
    lastChampSelectPhase = s.timer.phase;
  }

  // Iterate FIXED 5 pick slots per side (not forEach over team arrays)
  // so trailing slots clear when a player leaves the lobby or the team
  // array shrinks mid-session. Same defensive pattern as bans.
  for (let idx = 0; idx < 5; idx++) {
    const ally = myTeam[idx];
    if (ally) {
      // Same priority as myCell: myTeam fields first (draft pick),
      // actions[][] fallback (blind pick where myTeam stays at 0).
      const fromTeam =
        ally.championId > 0
          ? String(ally.championId)
          : ally.championPickIntent && ally.championPickIntent > 0
            ? String(ally.championPickIntent)
            : null;
      const fromActions = pickFromActions(ally.cellId);
      const champKey = fromTeam ?? fromActions.locked ?? fromActions.intent;
      store.setPick("ally", idx, champKey);
      const role = lcuPositionToRole(ally.assignedPosition);
      if (role) store.setRoleForSlot("ally", idx, role);
    } else {
      store.setPick("ally", idx, null);
    }

    const enemy = theirTeam[idx];
    if (enemy) {
      // Use intent as a fallback so we see hover picks BEFORE enemy lockin.
      // Critical in blind pick / ARAM where Riot exposes pickIntent for the
      // enemy team during the early seconds. Without this the engine waits
      // for lock-in and the user loses precious counter-pick time.
      const fromTeam =
        enemy.championId > 0
          ? String(enemy.championId)
          : enemy.championPickIntent && enemy.championPickIntent > 0
            ? String(enemy.championPickIntent)
            : null;
      const fromActions = pickFromActions(enemy.cellId);
      const champKey = fromTeam ?? fromActions.locked ?? fromActions.intent;
      store.setPick("enemy", idx, champKey);
    } else {
      store.setPick("enemy", idx, null);
    }
  }
  store.setEnemySummonerIds(theirTeam.map((p) => p.summonerId ?? 0));

  // ARAM has no bans — `s.bans` is undefined for Howling Abyss sessions.
  // The forEach() calls used to crash here, silently halting any code that
  // ran AFTER bans handling. Guard both the object and each array.
  //
  // CRITICAL: `bans.myTeamBans` / `bans.theirTeamBans` only populate AFTER
  // the ban phase ends. During hover (which is when the user expects to
  // SEE bans in our UI to inform their own pick), those arrays are empty.
  // Riot delivers live ban hovers via `actions[][]` instead — scan those
  // first; the final `bans.*` arrays act as backup/confirmation.
  const myTeamBans = Array.isArray(s.bans?.myTeamBans) ? s.bans!.myTeamBans : [];
  const theirTeamBans = Array.isArray(s.bans?.theirTeamBans) ? s.bans!.theirTeamBans : [];

  // Diagnostic — log a single line per session frame so we have an
  // audit trail when "nothing tracked". Compact form: shows phase +
  // bans + picks count so we can grep the log and confirm data flow.
  // Only emit when something changed since last frame to avoid log spam.
  diagnosticLog(s);

  // Derive live bans from actions[][]. Track per-side index so we fill
  // slots 0..4 in the order Riot reports them. We accept hovered bans
  // (`championId > 0` even when `completed=false`) so the UI updates
  // in real time as enemies and allies hover-lock their bans.
  //
  // Same pass also drives TTS turn-detection + enemy-ban announcements
  // since we're already walking every action. Avoids a second iteration.
  const liveAllyBans: number[] = [];
  const liveEnemyBans: number[] = [];
  let myTurnActiveBan: number | null = null;   // action.id when my unfinished ban turn is up
  let myTurnActivePick: number | null = null;  // action.id when my unfinished pick turn is up
  const enemyCompletedBansThisFrame = new Set<number>();
  if (Array.isArray(s.actions)) {
    for (const group of s.actions) {
      if (!Array.isArray(group)) continue;
      for (const act of group) {
        if (!act) continue;
        // Bans accumulation (UI)
        if (act.type === "ban" && act.championId > 0) {
          if (act.isAllyAction) liveAllyBans.push(act.championId);
          else liveEnemyBans.push(act.championId);
          // Track completed enemy bans so we can announce once each.
          if (!act.isAllyAction && act.completed) {
            enemyCompletedBansThisFrame.add(act.championId);
          }
        }
        // Turn detection — `actorCellId === myCell && !completed` means
        // it's MY turn right now. Distinguish ban vs pick to tailor speech.
        if (act.actorCellId === myCell && !act.completed) {
          if (act.type === "ban") myTurnActiveBan = act.id;
          else if (act.type === "pick") myTurnActivePick = act.id;
        }
      }
    }
  }

  // Speak my-turn alerts once per action.id (the LCU stably numbers actions
  // 0..N for the whole draft, so action.id is a perfect dedup key). Also
  // fire a native OS notification so the user gets popped to attention
  // even when Draftboard is alt-tabbed under LoL fullscreen.
  if (myTurnActiveBan !== null && myTurnActiveBan !== lastSpokenMyBanTurnId) {
    lastSpokenMyBanTurnId = myTurnActiveBan;
    voiceCoach.speak("Tu turno de banear");
    nativeNotify({
      title: "Tu turno de banear",
      body: "Abre Draftboard para ver sugerencias.",
      tag: "draft-turn",
      durationMs: 5000,
    });
  }
  if (myTurnActivePick !== null && myTurnActivePick !== lastSpokenMyPickTurnId) {
    lastSpokenMyPickTurnId = myTurnActivePick;
    voiceCoach.speak("Tu turno de pickear");
    nativeNotify({
      title: "Tu turno de pickear",
      body: "Abre Draftboard para ver el pick óptimo.",
      tag: "draft-turn",
      durationMs: 5000,
    });
  }

  // Enemy-ban announcements skipped: 10 bans per draft = audio spam.
  // Dedup set kept for future use if we add a "ban your top pick" hook
  // (would speak only when the banned champ matches our recommendation).
  for (const banId of enemyCompletedBansThisFrame) {
    lastSpokenEnemyBanIds.add(banId);
  }

  // Merge: prefer the final committed `bans.*` arrays if they have data
  // (end of phase), otherwise use live-derived from actions. Either way
  // we push to the store so the bans row in the UI reflects current state.
  const finalAlly = myTeamBans.length > 0 ? myTeamBans : liveAllyBans;
  const finalEnemy = theirTeamBans.length > 0 ? theirTeamBans : liveEnemyBans;

  // ── Preservation guard for post-pick / surrender-vote frames ──
  // After the ban phase ends, LCU sometimes pushes frames where:
  //   - s.bans is undefined entirely (mid-transition), OR
  //   - s.actions[] no longer contains ban entries (already committed)
  // If we naively iterate 5 slots and setBan(null), the UI nukes bans
  // that ARE still real (visible in client). Skip the clear loop when
  // BOTH sources came back empty AND s.bans wasn't explicitly sent —
  // that signals a transition frame, not a real "bans were unset".
  const bansAreExplicit =
    s.bans !== undefined &&
    s.bans !== null &&
    (Array.isArray(s.bans.myTeamBans) || Array.isArray(s.bans.theirTeamBans));
  const haveLiveBans = liveAllyBans.length > 0 || liveEnemyBans.length > 0;
  if (!bansAreExplicit && !haveLiveBans) {
    // Transition frame — preserve existing store bans rather than nuking.
    return;
  }

  // CRITICAL: iterate FIXED 5 ban slots (not forEach over the live array)
  // so we explicitly clear slots that drop out — e.g. when a hover is
  // canceled mid-phase, or when entering a brand new champ select with
  // no bans yet. Previous code only set populated entries; stale slots
  // from a prior frame persisted in the store and the UI showed
  // phantom bans that no longer existed in the actual LCU session.
  for (let idx = 0; idx < 5; idx++) {
    const allyId = finalAlly[idx];
    store.setBan("ally", idx, allyId && allyId > 0 ? String(allyId) : null);
    const enemyId = finalEnemy[idx];
    store.setBan("enemy", idx, enemyId && enemyId > 0 ? String(enemyId) : null);
  }
}
