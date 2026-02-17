import { type NextRequest, NextResponse } from "next/server";
import { createMiddlewareSupabaseClient } from "@/lib/supabase/middleware";

/** Routes that require authentication */
const PROTECTED_PREFIXES = ["/dashboard", "/onboarding"];

/** Routes only for unauthenticated users (redirect to dashboard if logged in) */
const AUTH_ONLY_PATHS = ["/login", "/register", "/reset-password"];

export async function middleware(request: NextRequest) {
  // Skip auth checks if Supabase is not configured (E2E, local dev, self-hosted without auth)
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.next();
  }

  const { supabase, response } = createMiddlewareSupabaseClient(request);

  // Refresh the session — MUST be called before getUser() to keep tokens valid
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Protected routes: redirect to /login if not authenticated
  if (
    !user &&
    PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  ) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Auth-only routes: redirect to /dashboard if already authenticated
  if (user && AUTH_ONLY_PATHS.some((path) => pathname.startsWith(path))) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    return NextResponse.redirect(dashboardUrl);
  }

  return response();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt
     * - api/health (health check)
     * - monitoring (Sentry tunnel)
     * - Static assets (svg, png, jpg, etc.)
     */
    "/((?!_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt|api/health|monitoring|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)", // NOSONAR — String.raw breaks Next.js static analysis of matcher config
  ],
};
