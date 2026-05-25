import { useEffect, useState } from "react";
import {
  lcuPositionToRole,
  subscribeChampSelect,
  subscribeStatus,
  type LcuChampSelectSession,
  type LcuStatus,
} from "../services/lcuService";
import { useDraftStore } from "./draftStore";
import { trackEvent } from "../services/breadcrumbs";

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
    return () => {
      unsubStatus.then((fn) => fn());
      unsubData.then((fn) => fn());
    };
  }, []);

  return { status, session };
}

let lastLockedChamp: string | null = null;
let lastLoggedAramShape = "";

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
  if (!s || typeof s !== "object") return;

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
  if (myPlayer) {
    const role = lcuPositionToRole(myPlayer.assignedPosition);
    if (role) store.setMyRole(role);
    const locked =
      myPlayer.championId > 0 ? String(myPlayer.championId) : null;
    const intent =
      myPlayer.championPickIntent && myPlayer.championPickIntent > 0
        ? String(myPlayer.championPickIntent)
        : null;
    store.setLocalSelection(myCell, intent, locked);

    // Fire lock event the first time we see this champion locked.
    if (locked && locked !== lastLockedChamp) {
      lastLockedChamp = locked;
      trackEvent("draft.pick", "Local champion locked", { championKey: locked });
      window.dispatchEvent(
        new CustomEvent("draft:champion-locked", { detail: { championKey: locked } })
      );
    }
    if (!locked) lastLockedChamp = null;
  }

  if (s.timer) {
    store.setPhase(s.timer.phase, Math.max(0, Math.round(s.timer.adjustedTimeLeftInPhase / 1000)));
  }

  myTeam.forEach((p, idx) => {
    const champKey =
      p.championId > 0
        ? String(p.championId)
        : p.championPickIntent && p.championPickIntent > 0
          ? String(p.championPickIntent)
          : null;
    store.setPick("ally", idx, champKey);
    const role = lcuPositionToRole(p.assignedPosition);
    if (role) store.setRoleForSlot("ally", idx, role);
  });

  theirTeam.forEach((p, idx) => {
    // Use intent as a fallback so we see hover picks BEFORE enemy lockin.
    // Critical in blind pick / ARAM where Riot exposes pickIntent for the
    // enemy team during the early seconds. Without this the engine waits
    // for lock-in and the user loses precious counter-pick time.
    const champKey =
      p.championId > 0
        ? String(p.championId)
        : p.championPickIntent && p.championPickIntent > 0
          ? String(p.championPickIntent)
          : null;
    store.setPick("enemy", idx, champKey);
  });
  store.setEnemySummonerIds(theirTeam.map((p) => p.summonerId ?? 0));

  // ARAM has no bans — `s.bans` is undefined for Howling Abyss sessions.
  // The forEach() calls used to crash here, silently halting any code that
  // ran AFTER bans handling. Guard both the object and each array.
  const myTeamBans = Array.isArray(s.bans?.myTeamBans) ? s.bans!.myTeamBans : [];
  const theirTeamBans = Array.isArray(s.bans?.theirTeamBans) ? s.bans!.theirTeamBans : [];
  myTeamBans.forEach((id, idx) => {
    if (id > 0) store.setBan("ally", idx, String(id));
  });
  theirTeamBans.forEach((id, idx) => {
    if (id > 0) store.setBan("enemy", idx, String(id));
  });
}
