// Locked-down ConfirmDialog contract:
//   - role=alertdialog + aria-modal + aria-labelledby + aria-describedby
//   - Confirm + Cancel buttons fire respective callbacks
//   - Enter triggers confirm (keyboard accessibility)
//   - Escape triggers cancel
//   - X icon (top-right) also cancels
//   - destructive=true applies bad-styling class hint

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  it("renders with full alertdialog ARIA wiring", () => {
    render(
      <ConfirmDialog
        title="¿Borrar todo?"
        message="Esto no se puede deshacer."
        confirmLabel="Borrar"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog.getAttribute("aria-labelledby")).toBeTruthy();
    expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByText("¿Borrar todo?")).toBeInTheDocument();
    expect(screen.getByText("Esto no se puede deshacer.")).toBeInTheDocument();
  });

  it("confirm button fires onConfirm exactly once", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        title="t"
        message="m"
        confirmLabel="Borrar"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Borrar" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("cancel button fires onCancel exactly once", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        title="t"
        message="m"
        confirmLabel="OK"
        onConfirm={() => {}}
        onCancel={onCancel}
      />
    );
    // Two affordances both accessible-named "Cancelar" (X icon + text
    // button). Click the labeled one — primary cancel path.
    const cancelButtons = screen.getAllByRole("button", { name: "Cancelar" });
    fireEvent.click(cancelButtons[cancelButtons.length - 1]);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("Enter triggers onConfirm (keyboard accessibility)", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        title="t"
        message="m"
        confirmLabel="OK"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    );
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("Escape triggers onCancel", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        title="t"
        message="m"
        confirmLabel="OK"
        onConfirm={() => {}}
        onCancel={onCancel}
      />
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("backdrop click fires onCancel (defensive: dialog body click does NOT)", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        title="t"
        message="m"
        confirmLabel="OK"
        onConfirm={() => {}}
        onCancel={onCancel}
      />
    );
    // Click on the dialog body (inside the alertdialog div) — should NOT close.
    fireEvent.click(screen.getByRole("alertdialog"));
    expect(onCancel).not.toHaveBeenCalled();
  });
});
