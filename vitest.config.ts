import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "cloudflare-worker/src/**/*.{test,spec}.{js,ts}",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "html"],
      // Only measure coverage on actual source — skip build output, configs, types.
      include: ["src/**/*.{ts,tsx}", "cloudflare-worker/src/**/*.js"],
      exclude: [
        "node_modules/**",
        "src/test/**",
        "src/**/*.{test,spec}.{ts,tsx}",
        "cloudflare-worker/src/**/*.test.js",
        "**/*.config.ts",
        "src/main.tsx",
        "src/vite-env.d.ts",
        "dist/**",
        "src-tauri/**",
      ],
      thresholds: {
        // "No regression" gate, set a few points below the measured actuals
        // (≈35% stmts / 78% branches / 52% fns as of 2026-06) so normal churn
        // doesn't false-fail while a real coverage drop does. Meets the
        // TESTING_POLICY 2026-06-01 milestone (25% stmts / 45% fns). Ratchet
        // up toward the actuals each sprint until we hit the 70% goal.
        statements: 30,
        branches: 70,
        functions: 45,
        lines: 30,
      },
    },
  },
});
