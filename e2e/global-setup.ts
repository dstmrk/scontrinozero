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

  // Sign in directly via the Supabase SDK (Node.js process, not through the
  // browser or the Next.js signIn server action).
  //
  // Why: npm start with output:standalone bakes NEXT_PUBLIC_* values at build
  // time. If the build-time anon key differs from the one used to create the
  // test user (e.g. empty during the build job), signInWithPassword in the
  // server action silently returns "Email o password non corretti". Signing in
  // here uses the env vars directly and is immune to that build-time quirk.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY " +
        "devono essere impostati per i test E2E",
    );
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { session },
    error,
  } = await supabase.auth.signInWithPassword({
    email: E2E_USER.email,
    password: E2E_USER.password,
  });

  if (error || !session) {
    throw new Error(
      `Supabase signInWithPassword fallito: ${error?.message ?? "nessuna sessione restituita"}`,
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
