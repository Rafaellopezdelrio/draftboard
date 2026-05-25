// @vitest-environment jsdom
//
// Lock down the updateChannel pref shape + persistence:
//   - Default is "stable" on a fresh install
//   - Setter accepts "stable" or "beta"
//   - Persists via the same path as other prefs
//
// Why a separate file: keeps the small contract focused without
// inflating prefsStore.test.ts. Adding a new pref shouldn't require
// reading 200 lines of unrelated assertions.

import { describe, it, expect, beforeEach } from "vitest";
import { usePrefsStore, DEFAULT_PREFS } from "./prefsStore";

beforeEach(() => {
  // Reset store + remove the polluted __TAURI_INTERNALS__ from setup.
  // (see prefsStore.test.ts for the same pattern + rationale)
  delete (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  // Polyfill localStorage if jsdom didn't (Node 25 env behaviour).
  if (typeof localStorage === "undefined") {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        clear: () => store.clear(),
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
        removeItem: (k: string) => store.delete(k),
        get length() {
          return store.size;
        },
        key: (i: number) => Array.from(store.keys())[i] ?? null,
      },
      configurable: true,
      writable: true,
    });
  }
  localStorage.clear();
  usePrefsStore.setState({ prefs: { ...DEFAULT_PREFS }, loaded: false });
});

describe("updateChannel pref", () => {
  it("defaults to 'stable' on a fresh install", () => {
    expect(DEFAULT_PREFS.updateChannel).toBe("stable");
  });

  it("set('updateChannel', 'beta') writes the new value", async () => {
    await usePrefsStore.getState().set("updateChannel", "beta");
    expect(usePrefsStore.getState().prefs.updateChannel).toBe("beta");
  });

  it("set('updateChannel', 'stable') is idempotent from default state", async () => {
    const before = usePrefsStore.getState().prefs;
    await usePrefsStore.getState().set("updateChannel", "stable");
    // Default is "stable" so this set should be a no-op (idempotency
    // guard returns same state ref).
    expect(usePrefsStore.getState().prefs).toBe(before);
  });

  it("persists across load() cycles", async () => {
    await usePrefsStore.getState().set("updateChannel", "beta");
    // Reset in-memory store + re-load — value should come back.
    usePrefsStore.setState({ prefs: { ...DEFAULT_PREFS }, loaded: false });
    await usePrefsStore.getState().load();
    expect(usePrefsStore.getState().prefs.updateChannel).toBe("beta");
  });
});
