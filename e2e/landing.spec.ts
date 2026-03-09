import { test, expect } from "@playwright/test";

test.describe("Landing page", () => {
  test("loads and shows the hero", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(/ScontrinoZero/);
    await expect(
      page.getByRole("heading", { name: /scontrino elettronico/i }),
    ).toBeVisible();
  });

  test("header navigation anchors are present", async ({ page, isMobile }) => {
    test.skip(!!isMobile, "Nav links are hidden on mobile");
    await page.goto("/");

    const header = page.getByRole("banner");
    await expect(
      header.getByRole("link", { name: /funzionalità/i }),
    ).toHaveAttribute("href", "#funzionalita");
    await expect(header.getByRole("link", { name: /piani/i })).toHaveAttribute(
      "href",
      "#prezzi",
    );
  });

  test("shows pricing plans", async ({ page }) => {
    await page.goto("/");

    const pricing = page.locator("#prezzi");
    await expect(pricing.getByText("Starter", { exact: true })).toBeVisible();
    await expect(pricing.getByText("Pro", { exact: true })).toBeVisible();
    await expect(pricing.getByText(/€5,99/)).toBeVisible();
  });

  test("CTA buttons link to register", async ({ page }) => {
    await page.goto("/");

    const ctaLinks = page.getByRole("link", { name: /inizia gratis/i });
    await expect(ctaLinks.first()).toHaveAttribute("href", "/register");
  });
});
