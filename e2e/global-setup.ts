import path from "path";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createTestUser, deleteTestUser, E2E_USER } from "./helpers/supabase";

export const AUTH_STATE_PATH = path.join(__dirname, ".auth", "user.json");

export default async function globalSetup() {
  // Delete existing test user to ensure a clean slate
  await deleteTestUser();

  // Create a fresh, pre-verified test user
  await createTestUser();

  // Obtain a session using the admin API to bypass Supabase's CAPTCHA
  // protection (Bot & Abuse Protection enabled on the test project).
  //
  // Flow:
  //   1. Admin client (service role) generates a magic-link for the test user.
  //      This hits /auth/v1/admin/generate_link — an admin endpoint that never
  //      requires CAPTCHA.
  //   2. We exchange the returned hashed_token via verifyOtp, which calls
  //      /auth/v1/verify — also exempt from CAPTCHA checks.
  //   3. The resulting session is injected as a cookie into the Playwright
  //      context, exactly as before.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY " +
        "devono essere impostati per i test E2E",
    );
  }

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Step 1: generate a magic link for the test user (admin-only endpoint)
  const { data: linkData, error: linkError } =
    await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email: E2E_USER.email,
    });

  if (linkError || !linkData) {
    throw new Error(
      `generateLink fallito: ${linkError?.message ?? "nessuna risposta"}`,
    );
  }

  // Step 2: exchange the hashed token for a real session (no CAPTCHA)
  const {
    data: { session },
    error: otpError,
  } = await adminClient.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "magiclink",
  });

  if (otpError || !session) {
    throw new Error(
      `verifyOtp fallito: ${otpError?.message ?? "nessuna sessione restituita"}`,
    );
  }

  // @supabase/ssr stores the session in a cookie named sb-{ref}-auth-token.
  // The project ref is the first subdomain of the Supabase URL.
  // Inject the cookie directly so that subsequent page loads (including the
  // dashboard layout's auth check) find a valid session without any UI login.
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const cookieName = `sb-${projectRef}-auth-token`;
  const expiresAt = session.expires_at ?? Math.floor(Date.now() / 1000) + 3600;

  const browser = await chromium.launch();
  const context = await browser.newContext();

  await context.addCookies([
    {
      name: cookieName,
      value: JSON.stringify(session),
      domain: "localhost",
      path: "/",
      httpOnly: false, // @supabase/ssr default
      sameSite: "Lax",
      secure: false, // HTTP in CI/localhost
      expires: expiresAt,
    },
  ]);

  await context.storageState({ path: AUTH_STATE_PATH });
  await browser.close();
}
