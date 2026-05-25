// Lock down the SparkLine rendering contract:
//   - Empty / single-point data renders the placeholder
//   - 2+ points render a polyline with N-1 segments
//   - Last-point dot is highlighted (used as "now" marker)
//   - Baseline draws when set
//   - role=img + aria-label for screen readers

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { SparkLine } from "./SparkLine";

describe("SparkLine", () => {
  it("renders placeholder for empty data", () => {
    const { container } = render(<SparkLine data={[]} />);
    // No SVG, just a div placeholder.
    expect(container.querySelector("svg")).toBeNull();
    expect(container.textContent).toContain("—");
  });

  it("renders placeholder for single-point data (need 2 to draw a line)", () => {
    const { container } = render(<SparkLine data={[50]} />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("renders SVG polyline + last-point circle for 2+ points", () => {
    const { container } = render(<SparkLine data={[10, 20, 30, 25, 40]} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    const poly = svg!.querySelector("polyline");
    expect(poly).toBeTruthy();
    const points = poly!.getAttribute("points")!;
    // 5 points => 5 space-separated x,y pairs.
    expect(points.split(" ").length).toBe(5);
    // Highlight dot present.
    expect(svg!.querySelector("circle")).toBeTruthy();
  });

  it("renders the baseline line when baseline prop set", () => {
    const { container } = render(<SparkLine data={[40, 50, 60]} baseline={50} />);
    const lines = container.querySelectorAll("line");
    expect(lines.length).toBeGreaterThan(0);
  });

  it("does NOT render baseline when prop omitted", () => {
    const { container } = render(<SparkLine data={[40, 50, 60]} />);
    expect(container.querySelector("line")).toBeNull();
  });

  it("applies the color prop to stroke + dot fill", () => {
    const { container } = render(
      <SparkLine data={[1, 2, 3]} color="#ff0000" />
    );
    const poly = container.querySelector("polyline");
    expect(poly).toHaveAttribute("stroke", "#ff0000");
    const dot = container.querySelector("circle");
    expect(dot).toHaveAttribute("fill", "#ff0000");
  });

  it("exposes role=img + aria-label for screen readers", () => {
    const { container } = render(
      <SparkLine data={[1, 2]} ariaLabel="Winrate últimos 7 días" />
    );
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("role", "img");
    expect(svg).toHaveAttribute("aria-label", "Winrate últimos 7 días");
  });
});
