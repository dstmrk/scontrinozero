import path from "path";
import { test, expect } from "@playwright/test";
import { E2E_BUSINESS, E2E_ADE } from "./helpers/supabase";

// Use session saved by global-setup
test.use({ storageState: path.join(__dirname, ".auth", "user.json") });

/**
 * Full user journey — tests are serial and stateful:
 * each step builds on the DB state left by the previous one.
 *
 * Flow: onboarding (3 steps) → cassa → storico → storno → upgrade (Stripe)
 */
test.describe.serial("User journey", () => {
  // ── Onboarding ─────────────────────────────────────────────────────────────

  test("onboarding step 1 - dati attività", async ({ page }) => {
    await page.goto("/onboarding");

    // Fresh user → step 0 (Dati attivita)
    await expect(
      page.locator('[data-slot="card-title"]').getByText("Dati attivita"),
    ).toBeVisible({ timeout: 10_000 });

    await page.fill("#firstName", E2E_BUSINESS.firstName);
    await page.fill("#lastName", E2E_BUSINESS.lastName);
    await page.fill("#address", E2E_BUSINESS.address);
    await page.fill("#streetNumber", E2E_BUSINESS.streetNumber);
    await page.fill("#zipCode", E2E_BUSINESS.zipCode);
    await page.fill("#city", E2E_BUSINESS.city);
    await page.fill("#province", E2E_BUSINESS.province);

    await page.click('button[type="submit"]');

    // Client advances to step 1 (Credenziali AdE)
    await expect(
      page.locator('[data-slot="card-title"]').getByText("Credenziali AdE"),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("onboarding step 2 - credenziali AdE", async ({ page }) => {
    // Server resumes at step 1 (hasBusiness=true, hasCredentials=false)
    await page.goto("/onboarding");
    await expect(
      page.locator('[data-slot="card-title"]').getByText("Credenziali AdE"),
    ).toBeVisible({ timeout: 10_000 });

    await page.fill("#codiceFiscale", E2E_ADE.codiceFiscale);
    await page.fill("#password", E2E_ADE.password);
    await page.fill("#pin", E2E_ADE.pin);

    await page.click('button[type="submit"]');

    // Client advances to step 2 (Verifica)
    await expect(
      page.locator('[data-slot="card-title"]').getByText("Verifica"),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("onboarding step 3 - verifica AdE → /dashboard", async ({ page }) => {
    // Server resumes at step 2 (hasBusiness=true, hasCredentials=true)
    await page.goto("/onboarding");
    await expect(
      page.locator('[data-slot="card-title"]').getByText("Verifica"),
    ).toBeVisible({ timeout: 10_000 });

    // Verify credentials (MockAdeClient succeeds in CI with ADE_MODE=mock)
    // This sets verifiedAt in DB, required by emitReceipt → fetchAdePrerequisites
    await page.getByRole("button", { name: "Verifica connessione" }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  });

  // ── Cassa ──────────────────────────────────────────────────────────────────

  test("cassa - emetti scontrino", async ({ page }) => {
    await page.goto("/dashboard/cassa");

    // Open "add item" panel
    await page.getByRole("button", { name: "Aggiungi" }).click();

    // Enter amount: "1" + "00" → 1.00 €
    await page.getByRole("button", { name: "1" }).click();
    await page.getByRole("button", { name: "00" }).click();

    // Confirm item → back to cart
    await page.getByRole("button", { name: "Aggiungi" }).click();

    // Proceed to summary
    await page.getByRole("button", { name: "Continua" }).click();

    // Submit receipt
    await page.getByRole("button", { name: /emetti scontrino/i }).click();

    // Verify success screen
    await expect(page.getByText("Scontrino emesso")).toBeVisible({
      timeout: 15_000,
    });
  });

  // ── Storico ────────────────────────────────────────────────────────────────

  test("storico - scontrino appare in lista", async ({ page }) => {
    await page.goto("/dashboard/storico");

    // Wait for summary text that lists found receipts
    await expect(page.getByText(/scontrini trovati/i)).toBeVisible({
      timeout: 10_000,
    });

    // At least one row is visible
    await expect(page.locator("tbody tr").first()).toBeVisible();
  });

  test("storico - storno scontrino", async ({ page }) => {
    await page.goto("/dashboard/storico");
    await expect(page.locator("tbody tr").first()).toBeVisible({
      timeout: 10_000,
    });

    // Click first receipt row → opens VoidReceiptDialog in "detail" view
    await page.locator("tbody tr").first().click();

    // Click "Annulla scontrino" → advances to "confirmingVoid" view
    await expect(
      page.getByRole("button", { name: /annulla scontrino/i }),
    ).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: /annulla scontrino/i }).click();

    // Confirm the void → triggers mutation
    await page.getByRole("button", { name: /annulla scontrino/i }).click();

    // Wait for the row to update with "Annullato" badge
    await expect(page.locator("tbody").getByText("Annullato")).toBeVisible({
      timeout: 15_000,
    });
  });

  // ── Upgrade (Stripe) ───────────────────────────────────────────────────────

  test("abbonamento - upgrade chiama Stripe Checkout", async ({ page }) => {
    // Intercept the checkout API to avoid real Stripe calls
    await page.route("**/api/stripe/checkout", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          url: "https://checkout.stripe.com/pay/cs_test_mock",
        }),
      });
    });

    // Intercept external navigation to Stripe (prevent leaving the app)
    await page.route("https://checkout.stripe.com/**", (route) =>
      route.abort(),
    );

    await page.goto("/dashboard/settings");

    // Plan selection is visible (trial-active state for fresh user)
    await expect(page.getByText("Scegli il tuo piano")).toBeVisible({
      timeout: 10_000,
    });

    // Track the POST request to the checkout endpoint
    const checkoutRequest = page.waitForRequest("**/api/stripe/checkout");

    // Click the first "Scegli" button (Starter annual, default interval=year)
    await page.getByRole("button", { name: "Scegli" }).first().click();

    // Verify the checkout API was called with POST
    const req = await checkoutRequest;
    expect(req.method()).toBe("POST");
  });
});
