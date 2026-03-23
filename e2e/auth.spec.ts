import { test, expect } from "@playwright/test";
import { deleteTestUser, E2E_USER } from "./helpers/supabase";

/**
 * Mocks the Cloudflare Turnstile CDN script so the widget resolves immediately
 * without external network calls. In CI, challenges.cloudflare.com is slow/unreachable,
 * causing captchaToken to stay null → submit button stays disabled → test times out.
 */
async function setupTurnstileMock(page: import("@playwright/test").Page) {
  await page.route(
    /challenges\.cloudflare\.com\/turnstile\/v0\/api\.js/,
    (route) => {
      route.fulfill({
        contentType: "application/javascript",
        body: `
          window.turnstile = {
            render: function(el, opts) {
              if (opts.callback) opts.callback('e2e-test-token');
              if (opts.successCallback) opts.successCallback('e2e-test-token');
              return 'mock-widget-id';
            },
            getResponse: function() { return 'e2e-test-token'; },
            isExpired: function() { return false; },
            reset: function() {},
            remove: function() {}
          };
          for (var k in window) {
            if (k.indexOf('onloadTurnstile') === 0 && typeof window[k] === 'function') window[k]();
          }
        `,
      });
    },
  );
}

test.describe("Auth flows", () => {
  test("register - submit valido → redirect /verify-email", async ({
    page,
  }) => {
    const email = `register-${Date.now()}@example.com`;
    const password = "E2e_Test_Password1!";

    await setupTurnstileMock(page);
    await page.goto("/register");
    await page.fill("[name='email']", email);
    await page.fill("[name='password']", password);
    await page.fill("[name='confirmPassword']", password);
    // Radix Checkbox renders as <button role="checkbox"> — use click(), not check()
    await page.click("#termsAccepted");
    await page.click("#specificClausesAccepted");
    // Wait for Turnstile mock to resolve and enable the submit button
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
    await setupTurnstileMock(page);
    await page.goto("/register");
    await page.fill("[name='email']", "test@example.com");
    await page.fill("[name='password']", "abc");
    await page.fill("[name='confirmPassword']", "abc");
    // Radix Checkbox renders as <button role="checkbox"> — use click(), not check()
    await page.click("#termsAccepted");
    await page.click("#specificClausesAccepted");
    // Wait for Turnstile mock to resolve and enable the submit button
    await page.waitForSelector('button[type="submit"]:not([disabled])', {
      timeout: 15_000,
    });
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
    // Wait for React to finish hydrating before interacting with the form.
    // waitForLoadState("networkidle") is insufficient on slow CI runners:
    // React hydration is CPU-bound JS execution that can lag 1-2s behind network idle.
    // __reactFiber$ is attached to DOM nodes during the React hydration commit phase —
    // its presence on the <form> element guarantees onSubmit is now active.
    await page.waitForFunction(() => {
      const form = document.querySelector("form");
      return !!form && Object.keys(form).some((k) => k.startsWith("__reactFiber"));
    });
    await page.fill("[name='email']", E2E_USER.email);
    await page.click('button[type="submit"]');

    // Server action always redirects to /verify-email (avoids email enumeration)
    await expect(page).toHaveURL(/verify-email/, { timeout: 15_000 });
  });
});
