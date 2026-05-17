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
        // "No regression" gate. Current baseline ~17% statements. Every bug
        // we fix adds a test, gradually tightening these numbers. Tighten
        // by +5% every sprint until we hit 70%.
        statements: 15,
        branches: 60,
        functions: 25,
        lines: 15,
      },
    },
  },
});
