import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GpiRadar } from "./GpiRadar";
import type { GpiScore } from "../engine/gpiEngine";

function score(total: number, over: Partial<GpiScore["categories"]> = {}): GpiScore {
  return {
    total,
    matchId: "EUW1_1",
    categories: {
      farming: 50,
      vision: 50,
      aggression: 50,
      survivability: 50,
      objectives: 50,
      versatility: 50,
      laning: 50,
      ...over,
    },
  };
}

function polygonPoints(container: HTMLElement): Array<[number, number]> {
  const pts = container.querySelector("polygon")!.getAttribute("points")!;
  return pts.split(" ").map((p) => p.split(",").map(Number) as [number, number]);
}

describe("GpiRadar", () => {
  it("renders the total, the GPI glossary term and all seven category labels", () => {
    render(<GpiRadar score={score(80)} />);
    expect(screen.getByText("80")).toHaveClass("text-good");
    expect(screen.getByText("GPI")).toHaveAttribute("title", expect.stringMatching(/^Gameplay Performance Index/));
    for (const label of ["Farmeo", "Visión", "Agresión", "Supervivencia", "Objetivos", "Versatilidad", "Carril"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it.each([
    [75, "text-good"],
    [74, "text-meh"],
    [55, "text-meh"],
    [54, "text-bad"],
  ])("colors total %i as %s", (total, cls) => {
    render(<GpiRadar score={score(total)} />);
    expect(screen.getByText(String(total))).toHaveClass(cls);
  });

  it("plots one vertex per category scaled by its value (farming on top)", () => {
    const { container } = render(
      <GpiRadar score={score(60, { farming: 100, vision: 0 })} />
    );
    const pts = polygonPoints(container);
    expect(pts).toHaveLength(7);
    // farming = 100 -> full radius (80) straight up from center (100,100)
    expect(pts[0][0]).toBeCloseTo(100);
    expect(pts[0][1]).toBeCloseTo(20);
    // vision = 0 collapses to the center
    expect(pts[1][0]).toBeCloseTo(100);
    expect(pts[1][1]).toBeCloseTo(100);
    // laning = 50 -> half radius
    const [lx, ly] = pts[6];
    expect(Math.hypot(lx - 100, ly - 100)).toBeCloseTo(40);
    expect(container.querySelectorAll("line")).toHaveLength(7);
  });
});
