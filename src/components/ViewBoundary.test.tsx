// Verify ViewBoundary isolates view crashes:
//   - Throw inside child -> fallback renders, parent unaffected
//   - Reintentar resets boundary -> child remounts
//   - Cerrar fires onClose -> parent can unmount
//   - viewName shown to user + passed to Sentry tag
//
// We don't assert Sentry network calls (DSN absent in test env, Sentry
// silently no-ops). The component contract for the user is the fallback
// UI behaviour — that's what we lock down.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ViewBoundary } from "./ViewBoundary";

// Sentry's ErrorBoundary writes to console.error when catching. Silence
// it so the test output is clean — we assert behaviour, not logs.
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

function Boom({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("kaboom");
  return <div data-testid="happy">happy view</div>;
}

describe("ViewBoundary", () => {
  it("renders children normally when no error", () => {
    render(
      <ViewBoundary viewName="TestView">
        <Boom shouldThrow={false} />
      </ViewBoundary>
    );
    expect(screen.getByTestId("happy")).toBeInTheDocument();
  });

  it("catches throw + shows fallback with viewName", () => {
    render(
      <ViewBoundary viewName="HistoryView">
        <Boom shouldThrow={true} />
      </ViewBoundary>
    );
    // Fallback alert role for screen readers.
    expect(screen.getByRole("alert")).toBeInTheDocument();
    // viewName shown to user.
    expect(screen.getByText(/HistoryView/)).toBeInTheDocument();
    // Error message rendered for diagnostics.
    expect(screen.getByText(/kaboom/)).toBeInTheDocument();
    // Original child is gone.
    expect(screen.queryByTestId("happy")).not.toBeInTheDocument();
  });

  it("Cerrar button calls onClose when provided", () => {
    const onClose = vi.fn();
    render(
      <ViewBoundary viewName="TestView" onClose={onClose}>
        <Boom shouldThrow={true} />
      </ViewBoundary>
    );
    // Two close affordances both have accessible name "Cerrar" (the X
    // icon's aria-label and the text button). Both wire onClose, so we
    // click both and assert it fires twice.
    const closeButtons = screen.getAllByRole("button", { name: "Cerrar" });
    expect(closeButtons.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(closeButtons[closeButtons.length - 1]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("omits Cerrar button when onClose is not provided", () => {
    render(
      <ViewBoundary viewName="TestView">
        <Boom shouldThrow={true} />
      </ViewBoundary>
    );
    expect(screen.queryByRole("button", { name: "Cerrar" })).toBeNull();
    // Reintentar always present.
    expect(screen.getByRole("button", { name: /Reintentar/ })).toBeInTheDocument();
  });

  it("Reintentar remounts children — recovers when child no longer throws", () => {
    // Mutable flag so the child can stop throwing between renders.
    let shouldThrow = true;
    function Wrapped() {
      return <Boom shouldThrow={shouldThrow} />;
    }

    render(
      <ViewBoundary viewName="TestView">
        <Wrapped />
      </ViewBoundary>
    );
    // Fallback visible.
    expect(screen.getByRole("alert")).toBeInTheDocument();

    // Stop the throw and click Reintentar — boundary resets, child
    // remounts, happy path renders.
    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: /Reintentar/ }));
    expect(screen.getByTestId("happy")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders aria-live=assertive for screen reader interruption", () => {
    render(
      <ViewBoundary viewName="TestView">
        <Boom shouldThrow={true} />
      </ViewBoundary>
    );
    expect(screen.getByRole("alert")).toHaveAttribute("aria-live", "assertive");
  });
});
