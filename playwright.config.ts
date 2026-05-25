// Playwright E2E config for Draftboard.
//
// Strategy: tests run against the regular Vite dev server (port 1420), NOT
// the Tauri webview. Tauri-only APIs (LCU, Live Client, SQL) gracefully
// no-op when isTauri() returns false, so we exercise the React/TS layer +
// data pipelines (DDragon, op.gg via worker) without booting a desktop
// window. This keeps tests fast (<10s smoke) and CI-friendly.
//
// To test the Tauri-only paths (LCU sync, item-set push), we'd need a
// separate Tauri-driven harness; that's out of scope for the smoke layer.

import { defineConfig, devices } from "@playwright/test";

const PORT = 1420;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
    // App boot does network calls to DDragon + our worker; give it room.
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    // Vite + champion DB fetch can take 20s cold on Windows.
    timeout: 60_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
