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

export function useLcuSync() {
  const [status, setStatus] = useState<LcuStatus>({ connected: false });
  // Track the latest champ-select session so consumers (LobbyScoutPanel,
  // etc.) can react to roster changes. Cleared when we leave the lobby.
  const [session, setSession] = useState<LcuChampSelectSession | null>(null);

  useEffect(() => {
    const unsubStatus = subscribeStatus(setStatus);
    const unsubData = subscribeChampSelect((s) => {
      applySession(s);
      setSession(s);
    });
    // Self-seed the current champ-select session on mount. The WS only
    // fires on CHANGE and the Rust bootstrap GET emits once at watcher
    // connect — both can fire BEFORE this listener mounts (cold boot while
    // already in champ select, or an HMR remount), leaving the board empty
    // until the next pick/ban. Pull it directly so the board fills now.
    void fetchCurrentChampSelect().then((s) => {
      if (s) {
        applySession(s);
        setSession(s);
      }
    });
    return () => {
      unsubStatus.then((fn) => fn());
      unsubData.then((fn) => fn());
    };
  }, []);

  return { status, session };
}

let lastLockedChamp: string | null = null;
let lastLoggedAramShape = "";
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
    // Null session = left champ select (dodge, queue exit, game end).
    // Reset TTS dedup vars so the NEXT champ select session announces
    // its turns from scratch. Without this, action.id values from the
    // previous session could match new ones and suppress legitimate
    // turn announcements.
    lastSpokenMyBanTurnId = null;
    lastSpokenMyPickTurnId = null;
    lastSpokenEnemyBanIds = new Set();
    lastLockedChamp = null;
    lastBlindWarnedCell = null;
    voiceCoach.resetSession();
    // Clear the board so a dodge / queue-exit / game-start doesn't leave
    // the previous draft's picks, bans, local selection, enemies, and
    // phase frozen on screen until the next champ select overwrites them.
    // All setters are idempotent, so repeated Delete frames are no-ops.
    // myRole is intentionally preserved — the user may have set it manually
    // for out-of-champ-select planning.
    const store = useDraftStore.getState();
    store.reset();
    store.setLocalSelection(null, null, null);
    store.setEnemySummonerIds([]);
    store.setPhase(null, null);
    return;
  }

  const myTeam = Array.isArray(s.myTeam) ? s.myTeam : [];
  const theirTeam = Array.isArray(s.theirTeam) ? s.theirTeam : [];

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
    if (locked === null && intent === null && !lastBlindWarnedCell) {
      lastBlindWarnedCell = myCell;
      // eslint-disable-next-line no-console
      console.warn(
        `[lcuSync] my cell ${myCell} has no champ in myTeam OR actions — Riot fields:`,
        Object.keys(myPlayer ?? {}).join(",")
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
