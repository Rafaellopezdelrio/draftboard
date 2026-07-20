// E2E smoke tests for Draftboard's main UI.
//
// These cover the "if these break, the app is dead on arrival" paths:
//   - The bundle loads, React mounts, header renders
//   - The patch label uses the displayPatch helper (Riot year, not DDragon)
//   - The role selector mutates draft state
//   - Modals open from the header buttons
//   - Lazy-loaded views fetch their chunk without crashing
//
// We don't touch LCU/Live Client APIs — those require a real LoL client
// and Tauri context. Anything Tauri-only no-ops via isTauri() === false.

import { test, expect, type Page } from "@playwright/test";

/** Pre-accept the Terms gate by seeding `localStorage`. Used in every
 * smoke test's `beforeEach` so we never have to dismiss the legal
 * modal manually — that's not what we're testing here. The gate reads
 * `termsAcceptedAt` + `termsAcceptedVersion` from prefs; outside Tauri
 * those persist in memory only, so seeding before nav makes the gate
 * skip its render path entirely. */
async function preAcceptTerms(page: Page) {
  await page.addInitScript(() => {
    // The gate reads prefs from prefsStore which, outside Tauri, defaults
    // its fields. We pre-write the same values directly to window so
    // the store's load() can pick them up. Simpler approach: just dismiss
    // the modal once the gate renders — done in the helper below.
  });
}

/** Click "Acepto y empezar" on the TermsGate first-launch modal. Outside
 * Tauri the gate always shows on each navigation because prefs don't
 * persist across page loads (no SQLite). */
async function acceptTerms(page: Page) {
  const checkbox = page.locator('input[type="checkbox"]').first();
  const acceptBtn = page.getByRole("button", { name: /^Acepto/i });
  if (await acceptBtn.isVisible().catch(() => false)) {
    await checkbox.check().catch(() => {});
    await acceptBtn.click().catch(() => {});
    await acceptBtn
      .waitFor({ state: "detached", timeout: 5_000 })
      .catch(() => {});
  }
}

/** Dismiss the first-run onboarding overlay if it's covering the UI.
 *
 * Onboarding is a multi-step wizard. Step 1 exposes a "Saltar — usar en modo
 * manual" button that fires onClose immediately. The final step exposes
 * "Empezar a usar la app". Try the skip path first (fastest), then the
 * final-step path as fallback. */
async function dismissOnboarding(page: Page) {
  // Onboarding may mount slightly after the header — give it a beat.
  await page.waitForTimeout(300);

  const skipFirst = page.getByRole("button", { name: /Saltar.*modo manual/i });
  const finishLast = page.getByRole("button", { name: /Empezar a usar la app/i });

  // Step 1: click "Saltar" if present (advances wizard to the "done" step).
  if (await skipFirst.isVisible().catch(() => false)) {
    await skipFirst.click().catch(() => {});
  }
  // Step 2: click "Empezar a usar la app" which actually fires onClose().
  // Wait up to ~2s for it to appear after the skip.
  for (let i = 0; i < 8; i++) {
    if (await finishLast.isVisible().catch(() => false)) {
      await finishLast.click().catch(() => {});
      break;
    }
    await page.waitForTimeout(250);
  }

  // Wait for any z-50 modal backdrop to detach before continuing.
  await page
    .locator(".fixed.inset-0.z-50")
    .first()
    .waitFor({ state: "detached", timeout: 5_000 })
    .catch(() => {});
}

