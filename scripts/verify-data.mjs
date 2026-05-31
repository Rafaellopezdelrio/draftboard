// Data-layer health check. Probes the live Cloudflare Worker end-to-end and
// asserts the scraped data the app depends on actually flows — counter
// matchups (+ the inversion spread that reorders suggestions), the
// Wukong/monkeyking slug fix, champion builds, and the meta tier list.
//
// Run it after `wrangler deploy` to confirm the data layer works WITHOUT
// launching a game (the gap that used to need a live match to validate).
//
// Usage:
//   node scripts/verify-data.mjs
//   node scripts/verify-data.mjs https://my-worker.workers.dev
//   WORKER_BASE_URL=... node scripts/verify-data.mjs
//
// Exit 0 = all green. Exit 1 = a data source is broken (CI-friendly).

const BASE = (
  process.argv[2] ||
  process.env.WORKER_BASE_URL ||
  "https://draftboard-riot-proxy.rafael-lopez-serrano-99.workers.dev"
).replace(/\/$/, "");

const TIMEOUT_MS = 20000;
let failures = 0;

const pass = (name, detail = "") =>
  console.log(`  ✓ ${name}${detail ? " — " + detail : ""}`);
const fail = (name, detail = "") => {
  console.error(`  ✗ ${name}${detail ? " — " + detail : ""}`);
  failures++;
};

async function getJson(path) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(BASE + path, {
      headers: { Accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function checkHealth() {
  try {
    const j = await getJson("/health");
    if (j.ok) pass("health", `worker version ${j.version ?? "(none)"}`);
    else fail("health", "ok=false");
  } catch (e) {
    fail("health", e.message);
  }
}

async function checkCounters() {
  // Enemy Lee Sin jungle -> invert each matchup to "my candidate vs Lee Sin".
  // A healthy scrape returns ~50 matchups with a wide WR spread; that spread
  // is the signal that actually reorders the engine's suggestions.
  try {
    const j = await getJson("/opgg/matchups?champion=leesin&role=jungle");
    const m = j.matchups ?? [];
    if (m.length === 0) return fail("counters (leesin/jungle)", "0 matchups");
    const inv = m.map((x) => 100 - x.winRate).sort((a, b) => b - a);
    const spread = inv[0] - inv[inv.length - 1];
    if (spread >= 8)
      pass("counters (leesin/jungle)", `${m.length} matchups, spread ${spread.toFixed(1)}pp`);
    else fail("counters (leesin/jungle)", `spread only ${spread.toFixed(1)}pp (weak signal)`);
  } catch (e) {
    fail("counters (leesin/jungle)", e.message);
  }
}

async function checkWukongSlug() {
  // Regression guard: ddIdToOpggKey must map Wukong -> "monkeyking" (op.gg's
  // internal id), not "wukong" (which 404s). The inverted mapping silently
  // zeroed every Wukong matchup.
  try {
    const j = await getJson("/opgg/matchups?champion=monkeyking&role=jungle");
    const n = (j.matchups ?? []).length;
    if (n > 0) pass("wukong slug (monkeyking)", `${n} matchups`);
    else fail("wukong slug (monkeyking)", "0 matchups — slug regressed?");
  } catch (e) {
    fail("wukong slug (monkeyking)", e.message);
  }
}

async function checkBuild() {
  try {
    const j = await getJson("/opgg/build?champion=aatrox&role=TOP");
    const n = (j.coreItems ?? []).length;
    if (n > 0) pass("build (aatrox/top)", `${n} core-item set(s)`);
    else fail("build (aatrox/top)", "no core items");
  } catch (e) {
    fail("build (aatrox/top)", e.message);
  }
}

async function checkMeta() {
  try {
    const j = await getJson("/opgg/tierlist");
    const n = (j.top ?? []).length;
    if (n > 0) pass("meta tierlist", `${n} top-lane champs`);
    else fail("meta tierlist", "empty top lane");
  } catch (e) {
    fail("meta tierlist", e.message);
  }
}

console.log(`Draftboard data-layer check -> ${BASE}\n`);
await checkHealth();
await checkCounters();
await checkWukongSlug();
await checkBuild();
await checkMeta();

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll data sources healthy.");
