import { describe, it, expect } from "vitest";
import { speakable } from "./voiceCoach";

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
