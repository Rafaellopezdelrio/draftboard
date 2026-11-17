// Mutation testing: Stryker changes the code on purpose (flips a `<`, drops a
// line, swaps a number) and checks that some test turns red. A change no test
// notices ("survived") marks a test that is green without really guarding.
// Run: npx stryker run            (the brain files below, ~minutes)
//      npx stryker run --mutate "src/engine/foo.ts"   (one file)
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: "vitest",
  vitest: { configFile: "vitest.stryker.config.ts" },
  dryRunTimeoutMinutes: 15,
  coverageAnalysis: "perTest",
  mutate: [
    "src/engine/suggestionEngine.ts",
    "cloudflare-worker/src/scrapers/opggTier.js",
  ],
  // Log/telemetry strings are not behaviour; skip them to keep the report readable.
  ignoreStatic: true,
  concurrency: 6,
  timeoutMS: 20000,
  reporters: ["clear-text", "progress", "html", "json"],
  htmlReporter: { fileName: "reports/mutation/index.html" },
  jsonReporter: { fileName: "reports/mutation/mutation.json" },
  tempDirName: ".stryker-tmp",
};
