// Tests for the focus-trap hook. Critical for accessibility: a regression
// here means keyboard-only users can Tab out of destructive-action modals
// and trigger something they didn't intend.

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { useRef } from "react";
import { useFocusTrap } from "./useFocusTrap";
import userEvent from "@testing-library/user-event";

function TrappedDialog({ active = true }: { active?: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useFocusTrap(ref, active);
  return (
    <>
      <button data-testid="outside-before">before</button>
      <div ref={ref} data-testid="dialog">
        <button data-testid="first">first</button>
        <button data-testid="middle">middle</button>
        <button data-testid="last">last</button>
      </div>
      <button data-testid="outside-after">after</button>
    </>
  );
}

describe("useFocusTrap", () => {
  it("focuses the first focusable element when active", async () => {
    render(<TrappedDialog />);
    // useEffect runs after first paint — wait for the focus to land.
    await new Promise((r) => setTimeout(r, 0));
    expect(document.activeElement).toBe(screen.getByTestId("first"));
  });

  it("wraps Tab from the LAST focusable back to the first", async () => {
    const user = userEvent.setup();
    render(<TrappedDialog />);
    await new Promise((r) => setTimeout(r, 0));
    screen.getByTestId("last").focus();
    await user.keyboard("{Tab}");
    expect(document.activeElement).toBe(screen.getByTestId("first"));
  });

  it("wraps Shift+Tab from the FIRST focusable back to the last", async () => {
    const user = userEvent.setup();
    render(<TrappedDialog />);
    await new Promise((r) => setTimeout(r, 0));
    screen.getByTestId("first").focus();
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(document.activeElement).toBe(screen.getByTestId("last"));
  });

  it("does not auto-focus or redirect when active=false", async () => {
    const user = userEvent.setup();
    render(<TrappedDialog active={false} />);
    await new Promise((r) => setTimeout(r, 0));
    // No auto-focus when trap is off — focus stays on whatever the
    // browser put it on initially (typically body).
    expect(document.activeElement).not.toBe(screen.getByTestId("first"));

    // From the LAST dialog button, Tab should escape the dialog and
    // land on `outside-after`. If the trap were still engaged it'd
    // wrap to `first` instead. The presence of correct browser-natural
    // forward navigation proves the trap is off.
    screen.getByTestId("last").focus();
    await user.keyboard("{Tab}");
    expect(document.activeElement).toBe(screen.getByTestId("outside-after"));
  });
});
