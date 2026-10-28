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
        // (≈69% stmts / 89% branches / 78% fns as of 2026-10-28) so normal
        // churn doesn't false-fail while a real coverage drop does. Meets the
        // TESTING_POLICY 2026-09-01 milestone (60% stmts / 70% fns). Ratchet
        // up toward the actuals each sprint.
        statements: 65,
        branches: 85,
        functions: 73,
        lines: 65,
      },
    },
  },
});