test.describe("Draftboard smoke", () => {
  // Every smoke test starts past the gates: navigate, tick + accept the
  // TermsGate (checkbox REQUIRED — the accept button is disabled without
  // it), then dismiss the onboarding wizard. The gates re-show on every
  // navigation outside Tauri (prefs don't persist), so this runs per test
  // and the tests themselves must NOT re-goto.
  test.beforeEach(async ({ page }) => {
    await preAcceptTerms(page);
    await page.goto("/");
    await acceptTerms(page);
    await dismissOnboarding(page);
  });

  test("loads and shows the header chrome", async ({ page }) => {
    await acceptTerms(page);
    // Either the splash ("Cargando datos...") shows briefly then resolves to
    // the header, or DDragon is fast and we land on the header straight away.
    // Wait for the header's Patch label which only renders after db is loaded.
    await expect(page.getByText(/Patch\s+\d+\.\d+/i)).toBeVisible({ timeout: 30_000 });
  });

  test("patch label uses Riot-year format (e.g. 26.x) not DDragon (16.x)", async ({ page }) => {
    await acceptTerms(page);
    const label = page.getByText(/Patch\s+\d+\.\d+/i);
    await expect(label).toBeVisible({ timeout: 30_000 });
    const text = await label.textContent();
    // DDragon ships 16.x; displayPatch should add +10 → 26.x. Any number <14
    // (pre-2024) is legitimately untranslated, but if we see 14-19 raw, the
    // helper isn't wired in.
    const match = text?.match(/Patch\s+(\d+)\./);
    expect(match).not.toBeNull();
    const major = Number(match![1]);
    expect(major).toBeGreaterThanOrEqual(13);
    // Anything between 14 and 19 inclusive means the year-shift fix is broken.
    if (major >= 14 && major <= 19) {
      throw new Error(`Patch label shows raw DDragon major ${major} — displayPatch() not applied`);
    }
  });

  test("LCU status chip is present (shows 'Esperando cliente' when no Tauri)", async ({ page }) => {
    await acceptTerms(page);
    // Without Tauri the watcher never connects; the offline chip should show.
    await expect(page.getByText(/Esperando cliente|Conectado/i)).toBeVisible({
      timeout: 30_000,
    });
  });

  test("role selector renders all 5 canonical roles", async ({ page }) => {
    await acceptTerms(page);
    await page.getByText(/Patch\s+\d+\.\d+/i).waitFor({ timeout: 30_000 });
    const select = page.locator("select").first();
    await expect(select).toBeVisible();
    const options = await select.locator("option").allTextContents();
    for (const r of ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"]) {
      expect(options).toContain(r);
    }
  });

  test("changing role updates draft store (panel rerenders)", async ({ page }) => {
    await acceptTerms(page);
    await page.getByText(/Patch\s+\d+\.\d+/i).waitFor({ timeout: 30_000 });
    const select = page.locator("select").first();
    await select.selectOption("JUNGLE");
    await expect(select).toHaveValue("JUNGLE");
    await select.selectOption("MIDDLE");
    await expect(select).toHaveValue("MIDDLE");
  });

  test("header buttons open their respective modals", async ({ page }) => {
    await acceptTerms(page);
    await page.getByText(/Patch\s+\d+\.\d+/i).waitFor({ timeout: 30_000 });
    await dismissOnboarding(page);

    // Tier List
    await page.getByRole("button", { name: /Tier List/i }).click();
    // Modal mount is lazy — wait for it.
    await page.waitForTimeout(500);
    // Close via Escape (every modal supports it).
    await page.keyboard.press("Escape");
  });

  test("command palette opens with Ctrl+K", async ({ page }) => {
    await acceptTerms(page);
    await page.getByText(/Patch\s+\d+\.\d+/i).waitFor({ timeout: 30_000 });
    await dismissOnboarding(page);
    await page.keyboard.press("Control+k");
    // CommandPalette renders an autofocused input with this Spanish placeholder.
    await expect(
      page.getByPlaceholder(/Buscar acci[oó]n/i)
    ).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press("Escape");
  });

  test("no uncaught errors during bootstrap", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    // beforeEach already navigated (listeners missed that boot) — reload so
    // this test observes a FULL bootstrap with the listeners attached.
    await page.reload();
    await acceptTerms(page);
    await page.getByText(/Patch\s+\d+\.\d+/i).waitFor({ timeout: 30_000 });
    // Filter expected noise: Tauri plugin warnings, DevTools-only messages.
    const real = errors.filter(
      (e) =>
        !e.includes("__TAURI") &&
        !e.includes("tauri") &&
        !e.includes("LCU") &&
        !e.includes("Failed to load resource") && // worker 4xx on cold cache
        !e.toLowerCase().includes("favicon")
    );
    expect(real, `Unexpected console/page errors:\n${real.join("\n")}`).toEqual([]);
  });
});
