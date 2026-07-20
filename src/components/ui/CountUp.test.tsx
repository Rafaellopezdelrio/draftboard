import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { CountUp } from "./CountUp";

// Drive the RAF loop deterministically.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "performance"] });
});
afterEach(() => {
  vi.useRealTimers();
});

const shown = (el: HTMLElement) => parseFloat(el.textContent ?? "0");

describe("CountUp", () => {
  it("eases up to the target value", () => {
    const { container } = render(<CountUp value={100} duration={100} />);
    act(() => {
      vi.advanceTimersByTime(200); // > duration → animation finished
    });
    expect(shown(container)).toBe(100);
  });

  it("mid-animation retarget continues from the DISPLAYED value (no backward jump)", () => {
    // Regression: startRef only updated on animation END, so changing `value`
    // mid-flight restarted the count from the stale start (visual jump to ~0).
    const { container, rerender } = render(<CountUp value={100} duration={100} />);
    act(() => {
      vi.advanceTimersByTime(50); // mid-flight — well above 50 shown (ease-out)
    });
    const midway = shown(container);
    expect(midway).toBeGreaterThan(40);

    rerender(<CountUp value={50} duration={100} />);
    act(() => {
      vi.advanceTimersByTime(16); // one frame into the new animation
    });
    // Must start near where the display was — NOT reset toward 0.
    expect(shown(container)).toBeGreaterThan(midway - 30);
    expect(shown(container)).toBeGreaterThanOrEqual(50 * 0.5);

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(shown(container)).toBe(50); // settles on the new target
  });
});
