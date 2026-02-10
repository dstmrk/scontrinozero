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
    await expect(header.getByRole("link", { name: /prezzi/i })).toHaveAttribute(
      "href",
      "#prezzi",
    );
  });

  test("shows pricing plans", async ({ page }) => {
    await page.goto("/");

    const pricing = page.locator("#prezzi");
    await expect(pricing.getByText("Free", { exact: true })).toBeVisible();
    await expect(pricing.getByText("Starter", { exact: true })).toBeVisible();
    await expect(pricing.getByText("Pro", { exact: true })).toBeVisible();
  });

  test("waitlist form accepts email", async ({ page }) => {
    await page.goto("/");

    const form = page.locator("form").first();
    await form.getByPlaceholder(/email/i).fill("test@example.com");
    await expect(
      form.getByRole("button", { name: /iscriviti/i }),
    ).toBeEnabled();
  });
});
