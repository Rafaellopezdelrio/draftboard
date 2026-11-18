import { describe, it, expect } from "vitest";
import { speakable, rankVoices } from "./voiceCoach";

// The live coach's death warning embeds "{{k}}/{{d}}/{{a}}"; speech engines
// read "11/7/15" as "11 de julio de 2015" (reported in a live game).
describe("speakable", () => {
  it("spells a K/D/A triple out as a score, not a date", () => {
    expect(speakable("Mueres demasiado (11/7/15).", "es")).toBe(
      "Mueres demasiado (11 asesinatos, 7 muertes y 15 asistencias)."
    );
    expect(speakable("You die too much (2/8/3).", "en")).toBe(
      "You die too much (2 kills, 8 deaths and 3 assists)."
    );
  });

  it("uses the singular for 1", () => {
    expect(speakable("1/1/1", "es")).toBe("1 asesinato, 1 muerte y 1 asistencia");
  });

  it("leaves other text alone", () => {
    expect(speakable("Tu turno de pickear", "es")).toBe("Tu turno de pickear");
    expect(speakable("Región EUW (1/5)", "es")).toBe("Región EUW (1/5)");
  });
});

describe("rankVoices", () => {
  const v = (name: string, lang: string, localService = true) =>
    ({ name, lang, localService, default: false, voiceURI: name }) as SpeechSynthesisVoice;
  const all = [
    v("Microsoft Helena - Spanish (Spain)", "es-ES"),
    v("Microsoft Sabina - Spanish (Mexico)", "es-MX"),
    v("Microsoft Elvira Online (Natural) - Spanish (Spain)", "es-ES", false),
    v("Microsoft Dalia Online (Natural) - Spanish (Mexico)", "es-MX", false),
    v("Google español", "es-ES", false),
    v("Microsoft Zira - English (United States)", "en-US"),
  ];

  it("natural voices first (Spain before Mexico), the old robotic ones last, only the language asked", () => {
    expect(rankVoices(all, "es").map((x) => x.name)).toEqual([
      "Microsoft Elvira Online (Natural) - Spanish (Spain)",
      "Microsoft Dalia Online (Natural) - Spanish (Mexico)",
      "Google español",
      "Microsoft Helena - Spanish (Spain)",
      "Microsoft Sabina - Spanish (Mexico)",
    ]);
    expect(rankVoices(all, "en").map((x) => x.name)).toEqual(["Microsoft Zira - English (United States)"]);
  });
});
