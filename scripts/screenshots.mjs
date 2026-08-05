// Regenerates the README screenshots from the Vite dev server.
//
// Runs the same "outside Tauri" path the E2E smoke suite uses: the LCU and
// Live Client panels stay empty (no desktop client), but the draft board,
// the suggestion engine and the tier list all render real data pulled from
// DDragon + the Cloudflare Worker proxy. Good enough for the README.
//
// Usage:
//   npm run dev            # in one shell, port 1420
//   node scripts/screenshots.mjs
//
// Output: docs/screenshots/*.png at 1.5x device scale (crisp enough for a
// README on a HiDPI screen without dragging a megabyte per shot into git).

import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:1420";
const OUT = "docs/screenshots";
const VIEWPORT = { width: 1440, height: 900 };

// A believable enemy draft so the engine has real counter/synergy context
// to reason about instead of the generic meta list.
const ENEMY = ["Darius", "Viego", "Ahri", "Jinx", "Thresh"];
const ALLY = ["Gnar", "Sejuani"];

async function acceptTerms(page) {
  const accept = page.getByRole("button", { name: /^Acepto/i });
  // The gate mounts after prefs load, i.e. a beat after domcontentloaded —
  // and it renders *instead of* the app, so checking too early sees nothing
  // and every later locator times out.
  await accept.waitFor({ timeout: 20_000 }).catch(() => {});
  if (!(await accept.isVisible().catch(() => false))) return;
  await page.locator('input[type="checkbox"]').first().check();
  await accept.click();
  await accept.waitFor({ state: "detached", timeout: 10_000 }).catch(() => {});
}

// The onboarding wizard only fires onClose from its last step, so skip
// forward first and then confirm.
async function dismissOnboarding(page) {
  await page.waitForTimeout(400);
  const skip = page.getByRole("button", { name: /Saltar.*modo manual/i });
  const finish = page.getByRole("button", { name: /Empezar a usar la app/i });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  for (let i = 0; i < 8; i++) {
    if (await finish.isVisible().catch(() => false)) {
      await finish.click();
      break;
    }
    await page.waitForTimeout(250);
  }
  await page
    .locator(".fixed.inset-0.z-50")
    .first()
    .waitFor({ state: "detached", timeout: 10_000 })
    .catch(() => {});
}

/** Fill one draft slot. `team` 0 = ours, 1 = enemy — the board renders both
 * columns with the same "Pick N" labels, so we index by occurrence. */
async function pickChampion(page, team, slot, champion) {
  await page
    .getByRole("button", { name: new RegExp(`^Pick ${slot}$`, "i") })
    .nth(team)
    .click();
  const search = page.getByPlaceholder(/Search champion/i);
  await search.waitFor({ timeout: 10_000 });
  await search.fill(champion);
  // Not `exact` — the option's accessible name carries the role badge too.
  await page.getByRole("option", { name: champion }).first().click();
  await search.waitFor({ state: "detached", timeout: 10_000 }).catch(() => {});
}

async function shoot(page, name) {
  await page.waitForTimeout(700); // let count-ups and bar transitions settle
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`[screenshots] wrote ${OUT}/${name}.png`);
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 1.5,
});
const page = await context.newPage();

mkdirSync(OUT, { recursive: true });

await page.goto(BASE, { waitUntil: "domcontentloaded" });
await acceptTerms(page);
await dismissOnboarding(page);
await page.getByText(/Patch\s+\d+\.\d+/i).waitFor({ timeout: 60_000 });

// README is English; the app defaults to Spanish.
await page.getByRole("button", { name: "en", exact: true }).click();
// Kill the patch-changed banner so it doesn't eat the top of every shot.
await page.getByRole("button", { name: /Don.t show again/i }).click().catch(() => {});
await page.waitForTimeout(500);

await page.locator("select").first().selectOption("MIDDLE");
for (const [i, champ] of ENEMY.entries()) await pickChampion(page, 1, i + 1, champ);
for (const [i, champ] of ALLY.entries()) await pickChampion(page, 0, i + 1, champ);
// Our own mid pick unlocks the per-opponent matchup tips in the right rail.
// (The Build tab stays out of reach: it needs a champion resolved from the
// LCU, which never happens outside Tauri — App.tsx falls back to Picks.)
await pickChampion(page, 0, 3, "Viktor");
await page.waitForTimeout(1_500); // suggestion engine re-runs on our pick
await page.getByText(/Matchup tips/i).first().click();
await shoot(page, "champ-select");

await page.getByRole("button", { name: /Tier List/i }).click();
await page.waitForTimeout(2_000); // lazy chunk + per-bracket fetch
await shoot(page, "tier-list");

await browser.close();
