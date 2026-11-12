import { describe, it, expect } from "vitest";
import { plainStyle } from "./aiStyle";

describe("plainStyle", () => {
  it("asks for plain words, no maths and no markdown, in the chosen language", () => {
    const es = plainStyle("es");
    expect(es).toMatch(/Sin negritas, sin asteriscos/);
    expect(es).toMatch(/No escribas sumas, fórmulas/);
    expect(es).toMatch(/próxima partida/);
    expect(plainStyle("en")).toMatch(/No bold, no asterisks/);
  });

  it("the closing tip can be left out (plans, tips)", () => {
    expect(plainStyle("es", { closingTip: false })).not.toMatch(/próxima partida/);
  });

});
