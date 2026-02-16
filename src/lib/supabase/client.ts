import { createBrowserClient } from "@supabase/ssr";

/**
 * Create a Supabase client for browser-side use (client components).
 * Automatically handles cookies via the browser cookie jar.
 * Uses the `isSingleton` option to reuse the same instance across calls.
 */
export function createBrowserSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
