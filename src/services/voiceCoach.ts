// Voice coach using Web Speech API (browser native, free, offline).
// Speaks key events during champ select / draft.

export type VoiceLang = "es" | "en";

class VoiceCoach {
  private enabled = false;
  private lang: VoiceLang = "es";
  private voice: SpeechSynthesisVoice | null = null;
  private spoken = new Set<string>(); // dedupe per session

  setEnabled(v: boolean) {
    this.enabled = v;
    if (!v) speechSynthesis.cancel();
  }

  setLanguage(l: VoiceLang) {
    this.lang = l;
    this.pickVoice();
  }

  init() {
    if (typeof window === "undefined") return;
    this.pickVoice();
    speechSynthesis.addEventListener?.("voiceschanged", () => this.pickVoice());
  }

  private pickVoice() {
    if (typeof window === "undefined") return;
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
    if (!this.enabled || typeof window === "undefined") return;
    if (dedupKey) {
      if (this.spoken.has(dedupKey)) return;
      this.spoken.add(dedupKey);
    }
    const u = new SpeechSynthesisUtterance(message);
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
    speechSynthesis.cancel();
  }
}

export const voiceCoach = new VoiceCoach();
