import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { visualizer } from "rollup-plugin-visualizer";
import pkg from "./package.json" with { type: "json" };

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    // Bundle treemap — only on `npm run analyze` (--mode analyze). Writes
    // dist/stats.html (gzip + brotli sizes) so we can see what's inside the
    // ~481KB main chunk. Never runs on dev / normal build / CI.
    ...(mode === "analyze"
      ? [visualizer({ filename: "dist/stats.html", gzipSize: true, brotliSize: true })]
      : []),
  ],
  // Compile-time constants. `__APP_VERSION__` lets Sentry tag every event
  // with the binary's package.json version so errors group by release in
  // the dashboard. We also expose it to <AboutModal> as a fallback when
  // running outside Tauri (vitest, browser preview).
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },

  build: {
    rollupOptions: {
      output: {
        // Manual chunk grouping. Splits big vendor libs into their own
        // chunks so the main bundle stays lean and unrelated app updates
        // don't bust the user's cache for these stable deps.
        //
        // Each group is loaded once on first reference, then cached by
        // Tauri's webview HTTP layer for subsequent panel opens.
        manualChunks: {
          // Error tracking — heavyweight, loaded at boot via Sentry.init
          // but rarely referenced after. Keep together so the main
          // chunk doesn't carry the symbolicator + integrations.
          sentry: ["@sentry/react"],
          // i18n runtime. Stable across app updates — splitting means
          // updates that don't touch translations leave this chunk
          // unchanged in the user's cache.
          i18n: ["i18next", "react-i18next"],
          // Tauri JS bridges. Several plugins ship their own JS shims;
          // bundling them together gives a single cacheable chunk.
          tauri: [
            "@tauri-apps/api",
            "@tauri-apps/plugin-dialog",
            "@tauri-apps/plugin-fs",
            "@tauri-apps/plugin-http",
            "@tauri-apps/plugin-log",
            "@tauri-apps/plugin-process",
            "@tauri-apps/plugin-sql",
            "@tauri-apps/plugin-updater",
          ],
        },
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
