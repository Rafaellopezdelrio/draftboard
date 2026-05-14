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
      reporter: ["text", "html"],
      exclude: ["node_modules/**", "src/test/**", "**/*.config.ts"],
    },
  },
});
