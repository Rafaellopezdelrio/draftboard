import "@testing-library/jest-dom/vitest";
import { vi, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

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
