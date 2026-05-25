/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SENTRY_DSN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Injected by Vite at build time from package.json#version. Used by
 * Sentry to tag every error event with the binary's release so errors
 * group by version in the dashboard. */
declare const __APP_VERSION__: string;
