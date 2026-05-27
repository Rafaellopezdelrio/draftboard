// Voice coach lifecycle wiring. Runs once at app mount to bind the
// browser SpeechSynthesis API, then keeps the coach in sync with
// pref toggles (enabled flag + locale). Also kicks off the lazy
// import of native-notify so the first "Tu turno de pickear" event
// fires its OS-level popup without a cold-start delay.
//
// Extracted from App.tsx as part of the monolith-split effort.

import { useEffect } from "react";
import { usePrefsStore } from "../state/prefsStore";
import { voiceCoach } from "../services/voiceCoach";

/**
 * Initialise the voice coach + native notification permission once,
 * then sync enabled/language with prefs on every change.
 */
export function useVoiceCoach(): void {
  const enabled = usePrefsStore((s) => s.prefs.voiceCoachEnabled);
  const language = usePrefsStore((s) => s.prefs.aiCoachLanguage);

  // One-shot init at mount.
  useEffect(() => {
    voiceCoach.init();
    // Lazy-import keeps notification code out of SSR/test paths
    // where Notification API is unavailable.
    import("../services/nativeNotify").then(({ ensureNotificationPermission }) => {
      ensureNotificationPermission();
    });
  }, []);

  // Sync enable/language on every pref change.
  useEffect(() => {
    voiceCoach.setEnabled(enabled);
    voiceCoach.setLanguage(language);
  }, [enabled, language]);
}
