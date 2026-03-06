import { createClient } from "@supabase/supabase-js";

/**
 * Creates a Supabase client with the service role key for privileged admin operations.
 * This client bypasses Row Level Security — use only in server-side code.
 * Never expose this client or the service role key to the browser.
 */
export function createAdminSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required for admin operations.",
    );
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
