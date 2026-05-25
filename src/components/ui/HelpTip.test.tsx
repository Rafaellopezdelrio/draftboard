// Verify HelpTip surface:
//   - Renders the (?) icon
//   - Hint exposed via title + aria-label so both mouse-hover and
//     keyboard-focus users see it
//   - tabIndex=0 so keyboard users can tab onto the affordance
//   - Custom ariaLabel overrides the hint when provided (rare, for
//     when the hint text is too long for an a11y label)

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HelpTip } from "./HelpTip";

describe("HelpTip", () => {
  it("renders with the hint as both title and aria-label by default", () => {
    render(<HelpTip hint="Tu API key dura 24h" />);
    const tip = screen.getByRole("img", { name: "Tu API key dura 24h" });
    expect(tip).toHaveAttribute("title", "Tu API key dura 24h");
  });

  it("is focusable (tabIndex=0) so keyboard users can reach it", () => {
    render(<HelpTip hint="x" />);
    expect(screen.getByRole("img")).toHaveAttribute("tabindex", "0");
  });

  it("respects ariaLabel override when hint is too long for a11y", () => {
    render(<HelpTip hint="Very long hint..." ariaLabel="Short label" />);
    const tip = screen.getByRole("img", { name: "Short label" });
    expect(tip).toHaveAttribute("title", "Very long hint...");
  });

  it("renders the HelpCircle icon as aria-hidden (inner SVG)", () => {
    const { container } = render(<HelpTip hint="x" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });
});
