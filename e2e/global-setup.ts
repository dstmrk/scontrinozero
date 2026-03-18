import path from "path";
import { chromium } from "@playwright/test";
import { createTestUser, deleteTestUser, E2E_USER } from "./helpers/supabase";

export const AUTH_STATE_PATH = path.join(__dirname, ".auth", "user.json");

export default async function globalSetup() {
  // Delete existing test user to ensure a clean slate
  await deleteTestUser();

  // Create a fresh, pre-verified test user
  await createTestUser();

  // Launch a browser, log in, and save the session state
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("http://localhost:3000/login");
  await page.fill("#email", E2E_USER.email);
  await page.fill("#password", E2E_USER.password);
  await page.click('button[type="submit"]');

  // Wait for redirect to onboarding (fresh user, no profile yet)
  await page.waitForURL(/\/(onboarding|dashboard)/, { timeout: 30_000 });

  await context.storageState({ path: AUTH_STATE_PATH });
  await browser.close();
}
