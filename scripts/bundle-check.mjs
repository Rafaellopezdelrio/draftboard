// Bundle size budget. Runs after `vite build` and fails if any JS
// chunk exceeds the hard cap. Also warns when the main chunk crosses
// a softer threshold so we catch growth trends before they bite.
//
// Thresholds tuned to where the app sits today:
//   - Soft warn:   500 KB  (we're at ~490 KB on 0.3.0)
//   - Hard fail:   650 KB  (room to grow ~30% before alert)
// Bump these intentionally when the product genuinely needs the budget.
// Don't bump because a build crossed — investigate first.
//
// Usage:
//   npm run bundle-check
//   (or as part of `npm run build && npm run bundle-check` in CI)

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const DIST = "dist/assets";
const SOFT_WARN_KB = 500;
const HARD_FAIL_KB = 650;

function listJsChunks(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch (e) {
    console.error(`[bundle-check] ${dir} not found. Run \`npm run build\` first.`);
    process.exit(2);
  }
  return entries
    .filter((f) => f.endsWith(".js"))
    .map((f) => {
      const full = join(dir, f);
      return { name: f, sizeBytes: statSync(full).size };
    })
    .sort((a, b) => b.sizeBytes - a.sizeBytes);
}

const chunks = listJsChunks(DIST);
let worst = chunks[0];
let totalKb = 0;
for (const c of chunks) totalKb += c.sizeBytes / 1024;

console.log(`[bundle-check] ${chunks.length} JS chunks · total ${totalKb.toFixed(1)} KB`);
console.log(`[bundle-check] thresholds: warn @ ${SOFT_WARN_KB} KB · fail @ ${HARD_FAIL_KB} KB`);
console.log("");
console.log("Top 5 chunks:");
for (const c of chunks.slice(0, 5)) {
  const kb = c.sizeBytes / 1024;
  const tag =
    kb >= HARD_FAIL_KB ? "❌ FAIL" : kb >= SOFT_WARN_KB ? "⚠️  WARN" : "✓     ";
  console.log(`  ${tag}  ${kb.toFixed(1).padStart(7)} KB  ${c.name}`);
}

const worstKb = worst.sizeBytes / 1024;
if (worstKb >= HARD_FAIL_KB) {
  console.error(
    `\n[bundle-check] FAIL: ${worst.name} = ${worstKb.toFixed(1)} KB ≥ ${HARD_FAIL_KB} KB hard cap.`
  );
  console.error(
    "  → Investigate: did a new dep land? Run \`npx vite-bundle-visualizer\` for a breakdown."
  );
  process.exit(1);
}
if (worstKb >= SOFT_WARN_KB) {
  console.warn(
    `\n[bundle-check] WARN: ${worst.name} = ${worstKb.toFixed(1)} KB ≥ ${SOFT_WARN_KB} KB soft cap. Watch growth.`
  );
}
