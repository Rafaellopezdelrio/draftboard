// Voice coach using Web Speech API (browser native, free, offline).
// Speaks key events during champ select / draft.

export type VoiceLang = "es" | "en";

/** Single source of truth for the speechSynthesis-available check.
 *  jsdom, SSR, and stripped-down webviews lack the Web Speech API;
 *  every call site has to guard or unit tests + non-browser callers
 *  blow up with ReferenceError. */
function hasSpeech(): boolean {
  return typeof window !== "undefined" && typeof speechSynthesis !== "undefined";
}

const KDA_WORDS: Record<VoiceLang, [string, string][]> = {
  es: [["asesinato", "asesinatos"], ["muerte", "muertes"], ["asistencia", "asistencias"]],
  en: [["kill", "kills"], ["death", "deaths"], ["assist", "assists"]],
};

/**
 * Speech engines read a K/D/A triple like "11/7/15" as a date ("11 de julio
 * de 2015"). Spell it out as a score in the voice's language instead.
 */
export function speakable(message: string, lang: VoiceLang): string {
  return message.replace(/\b(\d{1,2})\/(\d{1,2})\/(\d{1,2})\b/g, (...m: string[]) => {
    const parts = KDA_WORDS[lang].map(([one, many], i) => {
      const n = Number(m[i + 1]);
      return `${n} ${n === 1 ? one : many}`;
    });
    const and = lang === "es" ? "y" : "and";
    return `${parts[0]}, ${parts[1]} ${and} ${parts[2]}`;
  });
}

class VoiceCoach {
  private enabled = false;
  private lang: VoiceLang = "es";
  private voice: SpeechSynthesisVoice | null = null;
  private spoken = new Set<string>(); // dedupe per session

  setEnabled(v: boolean) {
    this.enabled = v;
    if (!v && hasSpeech()) speechSynthesis.cancel();
  }

  setLanguage(l: VoiceLang) {
    this.lang = l;
    this.pickVoice();
  }

  init() {
    if (!hasSpeech()) return;
    this.pickVoice();
    speechSynthesis.addEventListener?.("voiceschanged", () => this.pickVoice());
  }

  private pickVoice() {
    if (!hasSpeech()) return;
    const wanted = this.lang === "es" ? ["es-ES", "es-MX", "es"] : ["en-US", "en-GB", "en"];
    const all = speechSynthesis.getVoices();
    for (const w of wanted) {
      const v = all.find((x) => x.lang.startsWith(w));
      if (v) {
        this.voice = v;
        return;
      }
    }
    this.voice = all[0] ?? null;
  }

  speak(message: string, dedupKey?: string) {
    if (!this.enabled || !hasSpeech()) return;
    if (dedupKey) {
      if (this.spoken.has(dedupKey)) return;
      this.spoken.add(dedupKey);
    }
    const u = new SpeechSynthesisUtterance(speakable(message, this.lang));
    if (this.voice) u.voice = this.voice;
    u.lang = this.voice?.lang ?? (this.lang === "es" ? "es-ES" : "en-US");
    u.rate = 1.0;
    u.pitch = 1.0;
    u.volume = 0.9;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }

  resetSession() {
    this.spoken.clear();
    if (hasSpeech()) speechSynthesis.cancel();
  }
}

export const voiceCoach = new VoiceCoach();
