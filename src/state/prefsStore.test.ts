// @vitest-environment jsdom
//
// Verify prefsStore boot survives corrupt localStorage.
//
// Why this matters: prefs are loaded once at app boot. A throw here
// (corrupt blob from power loss, antivirus tampering, manual edit)
// blanks the app before any error boundary mounts. The recovery path:
// catch -> warn -> wipe blob -> return empty -> defaults take over.
//
// Test runs in jsdom so isTauri() is false and the localStorage branch
// is exercised. The Tauri branch has its own per-row try/catch (line 259
// in prefsStore.ts) and is harder to drive without a Tauri runtime.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { usePrefsStore, DEFAULT_PREFS } from "./prefsStore";

const KEY = "lol-draft-prefs";

// jsdom 29 doesn't expose localStorage on globalThis/window by default
// in this vitest setup. Polyfill a minimal in-memory shim so the
// non-Tauri branch in prefsStore (which uses localStorage directly)
// can exercise the corruption-recovery path.
function installLocalStoragePolyfill() {
  const store = new Map<string, string>();
  const shim: Storage = {
    get length() { return store.size; },
    clear: () => store.clear(),
    getItem: (k) => (store.has(k) ? store.get(k)! : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    key: (i) => Array.from(store.keys())[i] ?? null,
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: shim,
    configurable: true,
    writable: true,
  });
}

beforeEach(() => {
  installLocalStoragePolyfill();
  // setup.ts defines __TAURI_INTERNALS__ = undefined which makes
  // isTauri() return true (because `"x" in obj` is true even when
  // value is undefined). Delete it so isTauri() returns false and
  // the localStorage branch under test is exercised.
  delete (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  // Reset the store's prefs to defaults between tests so the new
  // idempotency guard doesn't skip writes based on leaked state from
  // a previous test case. zustand's setState replaces top-level keys.
  usePrefsStore.setState({ prefs: { ...DEFAULT_PREFS }, loaded: false });
  // Reset zustand store + storage between tests so state doesn't leak.
  // The store is module-scoped — clear it via the same primitives the
  // app uses (set + clearAll). For load() side-effects we also wipe
  // localStorage so each test starts from a known baseline.
  localStorage.clear();
  // Silence the recovery warn so test output stays clean.
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("prefsStore corruption recovery", () => {
  it("load() survives malformed JSON in localStorage", async () => {
    // Plant a corrupt blob — invalid JSON.
    localStorage.setItem(KEY, "{not valid json");
    // load() must not throw. Defaults take over after the wipe.
    await expect(usePrefsStore.getState().load()).resolves.toBeUndefined();
    expect(usePrefsStore.getState().loaded).toBe(true);
    // Corrupt blob wiped so the next write starts clean.
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("load() returns parsed prefs when blob is valid", async () => {
    localStorage.setItem(KEY, JSON.stringify({ compactMode: true }));
    await usePrefsStore.getState().load();
    expect(usePrefsStore.getState().prefs.compactMode).toBe(true);
  });

  it("set() survives malformed JSON in localStorage (write path)", async () => {
    // Pre-corrupt the blob, then attempt a write. Old behaviour: throw.
    // New behaviour: silently start from {} and persist the new key.
    localStorage.setItem(KEY, "{also not valid");
    await expect(
      usePrefsStore.getState().set("compactMode", true)
    ).resolves.toBeUndefined();
    // The new write replaced the corrupt blob with a clean one.
    const raw = localStorage.getItem(KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.compactMode).toBe(true);
  });

  it("load() with no blob present returns defaults (no throw)", async () => {
    // Cold-start path: localStorage empty -> no parse attempted.
    expect(localStorage.getItem(KEY)).toBeNull();
    await expect(usePrefsStore.getState().load()).resolves.toBeUndefined();
    expect(usePrefsStore.getState().loaded).toBe(true);
  });
});

describe("prefsStore idempotency", () => {
  it("set() with unchanged value does NOT write to localStorage", async () => {
    // Seed a known state, then set the same value again. The second
    // call must NOT touch localStorage (no setItem invocation) and must
    // NOT notify subscribers (state ref unchanged).
    await usePrefsStore.getState().set("compactMode", true);
    const stateAfterFirst = usePrefsStore.getState().prefs;
    const before = localStorage.getItem(KEY);
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    await usePrefsStore.getState().set("compactMode", true);
    expect(setItemSpy).not.toHaveBeenCalled();
    // State object must remain referentially identical so React
    // useStore subscribers don't re-render.
    expect(usePrefsStore.getState().prefs).toBe(stateAfterFirst);
    const after = localStorage.getItem(KEY);
    expect(after).toBe(before);
    setItemSpy.mockRestore();
  });

  it("set() with changed value DOES write and updates state", async () => {
    await usePrefsStore.getState().set("compactMode", false);
    const stateBefore = usePrefsStore.getState().prefs;
    await usePrefsStore.getState().set("compactMode", true);
    expect(usePrefsStore.getState().prefs).not.toBe(stateBefore);
    expect(usePrefsStore.getState().prefs.compactMode).toBe(true);
  });
});
