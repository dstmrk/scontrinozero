import { createBrowserClient } from "@supabase/ssr";

/**
 * Create a Supabase client for browser-side use (client components).
 * Automatically handles cookies via the browser cookie jar.
 *
 * Fails fast with a clear, actionable error when the required env vars are
 * missing — previously fell back to `""` and surfaced as opaque downstream
 * failures in `supabase-js` (auth flow returning empty error objects, network
 * requests to "https:/auth/v1/…", …) that wasted hours of debugging on
 * preview/self-hosted setups.
 */
export function createBrowserSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    const missing = [
      !url && "NEXT_PUBLIC_SUPABASE_URL",
      !publishableKey && "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    ]
      .filter(Boolean)
      .join(", ");
    throw new Error(
      `Supabase browser client misconfigured — missing ${missing}. ` +
        "These vars must be baked into the Next.js build " +
        "(see Dockerfile ARG NEXT_PUBLIC_SUPABASE_*) and set in the deploy env.",
    );
  }

  return createBrowserClient(url, publishableKey);
}
