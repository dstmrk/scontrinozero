import { type NextRequest, NextResponse } from "next/server";
import { createMiddlewareSupabaseClient } from "@/lib/supabase/middleware";

/** Routes that require authentication */
const PROTECTED_PREFIXES = ["/dashboard", "/onboarding"];

/** Routes only for unauthenticated users (redirect to dashboard if logged in) */
const AUTH_ONLY_PATHS = ["/login", "/register", "/reset-password"];

/** Routes served exclusively on the marketing domain */
const MARKETING_ONLY_ROUTES = ["/privacy", "/termini", "/cookie-policy"];

export async function proxy(request: NextRequest) {
  // Hostname routing: separate marketing site (scontrinozero.it) from app (app.scontrinozero.it).
  // Skipped in local development where both share localhost:3000.
  if (process.env.NODE_ENV !== "development") {
    const hostname = request.headers.get("host") ?? "";
    const { pathname } = request.nextUrl;
    const appHostname =
      process.env.NEXT_PUBLIC_APP_HOSTNAME ?? "app.scontrinozero.it";
    const marketingHostname =
      process.env.NEXT_PUBLIC_MARKETING_HOSTNAME ?? "scontrinozero.it";

    const isMarketingDomain =
      hostname === marketingHostname || hostname === `www.${marketingHostname}`;
    const isAppDomain = hostname === appHostname;

    if (isMarketingDomain) {
      const isMarketingRoute =
        pathname === "/" ||
        MARKETING_ONLY_ROUTES.some(
          (r) => pathname === r || pathname.startsWith(`${r}/`),
        );
      if (!isMarketingRoute) {
        return NextResponse.redirect(
          new URL(pathname + request.nextUrl.search, `https://${appHostname}`),
        );
      }
    }

    if (isAppDomain) {
      if (pathname === "/") {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
      if (
        MARKETING_ONLY_ROUTES.some(
          (r) => pathname === r || pathname.startsWith(`${r}/`),
        )
      ) {
        return NextResponse.redirect(
          new URL(pathname, `https://${marketingHostname}`),
        );
      }
    }
  }

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
    "/((?!_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt|api/health|monitoring|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)", // NOSONAR — String.raw breaks Next.js static analysis of matcher config
  ],
};
