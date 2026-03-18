import { test, expect } from "@playwright/test";
import { deleteTestUser, E2E_USER } from "./helpers/supabase";

test.describe("Auth flows", () => {
  test("register - submit valido → redirect /verify-email", async ({
    page,
  }) => {
    const email = `register-${Date.now()}@example.com`;
    const password = "E2e_Test_Password1!";

    await page.goto("/register");
    await page.fill("#email", email);
    await page.fill("#password", password);
    await page.fill("#confirmPassword", password);
    await page.check("#termsAccepted");
    await page.check("#specificClausesAccepted");
    // Wait for Turnstile to resolve and enable the submit button
    await page.waitForSelector('button[type="submit"]:not([disabled])', {
      timeout: 15_000,
    });
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/verify-email/, { timeout: 15_000 });

    // Cleanup the newly created account
    await deleteTestUser(email).catch(() => {});
  });

  test("register - password debole → errore client-side, no redirect", async ({
    page,
  }) => {
    await page.goto("/register");
    await page.fill("#email", "test@example.com");
    await page.fill("#password", "abc");
    await page.fill("#confirmPassword", "abc");
    await page.check("#termsAccepted");
    await page.check("#specificClausesAccepted");
    await page.click('button[type="submit"]');

    // Password validation error appears
    await expect(page.locator(".text-destructive").first()).toBeVisible();

    // No navigation away from register
    await expect(page).toHaveURL(/register/);
  });

  test("reset-password - email valida → redirect /verify-email", async ({
    page,
  }) => {
    await page.goto("/reset-password");
    await page.fill("#email", E2E_USER.email);
    await page.click('button[type="submit"]');

    // Server action always redirects to /verify-email (avoids email enumeration)
    await expect(page).toHaveURL(/verify-email/, { timeout: 15_000 });
  });
});
