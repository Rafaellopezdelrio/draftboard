import { describe, it, expect } from "vitest";
import { pickKeyPoints } from "./matchInsights";
import type { Insight } from "../engine/coachEngine";

const ins = (severity: Insight["severity"], title: string): Insight => ({ category: "macro", severity, title, detail: "" });
const titles = (l: Insight[]) => l.map((i) => i.title);

describe("pickKeyPoints", () => {
  it("two problems worst first, then something done well", () => {
    const l = [ins("bad", "b1"), ins("warn", "w1"), ins("warn", "w2"), ins("good", "g1"), ins("info", "i1")];
    expect(titles(pickKeyPoints(l))).toEqual(["b1", "w1", "g1"]);
  });

  it("fills with what is left when there is nothing good, or few problems", () => {
    expect(titles(pickKeyPoints([ins("warn", "w1"), ins("warn", "w2"), ins("warn", "w3")]))).toEqual(["w1", "w2", "w3"]);
    expect(titles(pickKeyPoints([ins("good", "g1"), ins("info", "i1")]))).toEqual(["g1", "i1"]);
    expect(pickKeyPoints([])).toEqual([]);
  });
});
