import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const speakNeural = vi.fn();
vi.mock("./neuralVoice", async (orig) => ({
  ...(await orig<typeof import("./neuralVoice")>()),
  speakNeural: (...a: unknown[]) => speakNeural(...a),
  stopNeural: vi.fn(),
}));

import { voiceCoach } from "./voiceCoach";
import { NEURAL_VOICES, neuralVoice } from "./neuralVoice";

const speak = vi.fn();

beforeEach(() => {
  speakNeural.mockReset().mockResolvedValue(undefined);
  speak.mockReset();
  vi.stubGlobal("speechSynthesis", { speak, cancel: vi.fn(), getVoices: () => [] });
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    class {
      constructor(public text: string) {}
    }
  );
  voiceCoach.setLanguage("es");
});

afterEach(() => {
  vi.unstubAllGlobals();
  voiceCoach.setPreferredVoice("");
});

describe("neural voices", () => {
  it("has voices in Spanish and in English", () => {
    expect(NEURAL_VOICES.some((v) => v.lang === "es")).toBe(true);
    expect(NEURAL_VOICES.some((v) => v.lang === "en")).toBe(true);
  });

  it("reads a voice from the saved pref, ignores PC voices", () => {
    expect(neuralVoice("piper:es_ES-davefx-medium")?.lang).toBe("es");
    expect(neuralVoice("Microsoft Helena - Spanish (Spain)")).toBeNull();
    expect(neuralVoice("piper:unknown")).toBeNull();
  });

  it("speaks with the neural voice the player picked", () => {
    voiceCoach.setPreferredVoice("piper:es_ES-davefx-medium");
    voiceCoach.preview("Hola (1/2/3)");
    expect(speakNeural).toHaveBeenCalledWith(
      "es_ES-davefx-medium",
      "Hola (1 asesinato, 2 muertes y 3 asistencias)",
      0.9
    );
    expect(speak).not.toHaveBeenCalled();
  });

  it("falls back to the PC voice when the neural one can't load", async () => {
    speakNeural.mockRejectedValue(new Error("offline"));
    voiceCoach.setPreferredVoice("piper:es_ES-davefx-medium");
    voiceCoach.preview("Hola");
    await vi.waitFor(() => expect(speak).toHaveBeenCalledTimes(1));
  });

  it("uses the PC voice when the picked voice is in another language", () => {
    voiceCoach.setPreferredVoice("piper:en_US-joe-medium");
    voiceCoach.preview("Hola");
    expect(speakNeural).not.toHaveBeenCalled();
    expect(speak).toHaveBeenCalledTimes(1);
  });
});
