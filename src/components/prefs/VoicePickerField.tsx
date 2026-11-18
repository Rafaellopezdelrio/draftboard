// Voice picker for the voice coach: "automatic" (the most natural voice the
// PC has), a natural neural voice (downloaded once) or a specific PC voice,
// with a button to hear it. Windows lists its voices late, so the list is
// read again when they arrive.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePrefsStore } from "../../state/prefsStore";
import { voiceCoach } from "../../services/voiceCoach";
import { NEURAL_PREFIX, NEURAL_VOICES, onDownloadProgress } from "../../services/neuralVoice";

export function VoicePickerField() {
  const { t } = useTranslation();
  const voiceName = usePrefsStore((s) => s.prefs.voiceName);
  const lang = usePrefsStore((s) => s.prefs.aiCoachLanguage);
  const set = usePrefsStore((s) => s.set);
  const [voices, setVoices] = useState(() => voiceCoach.voices());
  const [download, setDownload] = useState<number | null>(null);

  useEffect(() => {
    if (typeof speechSynthesis === "undefined") return;
    const refresh = () => setVoices(voiceCoach.voices());
    refresh();
    speechSynthesis.addEventListener?.("voiceschanged", refresh);
    return () => speechSynthesis.removeEventListener?.("voiceschanged", refresh);
  }, [lang]);

  useEffect(() => onDownloadProgress((pct) => setDownload(pct < 100 ? pct : null)), []);

  const natural = NEURAL_VOICES.filter((v) => v.lang === lang);
  if (voices.length === 0 && natural.length === 0) return null;

  const options = [...natural.map((v) => NEURAL_PREFIX + v.id), ...voices.map((v) => v.name)];

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
          value={options.includes(voiceName) ? voiceName : ""}
          onChange={(e) => void choose(e.target.value)}
          className="flex-1 bg-bg px-3 py-2 rounded border border-border-subtle text-white text-sm"
        >
          <option value="">{t("prefs.voice.auto", { name: voices[0]?.name ?? "—" })}</option>
          {natural.length > 0 && (
            <optgroup label={t("prefs.voice.natural")}>
              {natural.map((v) => (
                <option key={v.id} value={NEURAL_PREFIX + v.id}>
                  {v.label}
                </option>
              ))}
            </optgroup>
          )}
          {voices.length > 0 && (
            <optgroup label={t("prefs.voice.system")}>
              {voices.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <button
          type="button"
          onClick={() => voiceCoach.preview(t("prefs.voice.sample"))}
          className="px-3 py-2 rounded border border-border-strong text-white/80 hover:text-white text-sm"
        >
          {t("prefs.voice.try")}
        </button>
      </div>
      {natural.length > 0 && <p className="text-[11px] text-white/40">{t("prefs.voice.credits")}</p>}
      {download !== null && (
        <p className="text-xs text-white/60" role="status">
          {t("prefs.voice.downloading", { pct: download })}
        </p>
      )}
    </div>
  );
}
