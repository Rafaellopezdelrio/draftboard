import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("onnxruntime-web/ort-wasm-simd-threaded.wasm?url", () => ({ default: "ort.wasm" }));
vi.mock("@mintplex-labs/piper-tts-web", () => ({
  TtsSession: {
    _instance: null,
    create: async () => ({ predict: async () => new Blob(["wav"]) }),
  },
}));

import { speakNeural } from "./neuralVoice";

/** Audio whose play() fails the way the browser does. */
function fakeAudio(play: (self: { paused: boolean }) => Promise<void>) {
  return class {
    volume = 1;
    paused = false;
    onended: (() => void) | null = null;
    play() {
      return play(this);
    }
    pause() {
      this.paused = true;
    }
  };
}

beforeEach(() => {
  vi.stubGlobal("URL", { createObjectURL: () => "blob:x", revokeObjectURL: () => {} });
});

describe("speakNeural", () => {
  // Real games 24/11: two alerts at once counted a "failed" natural voice and
  // the PC voice repeated the first line.
  it("a line cut off by a newer one is not a failure", async () => {
    const abort = Object.assign(new Error("interrupted by pause()"), { name: "AbortError" });
    vi.stubGlobal("Audio", fakeAudio(() => Promise.reject(abort)));
    await expect(speakNeural("es_ES-davefx-medium", "uno", 0.9)).resolves.toBeUndefined();
  });

  it("a real playback error still fails, so the PC voice can step in", async () => {
    const denied = Object.assign(new Error("not allowed"), { name: "NotAllowedError" });
    vi.stubGlobal("Audio", fakeAudio(() => Promise.reject(denied)));
    await expect(speakNeural("es_ES-davefx-medium", "dos", 0.9)).rejects.toThrow("not allowed");
  });

  it("plays normally", async () => {
    vi.stubGlobal("Audio", fakeAudio(() => Promise.resolve()));
    await expect(speakNeural("es_ES-davefx-medium", "tres", 0.9)).resolves.toBeUndefined();
  });
});
