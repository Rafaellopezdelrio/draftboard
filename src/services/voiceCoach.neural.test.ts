import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const speakNeural = vi.fn();
const warmNeural = vi.fn();
let ready = false;
vi.mock("./neuralVoice", async (orig) => ({
  ...(await orig<typeof import("./neuralVoice")>()),
  speakNeural: (...a: unknown[]) => speakNeural(...a),
  warmNeural: (...a: unknown[]) => warmNeural(...a),
  neuralReady: () => ready,
  stopNeural: vi.fn(),
}));

import { voiceCoach } from "./voiceCoach";
import { NEURAL_VOICES, neuralVoice } from "./neuralVoice";

const speak = vi.fn();

beforeEach(() => {
  speakNeural.mockReset().mockResolvedValue(undefined);
  warmNeural.mockReset();
  ready = false;
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

  it("'automatic' is Dave in Spanish and Joe in English", () => {
    voiceCoach.setPreferredVoice("");
    voiceCoach.preview("Hola");
    expect(speakNeural).toHaveBeenLastCalledWith("es_ES-davefx-medium", "Hola", 0.9);
    voiceCoach.setLanguage("en");
    voiceCoach.preview("Hi");
    expect(speakNeural).toHaveBeenLastCalledWith("en_US-joe-medium", "Hi", 0.9);
  });

  it("a live line never waits for the download: the PC voice says it meanwhile", () => {
    voiceCoach.setEnabled(true);
    voiceCoach.speak("Te toca banear");
    expect(speakNeural).not.toHaveBeenCalled();
    expect(speak).toHaveBeenCalledTimes(1);
    expect(warmNeural).toHaveBeenCalledWith("es_ES-davefx-medium");

    ready = true;
    voiceCoach.speak("Te toca elegir");
    expect(speakNeural).toHaveBeenCalledWith("es_ES-davefx-medium", "Te toca elegir", 0.9);
    voiceCoach.setEnabled(false);
  });

  it("downloads the voice ahead of time only when the voice coach is on", () => {
    voiceCoach.setEnabled(false);
    expect(warmNeural).not.toHaveBeenCalled();
    voiceCoach.setEnabled(true);
    expect(warmNeural).toHaveBeenCalledWith("es_ES-davefx-medium");
    voiceCoach.setEnabled(false);
  });

  it("a PC voice picked by the player never downloads anything", () => {
    voiceCoach.setEnabled(true);
    warmNeural.mockReset();
    voiceCoach.setPreferredVoice("Microsoft Helena - Spanish (Spain)");
    voiceCoach.speak("Hola");
    expect(warmNeural).not.toHaveBeenCalled();
    expect(speak).toHaveBeenCalledTimes(1);
    voiceCoach.setEnabled(false);
  });
});
