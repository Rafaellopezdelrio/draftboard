// Minimal, focused ESLint setup: ONLY the react-hooks rules. We deliberately
// do NOT pull in the full typescript-eslint / stylistic recommended sets —
// tsc already owns type safety and we don't want a wall of style noise. The
// goal here is narrow: statically catch the hook-dependency / cleanup bugs
// that bit us repeatedly (stale closures, missing deps, missing cleanup).
//
//   - rules-of-hooks: error  (conditional/looped hook calls are always wrong)
//   - exhaustive-deps: warn   (missing useEffect/useMemo deps — surfaces the
//                              stale-closure class; warn so it never blocks
//                              an unrelated build while we triage)
//
// Run: npm run lint

import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "src-tauri/**",
      "cloudflare-worker/**",
      "docs/**",
      "node_modules/**",
      "**/*.test.ts",
      "**/*.test.tsx",
    ],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    // Register the typescript-eslint plugin so the existing inline
    // `// eslint-disable @typescript-eslint/...` comments resolve to a known
    // rule (otherwise ESLint hard-errors "Definition for rule not found").
    // We do NOT enable any of its rules — tsc owns type safety; this keeps
    // the output to the hook signal only.
    plugins: { "react-hooks": reactHooks, "@typescript-eslint": tseslint.plugin },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    // The codebase deliberately uses console in the logger/sentry/diagnostic
    // paths (guarded by inline disables from a prior lint setup). We don't
    // enable no-console, so those disables are "unused" — silence that report
    // rather than spam warnings for intentional, harmless leftovers.
    linterOptions: { reportUnusedDisableDirectives: "off" },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  }
);
