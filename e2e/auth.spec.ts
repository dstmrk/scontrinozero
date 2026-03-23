import { test, expect } from "@playwright/test";
import { deleteTestUser, E2E_USER } from "./helpers/supabase";

/**
 * Mocks Cloudflare Turnstile so captchaToken is resolved immediately without
 * any external network call. Uses two layers:
 *
 * 1. addInitScript — injects window.turnstile BEFORE any page script runs,
 *    so @marsidev/react-turnstile finds the mock synchronously in its useEffect
 *    and calls render() → opts.callback() → setCaptchaToken → button enabled.
 *
 * 2. page.route — intercepts the CDN request and returns an empty script body
 *    so the script element loads successfully (no onerror) without a network round-trip.
 */
async function setupTurnstileMock(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).turnstile = {
      render: function (
        _el: Element,
        opts: { callback?: (token: string) => void },
      ) {
        // setTimeout(0) lets React finish its current synchronous work before
        // the state update fires, avoiding stale-closure issues.
        if (opts && opts.callback)
          setTimeout(function () {
            opts.callback!("e2e-test-token");
          }, 0);
        return "mock-widget-id";
      },
      getResponse: function () {
        return "e2e-test-token";
      },
      isExpired: function () {
        return false;
      },
      reset: function () {},
      remove: function () {},
    };
  });
  // Serve an empty script so the <script> element loads without a network call.
  // The library detects the element via MutationObserver (D flag) and then finds
  // window.turnstile (set above) → triggers the render useEffect.
  await page.route(
    /challenges\.cloudflare\.com\/turnstile\/v0\/api\.js/,
    (route) => {
      route.fulfill({
        contentType: "application/javascript",
        body: "/* turnstile mock */",
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
    // reset-password/page.tsx sets data-hydrated="true" on the <form> element
    // inside a useEffect, which only fires after React has committed to the DOM
    // and attached all event handlers. This is more reliable than checking
    // __reactFiber$ keys, which are React internals subject to change.
    await page.waitForSelector("form[data-hydrated]", { timeout: 15_000 });
    await page.fill("[name='email']", E2E_USER.email);
    await page.click('button[type="submit"]');

    // Server action always redirects to /verify-email (avoids email enumeration)
    await expect(page).toHaveURL(/verify-email/, { timeout: 15_000 });
  });
});
