// Voice picker for the voice coach: "automatic" (the most natural voice the
// PC has) or a specific one, with a button to hear it. Windows lists its
// voices late, so the list is read again when they arrive.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePrefsStore } from "../../state/prefsStore";
import { voiceCoach } from "../../services/voiceCoach";

export function VoicePickerField() {
  const { t } = useTranslation();
  const voiceName = usePrefsStore((s) => s.prefs.voiceName);
  const set = usePrefsStore((s) => s.set);
  const [voices, setVoices] = useState(() => voiceCoach.voices());

  useEffect(() => {
    if (typeof speechSynthesis === "undefined") return;
    const refresh = () => setVoices(voiceCoach.voices());
    refresh();
    speechSynthesis.addEventListener?.("voiceschanged", refresh);
    return () => speechSynthesis.removeEventListener?.("voiceschanged", refresh);
  }, []);

  if (voices.length === 0) return null;

  const choose = async (name: string) => {
    await set("voiceName", name);
    voiceCoach.setPreferredVoice(name);
    voiceCoach.preview(t("prefs.voice.sample"));
  };

  return (
    <div className="mt-2 space-y-1">
      <label className="text-xs text-white/60" htmlFor="voice-picker">
        {t("prefs.voice.label")}
      </label>
      <div className="flex gap-2">
        <select
          id="voice-picker"
          value={voices.some((v) => v.name === voiceName) ? voiceName : ""}
          onChange={(e) => void choose(e.target.value)}
          className="flex-1 bg-bg px-3 py-2 rounded border border-border-subtle text-white text-sm"
        >
          <option value="">{t("prefs.voice.auto", { name: voices[0].name })}</option>
          {voices.map((v) => (
            <option key={v.name} value={v.name}>
              {v.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => voiceCoach.preview(t("prefs.voice.sample"))}
          className="px-3 py-2 rounded border border-border-strong text-white/80 hover:text-white text-sm"
        >
          {t("prefs.voice.try")}
        </button>
      </div>
    </div>
  );
}
