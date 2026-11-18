// Voice coach using Web Speech API (browser native, free, offline), or a
// natural neural voice (neuralVoice.ts) when the player picked one.
// Speaks key events during champ select / draft.

import { neuralVoice, speakNeural, stopNeural } from "./neuralVoice";

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

const LOCALES: Record<VoiceLang, string[]> = { es: ["es-ES", "es-MX", "es-US", "es"], en: ["en-US", "en-GB", "en"] };

/** How human a voice sounds. Windows' old desktop voices (Helena, Pablo…)
 * sound robotic; the "Natural"/online neural ones (Elvira, Álvaro…) and
 * Google's sound close to a person. */
function quality(v: SpeechSynthesisVoice): number {
  const n = v.name.toLowerCase();
  if (n.includes("natural") || n.includes("neural")) return 3;
  if (n.includes("online") || n.includes("google")) return 2;
  return v.localService === false ? 1 : 0;
}

/** Voices for the language, best sounding first (then the closest accent:
 * Spain before Mexico for Spanish). */
export function rankVoices(all: SpeechSynthesisVoice[], lang: VoiceLang): SpeechSynthesisVoice[] {
  const locales = LOCALES[lang];
  const accent = (v: SpeechSynthesisVoice) => {
    const i = locales.findIndex((l) => v.lang.startsWith(l));
    return i < 0 ? locales.length : i;
  };
  return all
    .filter((v) => v.lang.toLowerCase().startsWith(lang))
    .sort((a, b) => quality(b) - quality(a) || accent(a) - accent(b) || a.name.localeCompare(b.name));
}

class VoiceCoach {
  private enabled = false;
  private lang: VoiceLang = "es";
  private voice: SpeechSynthesisVoice | null = null;
  /** Voice name the player chose; empty = the best one available. */
  private preferred = "";
  private spoken = new Set<string>(); // dedupe per session

  setEnabled(v: boolean) {
    this.enabled = v;
    if (!v) this.stop();
  }

  setLanguage(l: VoiceLang) {
    this.lang = l;
    this.pickVoice();
  }

  setPreferredVoice(name: string) {
    this.preferred = name;
    this.pickVoice();
  }

  /** Voices the player can choose from, best first. */
  voices(): SpeechSynthesisVoice[] {
    return hasSpeech() ? rankVoices(speechSynthesis.getVoices(), this.lang) : [];
  }

  init() {
    if (!hasSpeech()) return;
    this.pickVoice();
    speechSynthesis.addEventListener?.("voiceschanged", () => this.pickVoice());
  }

  private pickVoice() {
    if (!hasSpeech()) return;
    const all = speechSynthesis.getVoices();
    const ranked = rankVoices(all, this.lang);
    this.voice = ranked.find((v) => v.name === this.preferred) ?? ranked[0] ?? all[0] ?? null;
  }

  speak(message: string, dedupKey?: string) {
    if (!this.enabled) return;
    if (dedupKey) {
      if (this.spoken.has(dedupKey)) return;
      this.spoken.add(dedupKey);
    }
    this.say(message);
  }

  /** Says a sample line now, even with the voice coach off (Preferences). */
  preview(message: string) {
    this.say(message);
  }

  private stop() {
    stopNeural();
    if (hasSpeech()) speechSynthesis.cancel();
  }

  private say(message: string) {
    const neural = neuralVoice(this.preferred);
    if (neural && neural.lang === this.lang) {
      const text = speakable(message, this.lang);
      if (hasSpeech()) speechSynthesis.cancel();
      // If the neural voice can't load (offline on first use…), the PC voice speaks instead.
      speakNeural(neural.id, text, 0.9).catch(() => this.saySystem(message));
      return;
    }
    this.saySystem(message);
  }

  private saySystem(message: string) {
    if (!hasSpeech()) return;
    const u = new SpeechSynthesisUtterance(speakable(message, this.lang));
    if (this.voice) u.voice = this.voice;
    u.lang = this.voice?.lang ?? (this.lang === "es" ? "es-ES" : "en-US");
    u.rate = 1.0;
    u.pitch = 1.0;
    u.volume = 0.9;
    this.stop();
    speechSynthesis.speak(u);
  }

  resetSession() {
    this.spoken.clear();
    this.stop();
  }
}

export const voiceCoach = new VoiceCoach();
