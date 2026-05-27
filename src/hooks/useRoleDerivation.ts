// Two-step role derivation that runs whenever the picked/hovered
// champion or current role changes:
//
//   1. If myRole is null (Practice Tool / blind pick with no assigned
//      position) AND we have a hovered/locked champion → derive role
//      from the champion's primary role in CHAMPION_ROLES.
//
//   2. If myRole IS set but the picked champion CAN'T play that role
//      (e.g. queue assigned UTILITY but user picked Kha'Zix who's
//      JUNGLE-only) → override to the champion's primary role.
//      Without this, BuildPanel + spell coherence + matchup grid all
//      use the wrong role, producing nonsense ("Soporte pick → Ignite"
//      for a jungler) and empty build data because op.gg has no
//      support stats for Kha'Zix.
//
// We don't auto-override for borderline cases like Vayne TOP — those
// are listed in CHAMPION_ROLES with both BOTTOM and TOP, so the role
// check passes. Override only fires when the role is truly impossible.

import { useEffect } from "react";
import type { ChampionDb, Role } from "../types/champion";
import { CHAMPION_ROLES } from "../data/championRoles";

interface Args {
  db: ChampionDb | null;
  myChampionLocked: string | null;
  myChampionIntent: string | null;
  myRole: Role | null;
  setMyRole: (role: Role | null) => void;
}

export function useRoleDerivation({
  db,
  myChampionLocked,
  myChampionIntent,
  myRole,
  setMyRole,
}: Args): void {
  useEffect(() => {
    if (!db) return;
    const championKey = myChampionLocked ?? myChampionIntent;
    if (!championKey) return;
    const champ = db.champions[championKey];
    if (!champ) return;
    const allowedRoles = CHAMPION_ROLES[champ.id];
    if (!allowedRoles || allowedRoles.length === 0) return;

    if (!myRole) {
      setMyRole(allowedRoles[0]);
      return;
    }
    if (!allowedRoles.includes(myRole)) {
      // Hard role mismatch — switch to the champion's primary role.
      setMyRole(allowedRoles[0]);
    }
  }, [myRole, myChampionLocked, myChampionIntent, db, setMyRole]);
}
