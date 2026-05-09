import { useEffect, useState } from "react";
import {
  lcuPositionToRole,
  subscribeChampSelect,
  subscribeStatus,
  type LcuChampSelectSession,
  type LcuStatus,
} from "../services/lcuService";
import { useDraftStore } from "./draftStore";

export function useLcuSync() {
  const [status, setStatus] = useState<LcuStatus>({ connected: false });

  useEffect(() => {
    const unsubStatus = subscribeStatus(setStatus);
    const unsubData = subscribeChampSelect((s) => applySession(s));
    return () => {
      unsubStatus.then((fn) => fn());
      unsubData.then((fn) => fn());
    };
  }, []);

  return status;
}

let lastLockedChamp: string | null = null;

function applySession(s: LcuChampSelectSession) {
  const store = useDraftStore.getState();
  const myCell = s.localPlayerCellId;
  const myPlayer = [...s.myTeam, ...s.theirTeam].find(
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
      window.dispatchEvent(
        new CustomEvent("draft:champion-locked", { detail: { championKey: locked } })
      );
    }
    if (!locked) lastLockedChamp = null;
  }

  if (s.timer) {
    store.setPhase(s.timer.phase, Math.max(0, Math.round(s.timer.adjustedTimeLeftInPhase / 1000)));
  }

  s.myTeam.forEach((p, idx) => {
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

  s.theirTeam.forEach((p, idx) => {
    const champKey = p.championId > 0 ? String(p.championId) : null;
    store.setPick("enemy", idx, champKey);
  });
  store.setEnemySummonerIds(s.theirTeam.map((p) => p.summonerId ?? 0));

  s.bans.myTeamBans.forEach((id, idx) => {
    if (id > 0) store.setBan("ally", idx, String(id));
  });
  s.bans.theirTeamBans.forEach((id, idx) => {
    if (id > 0) store.setBan("enemy", idx, String(id));
  });
}
