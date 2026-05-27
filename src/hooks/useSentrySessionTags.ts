// Keeps Sentry's global tag set in sync with the user's current
// session context (locale, patch, LCU connected, in-game). Every
// event (errors, breadcrumbs, performance) carries these tags — so
// the Sentry dashboard can filter "errors on patch 14.10 KR users in
// champ select" without per-event boilerplate.
//
// Extracted from App.tsx: a one-effect hook keeps the call site to a
// single line.

import { useEffect } from "react";
import { setSentryTags } from "../services/sentry";
import type { GamePhase } from "../state/inGameDetection";

interface Args {
  uiLocale: string;
  patch: string | null;
  lcuConnected: boolean;
  gamePhase: GamePhase | null;
}

export function useSentrySessionTags({
  uiLocale,
  patch,
  lcuConnected,
  gamePhase,
}: Args): void {
  useEffect(() => {
    setSentryTags({
      locale: uiLocale,
      patch,
      lcuConnected,
      inGame: gamePhase === "InProgress",
    });
  }, [uiLocale, patch, lcuConnected, gamePhase]);
}
