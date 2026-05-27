import "@testing-library/jest-dom/vitest";
// vitest-axe extends `expect` with `toHaveNoViolations` for a11y tests.
// Register manually via expect.extend because the package's auto-register
// helper targets Vitest 0.x and doesn't run on Vitest 2.x. Cast through
// unknown — the matcher type isn't generic over Vitest's MatchersObject
// shape so a direct cast fails; unknown is the documented escape.
import { vi, afterEach, expect } from "vitest";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import * as matchers from "vitest-axe/matchers";
// Bridge: vitest-axe targets Vitest 0.x's matcher signature, Vitest 2.x's
// MatchersObject is stricter. Cast via unknown — the matcher runs fine at
// runtime, only the type wrapping differs.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
expect.extend(matchers as any);
import { cleanup } from "@testing-library/react";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import esBundle from "../i18n/locales/es.json";

// Synchronous i18n init for tests. Without this, useTranslation()
// returns raw key strings ("championPicker.noResults") which break
// assertions on real copy. Tests run in es (default) — translate
// English-locale tests separately if added later.
void i18n.use(initReactI18next).init({
  resources: { es: { translation: esBundle } },
  lng: "es",
  fallbackLng: "es",
  interpolation: { escapeValue: false },
});

afterEach(() => {
  cleanup();
});

// Mock Tauri APIs so they don't try to call into native land during tests.
vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: globalThis.fetch,
}));

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: {
    load: vi.fn().mockResolvedValue({
      select: vi.fn().mockResolvedValue([]),
      execute: vi.fn().mockResolvedValue({ lastInsertId: 0, rowsAffected: 0 }),
    }),
  },
}));

// In tests we're never in Tauri context; isTauri() returns false.
Object.defineProperty(globalThis, "__TAURI_INTERNALS__", {
  value: undefined,
  writable: true,
  configurable: true,
});
