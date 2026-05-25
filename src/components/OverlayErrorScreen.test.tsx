// Lock down the minimal overlay crash fallback:
//   - Renders role="alert" + aria-live="assertive" so screen readers
//     announce the crash even if the main app focus is elsewhere.
//   - Reintentar button fires the reset prop (so SentryErrorBoundary
//     re-mounts the overlay tree).
//   - × button hides the pill manually.
//   - Auto-hides after AUTO_HIDE_MS so a crash loop doesn't obscure
//     gameplay forever.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { OverlayErrorScreen } from "./OverlayErrorScreen";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("OverlayErrorScreen", () => {
  it("renders with role=alert and aria-live=assertive", () => {
    render(<OverlayErrorScreen error={new Error("x")} reset={() => {}} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("aria-live", "assertive");
    expect(alert).toHaveTextContent(/Overlay crash/);
  });

  it("calls reset when Reintentar clicked", () => {
    const reset = vi.fn();
    render(<OverlayErrorScreen error={new Error("x")} reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: /Reintentar/ }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("hides itself when × clicked (no reset call)", () => {
    const reset = vi.fn();
    render(<OverlayErrorScreen error={new Error("x")} reset={reset} />);
    expect(screen.queryByTestId("overlay-error-screen")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ocultar" }));
    expect(screen.queryByTestId("overlay-error-screen")).toBeNull();
    expect(reset).not.toHaveBeenCalled();
  });

  it("auto-hides after 10 seconds (avoids permanent gameplay obstruction)", () => {
    render(<OverlayErrorScreen error={new Error("x")} reset={() => {}} />);
    expect(screen.queryByTestId("overlay-error-screen")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(10_001);
    });
    expect(screen.queryByTestId("overlay-error-screen")).toBeNull();
  });

  it("does NOT hide before the auto-hide timeout", () => {
    render(<OverlayErrorScreen error={new Error("x")} reset={() => {}} />);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByTestId("overlay-error-screen")).toBeInTheDocument();
  });

  it("positions in top-left corner with fixed positioning (out of game UI)", () => {
    render(<OverlayErrorScreen error={new Error("x")} reset={() => {}} />);
    const pill = screen.getByTestId("overlay-error-screen");
    // Inline styles applied so the pill survives even when app CSS fails.
    expect(pill.style.position).toBe("fixed");
    expect(pill.style.top).toBe("6px");
    expect(pill.style.left).toBe("6px");
  });
});
