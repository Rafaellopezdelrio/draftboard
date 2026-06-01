import { describe, it, expect } from "vitest";
import { titleFromFirstMessage } from "./chatRepo";

describe("titleFromFirstMessage", () => {
  it("uses the message as-is when short", () => {
    expect(titleFromFirstMessage("¿Cómo gano vs Yasuo?")).toBe("¿Cómo gano vs Yasuo?");
  });

  it("collapses whitespace/newlines to a single line", () => {
    expect(titleFromFirstMessage("  analiza   mis\núltimas  partidas ")).toBe(
      "analiza mis últimas partidas"
    );
  });

  it("truncates long messages with an ellipsis", () => {
    const long = "a".repeat(100);
    const out = titleFromFirstMessage(long);
    expect(out.length).toBe(58); // 57 chars + ellipsis
    expect(out.endsWith("…")).toBe(true);
  });

  it("falls back to a default for empty input", () => {
    expect(titleFromFirstMessage("   ")).toBe("Conversación");
    expect(titleFromFirstMessage("")).toBe("Conversación");
  });
});
