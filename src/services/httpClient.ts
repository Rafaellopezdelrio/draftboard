// Shared HTTP entrypoint for all proxy/API services.
//
// Every service file used to define its own identical `isTauri()` + `httpFetch`
// pair (9 copies). They exist because Tauri's `@tauri-apps/plugin-http` fetch
// bypasses CORS/mixed-content for desktop, but under vitest/jsdom there's no
// Tauri runtime, so we fall back to the global `fetch` (which test setup mocks).
//
// Keeping one copy here removes the drift risk and the boilerplate.

import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

/** True when running inside the Tauri webview (desktop), false under jsdom. */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * `fetch` that routes through Tauri's HTTP plugin on desktop (no CORS) and
 * the global `fetch` everywhere else (tests, browser). Drop-in for `fetch`.
 */
export const httpFetch: typeof fetch = (input, init) =>
  isTauri()
    ? (tauriFetch as unknown as typeof fetch)(input, init)
    : fetch(input, init);
