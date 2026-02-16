import { createServerClient as _createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Create a Supabase client for server-side use (server components, server actions, route handlers).
 * Reads and writes cookies via Next.js `cookies()`.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return _createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            try {
              cookieStore.set(name, value, options);
            } catch {
              // `setAll` may be called from a Server Component where cookies
              // cannot be set. This is expected — the middleware will handle
              // refreshing the session cookie.
            }
          }
        },
      },
    },
  );
}
