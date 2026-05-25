// Trap keyboard focus inside a container while it's open. Standard
// accessibility requirement for modal dialogs — without it, Tab leaks
// to elements behind the modal (header buttons, draft slots, etc) and
// keyboard-only users lose their place.
//
// Implementation notes:
//   - We listen for Tab + Shift+Tab on the document and redirect focus
//     to the first/last focusable inside the container when it would
//     otherwise escape.
//   - On open we focus the first focusable element (or the container
//     itself with tabIndex=-1 as fallback).
//   - On close we restore focus to whatever had it before the modal
//     opened. This is what screen reader users expect.
//   - Containers without ANY focusable elements still get a tabIndex=-1
//     so they can hold focus while the modal is up.

import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
  "[contenteditable='true']",
].join(",");

/**
 * Trap focus inside the element returned by the ref while `active`.
 *
 * Caller pattern:
 *   const ref = useRef<HTMLDivElement | null>(null);
 *   useFocusTrap(ref, isOpen);
 *   return <div ref={ref} role="dialog">…</div>;
 */
export function useFocusTrap(
  containerRef: React.RefObject<HTMLElement | null>,
  active: boolean
): void {
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    // Remember the element that had focus before the trap engaged so
    // we can restore it on close. Common case: the button that opened
    // the modal should get focus back.
    previouslyFocused.current = document.activeElement as HTMLElement | null;

    // Focus the first focusable inside the container. If there are
    // none, focus the container itself (with tabIndex=-1) so the
    // modal can still hold focus.
    const focusables = Array.from(
      container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    ).filter((el) => !el.hasAttribute("aria-hidden"));

    if (focusables.length > 0) {
      // Skip auto-focus when an element already has it AND it's inside —
      // respects autoFocus props that components set themselves.
      const active = document.activeElement;
      if (!active || !container.contains(active)) {
        focusables[0].focus();
      }
    } else {
      if (!container.hasAttribute("tabindex")) {
        container.setAttribute("tabindex", "-1");
      }
      container.focus();
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((el) => !el.hasAttribute("aria-hidden"));
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        // Shift+Tab on the first → wrap to last
        if (active === first || !container.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        // Tab on the last → wrap to first
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Restore focus to whatever held it before the trap. Skip if the
      // page navigated away (element may no longer be in the DOM).
      const prev = previouslyFocused.current;
      if (prev && document.body.contains(prev)) {
        prev.focus();
      }
    };
  }, [active, containerRef]);
}
