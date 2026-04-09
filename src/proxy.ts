import { type NextRequest, NextResponse } from "next/server";
import { createMiddlewareSupabaseClient } from "@/lib/supabase/middleware";

/** Routes that require authentication */
const PROTECTED_PREFIXES = ["/dashboard", "/onboarding"];

/** Routes only for unauthenticated users (redirect to dashboard if logged in) */
const AUTH_ONLY_PATHS = ["/login", "/register", "/reset-password"];

/** Routes served exclusively on the marketing domain */
const MARKETING_ONLY_ROUTES = [
  "/privacy",
  "/termini",
  "/cookie-policy",
  "/help",
];

/**
 * Redirects based on hostname to enforce domain separation.
 * Returns null if no redirect is needed.
 * Skipped in local development where both domains share localhost:3000.
 */
function hostnameRedirect(request: NextRequest): NextResponse | null {
  if (process.env.NODE_ENV === "development") return null;

  // Strip optional port from Host header (e.g. "scontrinozero.it:443" → "scontrinozero.it")
  const hostname = (request.headers.get("host") ?? "").replace(/:\d+$/, "");
  const { pathname, search } = request.nextUrl;
  const appHostname =
    process.env.NEXT_PUBLIC_APP_HOSTNAME ?? "app.scontrinozero.it";
  const marketingHostname =
    process.env.NEXT_PUBLIC_MARKETING_HOSTNAME ?? "scontrinozero.it";
  const apiHostname =
    process.env.NEXT_PUBLIC_API_HOSTNAME ?? "api.scontrinozero.it";

  // API subdomain: pass through — routes handle Bearer auth themselves
  if (hostname === apiHostname) return null;

  const isMarketingDomain =
    hostname === marketingHostname || hostname === `www.${marketingHostname}`;
  const isAppDomain = hostname === appHostname;
  const isMarketingOnlyRoute = MARKETING_ONLY_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(`${r}/`),
  );

  if (isMarketingDomain && pathname !== "/" && !isMarketingOnlyRoute) {
    return NextResponse.redirect(
      new URL(pathname + search, `https://${appHostname}`),
    );
  }
  if (isAppDomain && pathname === "/") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  if (isAppDomain && isMarketingOnlyRoute) {
    return NextResponse.redirect(
      new URL(pathname + search, `https://${marketingHostname}`),
    );
  }
  return null;
}

export async function proxy(request: NextRequest) {
  const redirect = hostnameRedirect(request);
  if (redirect) return redirect;

  // Skip auth checks if Supabase is not configured (local dev, self-hosted without auth)
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
    const redirectResponse = NextResponse.redirect(loginUrl);
    // Propagate Supabase session cookies so token refresh survives the redirect
    response()
      .cookies.getAll()
      .forEach((c) => redirectResponse.cookies.set(c));
    return redirectResponse;
  }

  // Auth-only routes: redirect to /dashboard if already authenticated
  if (user && AUTH_ONLY_PATHS.some((path) => pathname.startsWith(path))) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    const redirectResponse = NextResponse.redirect(dashboardUrl);
    // Propagate Supabase session cookies so token refresh survives the redirect
    response()
      .cookies.getAll()
      .forEach((c) => redirectResponse.cookies.set(c));
    return redirectResponse;
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
    "/((?!_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt|api/health|api/v1|monitoring|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)", // NOSONAR — String.raw breaks Next.js static analysis of matcher config
  ],
};
