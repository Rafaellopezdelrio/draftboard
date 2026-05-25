// Verify clipboard hook: success flash + reset, modern path,
// execCommand fallback, error format payload shape.
//
// jsdom doesn't ship navigator.clipboard.writeText by default so we
// mock it. The fallback path exercises document.execCommand which jsdom
// also doesn't implement — we mock that too. The contract we lock down
// is observable component behaviour, not the underlying browser API.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useClipboardCopy, formatErrorForClipboard } from "./useClipboardCopy";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useClipboardCopy", () => {
  it("returns copied=false initially", () => {
    const { result } = renderHook(() => useClipboardCopy());
    expect(result.current.copied).toBe(false);
  });

  it("uses navigator.clipboard.writeText when available, flashes copied=true", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const { result } = renderHook(() => useClipboardCopy(2000));
    await act(async () => {
      const ok = await result.current.copy("hello");
      expect(ok).toBe(true);
    });
    expect(writeText).toHaveBeenCalledWith("hello");
    expect(result.current.copied).toBe(true);
  });

  it("auto-resets copied=false after resetMs", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    const { result } = renderHook(() => useClipboardCopy(1000));
    await act(async () => {
      await result.current.copy("x");
    });
    expect(result.current.copied).toBe(true);
    await act(async () => {
      vi.advanceTimersByTime(1001);
    });
    expect(result.current.copied).toBe(false);
  });

  it("returns false when both clipboard APIs fail", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    // Force execCommand to also fail.
    const orig = document.execCommand;
    document.execCommand = vi.fn().mockReturnValue(false) as typeof document.execCommand;
    const { result } = renderHook(() => useClipboardCopy());
    let ok = true;
    await act(async () => {
      ok = await result.current.copy("x");
    });
    expect(ok).toBe(false);
    expect(result.current.copied).toBe(false);
    document.execCommand = orig;
  });

  it("falls back to execCommand when navigator.clipboard is missing", async () => {
    vi.stubGlobal("navigator", {});
    const exec = vi.fn().mockReturnValue(true);
    const orig = document.execCommand;
    document.execCommand = exec as typeof document.execCommand;
    const { result } = renderHook(() => useClipboardCopy());
    await act(async () => {
      const ok = await result.current.copy("fallback");
      expect(ok).toBe(true);
    });
    expect(exec).toHaveBeenCalledWith("copy");
    expect(result.current.copied).toBe(true);
    document.execCommand = orig;
  });
});

describe("formatErrorForClipboard", () => {
  it("includes header, version, timestamp, message, and stack", () => {
    const err = new Error("kaboom");
    err.stack = "Error: kaboom\n    at foo (file.js:1:1)";
    const out = formatErrorForClipboard(err);
    expect(out).toContain("Draftboard crash report");
    expect(out).toContain("version:");
    expect(out).toContain("when:");
    expect(out).toContain("error:   kaboom");
    expect(out).toContain("stack:");
    expect(out).toContain("at foo");
  });

  it("includes viewName in header when provided", () => {
    const out = formatErrorForClipboard(new Error("x"), { viewName: "CoachView" });
    expect(out).toContain("Draftboard crash report — CoachView");
  });

  it("handles non-Error values defensively", () => {
    const out = formatErrorForClipboard("string error");
    expect(out).toContain("error:   string error");
    expect(out).toContain("(no stack)");
  });

  it("caps the stack at ~3KB to fit clipboard / issue limits", () => {
    const err = new Error("big");
    err.stack = "x".repeat(10_000);
    const out = formatErrorForClipboard(err);
    // Whole output is header + 3KB cap + metadata — total under 4KB.
    expect(out.length).toBeLessThan(4000);
  });
});
