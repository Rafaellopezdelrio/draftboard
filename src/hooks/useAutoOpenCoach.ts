// Auto-open the post-game CoachView when the LCU gameflow transitions
// OUT of an in-progress match. Also fires the "Partida empezada" voice
// cue exactly once per game when the phase first hits InProgress.
//
// Extracted from App.tsx as part of the monolith-split effort. Keeps
// the shell file focused on layout instead of multi-phase state
// machines.

import { useEffect, useRef } from "react";
import type { GamePhase } from "../state/inGameDetection";
import { voiceCoach } from "../services/voiceCoach";

const POST_GAME_DELAY_MS = 6000; // wait for Riot stats ingestion

interface Args {
  /** Current LCU gameflow phase. */
  phase: GamePhase | null;
  /** User pref — auto-open CoachView after each match. */
  coachAfterMatch: boolean;
  /** Current open state of CoachView (avoid re-opening if already up). */
  showCoach: boolean;
  /** Setter to open CoachView. */
  setShowCoach: (open: boolean) => void;
}

/**
 * Post-game auto-coach + "Partida empezada" voice cue. Single source of
 * truth for the InProgress → end-of-game state machine — previously
 * inline in App.tsx with two interleaving refs.
 *
 * Flow:
 *   1. Phase enters {InProgress, PreEndOfGame, EndOfGame,
 *      WaitingForStats}: mark "we were in a match", fire the start cue
 *      once per game when first hitting InProgress.
 *   2. Phase leaves the in-match set: if we WERE in a match + pref is
 *      on + coach not already open → schedule the open + voice cue
 *      6s out (lets Riot's stats ingestion + our match sync finish).
 *   3. Cleanup the setTimeout if the effect re-fires before it lands.
 */
export function useAutoOpenCoach({
  phase,
  coachAfterMatch,
  showCoach,
  setShowCoach,
}: Args): void {
  const wasInMatch = useRef(false);
  const announcedGameStart = useRef(false);

  useEffect(() => {
    const inMatch =
      phase === "InProgress" ||
      phase === "PreEndOfGame" ||
      phase === "EndOfGame" ||
      phase === "WaitingForStats";

    if (inMatch) {
      wasInMatch.current = true;
      if (phase === "InProgress" && !announcedGameStart.current) {
        announcedGameStart.current = true;
        voiceCoach.speak("Partida empezada");
      }
      return;
    }

    // Out of match — reset start-announce so the next game speaks.
    announcedGameStart.current = false;

    if (wasInMatch.current && coachAfterMatch && !showCoach) {
      const t = setTimeout(() => {
        setShowCoach(true);
        voiceCoach.speak("Análisis post-partida listo");
      }, POST_GAME_DELAY_MS);
      wasInMatch.current = false;
      return () => clearTimeout(t);
    }
    wasInMatch.current = false;
  }, [phase, coachAfterMatch, showCoach, setShowCoach]);
}
