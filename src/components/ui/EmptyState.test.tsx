// Smoke tests for the EmptyState component — locks the contract that
// every list view depends on so renames/refactors don't silently break
// the "no data yet" UX.

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("renders the title", () => {
    render(<EmptyState title="Sin partidas todavía" />);
    expect(screen.getByText(/Sin partidas todavía/)).toBeInTheDocument();
  });

  it("renders the detail line when provided", () => {
    render(
      <EmptyState
        title="Sin datos"
        detail="Juega una partida y aparecerá aquí."
      />
    );
    expect(screen.getByText(/Juega una partida/)).toBeInTheDocument();
  });

  it("omits detail when not provided (no empty paragraph)", () => {
    const { container } = render(<EmptyState title="Vacío" />);
    const paragraphs = container.querySelectorAll("p");
    expect(paragraphs).toHaveLength(1); // title only
  });

  it("renders an action button and fires its onClick", () => {
    const click = vi.fn();
    render(
      <EmptyState
        title="Sin datos"
        action={{ label: "Sincronizar ahora", onClick: click }}
      />
    );
    const btn = screen.getByRole("button", { name: /Sincronizar/i });
    fireEvent.click(btn);
    expect(click).toHaveBeenCalledOnce();
  });

  it("uses compact spacing when compact=true (no exception)", () => {
    expect(() =>
      render(<EmptyState title="Vacío" compact />)
    ).not.toThrow();
  });

  it("exposes role=status + aria-live=polite for screen reader announcement", () => {
    render(<EmptyState title="Sin datos" />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Sin datos");
  });
});
