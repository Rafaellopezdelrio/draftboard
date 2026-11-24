// Natural (neural) voices: Piper models run inside the app with
// onnxruntime-web. The voice model (~63 MB) and the phonemizer (~18 MB) are
// downloaded the first time a voice is used; the model is kept in the
// browser's private storage (OPFS) after that.
//
// Only voices whose training data allows commercial use are listed
// (CC0 / CC BY / public domain).

import type { VoiceLang } from "./voiceCoach";
// The engine ships inside the app (Vite emits this file for the ort bundle anyway).
import ortWasm from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";

export interface NeuralVoice {
  id: string;
  lang: VoiceLang;
  label: string;
}

export const NEURAL_VOICES: NeuralVoice[] = [
  { id: "es_ES-davefx-medium", lang: "es", label: "Dave (España)" },
  { id: "es_ES-sharvard-medium", lang: "es", label: "Sharvard (España)" },
  { id: "en_US-joe-medium", lang: "en", label: "Joe (US)" },
  { id: "en_GB-cori-medium", lang: "en", label: "Cori (UK)" },
];

/** The "automatic" voice of each language (chosen by ear, 2026-11-18). */
export const DEFAULT_NEURAL: Record<VoiceLang, string> = {
  es: "es_ES-davefx-medium",
  en: "en_US-joe-medium",
};

/** Prefix that marks a neural voice in prefs.voiceName. */
export const NEURAL_PREFIX = "piper:";

export function neuralVoice(name: string): NeuralVoice | null {
  if (!name.startsWith(NEURAL_PREFIX)) return null;
  const id = name.slice(NEURAL_PREFIX.length);
  return NEURAL_VOICES.find((v) => v.id === id) ?? null;
}

const PHONEMIZER = "https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize";

type Session = { predict(text: string): Promise<Blob> };
export type DownloadProgress = (pct: number) => void;

let session: { id: string; ready: Promise<Session> } | null = null;
let loadedId: string | null = null;
let playing: HTMLAudioElement | null = null;
const listeners = new Set<DownloadProgress>();

/** Download progress (0-100) of the model being loaded. */
export function onDownloadProgress(cb: DownloadProgress): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function load(id: string): Promise<Session> {
  if (session?.id === id) return session.ready;
  const ready = import("@mintplex-labs/piper-tts-web").then(({ TtsSession }) => {
    // The package keeps a single session and never reloads the model when
    // the voice changes, so a new voice needs a fresh session.
    TtsSession._instance = null;
    return TtsSession.create({
      voiceId: id,
      progress: (p) => {
        if (!p.url.endsWith(".onnx") || !p.total) return;
        const pct = Math.round((p.loaded / p.total) * 100);
        listeners.forEach((cb) => cb(pct));
      },
      wasmPaths: {
        // onnxruntime-web accepts { wasm } here; the package types it as a string.
        onnxWasm: { wasm: ortWasm } as unknown as string,
        piperData: `${PHONEMIZER}.data`,
        piperWasm: `${PHONEMIZER}.wasm`,
      },
    });
  });
  session = { id, ready };
  loadedId = null;
  ready.then(
    () => {
      if (session?.ready === ready) loadedId = id;
    },
    () => {
      if (session?.ready === ready) session = null;
    }
  );
  return ready;
}

/** True once the voice is downloaded and loaded, so it can speak at once. */
export function neuralReady(id: string): boolean {
  return loadedId === id;
}

/** Starts downloading/loading a voice in the background. */
export function warmNeural(id: string) {
  load(id).catch(() => {
    // The PC voice keeps speaking; the next warm-up tries again.
  });
}

export function stopNeural() {
  playing?.pause();
  playing = null;
}

/** WAV audio of `text` said by a neural voice. */
export async function synthesize(id: string, text: string): Promise<Blob> {
  return (await load(id)).predict(text);
}

/** Says `text` with a neural voice. Rejects if the voice can't load. */
export async function speakNeural(id: string, text: string, volume: number): Promise<void> {
  const wav = await synthesize(id, text);
  stopNeural();
  const url = URL.createObjectURL(wav);
  const audio = new Audio(url);
  audio.volume = volume;
  audio.onended = () => URL.revokeObjectURL(url);
  playing = audio;
  try {
    await audio.play();
  } catch (e) {
    // A newer line paused this one before it started (two alerts at once):
    // that is not a failed voice, and the PC voice must not repeat it.
    if (playing !== audio || (e as { name?: string } | null)?.name === "AbortError") return;
    throw e;
  }
}
