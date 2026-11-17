// Narrow test set for mutation testing (stryker.config.mjs): only the tests
// that exercise the mutated "brain" files, so Stryker's first full run fits.
// (mergeConfig would concatenate `include`, so the list is replaced by hand.)
import { defineConfig } from "vitest/config";
import base from "./vitest.config";

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: [
      "src/engine/suggestionEngine*.test.ts",
      "src/state/draftFlow.integration.test.ts",
      "src/data/metaTierList.test.ts",
      "cloudflare-worker/src/opggTier*.test.js",
      "cloudflare-worker/src/scrapers/*.test.js",
    ],
    coverage: { ...base.test?.coverage, enabled: false },
  },
});
