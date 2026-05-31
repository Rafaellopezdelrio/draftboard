// The testable core of useAppShortcuts: the input-guard that stops bare-key
// shortcuts (1-5, R) from firing while the user is typing. Regression guard
// for "pressing 3 while typing a Riot ID swapped my role".

import { describe, it, expect } from "vitest";
import { isTypingTarget } from "./useAppShortcuts";

const el = (tag: string) => ({ tagName: tag }) as unknown as Element;

describe("isTypingTarget", () => {
  it("is true for text-entry fields (shortcuts must no-op there)", () => {
    expect(isTypingTarget(el("INPUT"))).toBe(true);
    expect(isTypingTarget(el("TEXTAREA"))).toBe(true);
  });

  it("is false for non-text elements and null focus", () => {
    expect(isTypingTarget(el("BUTTON"))).toBe(false);
    expect(isTypingTarget(el("DIV"))).toBe(false);
    expect(isTypingTarget(el("SELECT"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
