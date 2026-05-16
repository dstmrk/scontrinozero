import { type NextRequest, NextResponse } from "next/server";
import { parseTrustedHostnameEnv } from "@/lib/hostname-env";
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
 *
 * Trust model:
 * - Primary source is `request.nextUrl.hostname` (Next.js parses this from the
 *   incoming URL — same byte source as the Host header but normalised).
 * - Hostname matching is done against an explicit allowlist (app, marketing,
 *   www-marketing, api). Anything outside the allowlist is left untouched
 *   (safe-deny: no implicit cross-domain redirect on unknown hosts), so a
 *   spoofed Host header never triggers a redirect to an arbitrary destination.
 * - Skipped in local development where both domains share localhost:3000.
 */
function hostnameRedirect(request: NextRequest): NextResponse | null {
  if (process.env.NODE_ENV === "development") return null;

  // request.nextUrl.hostname is Next.js's parsed view of the request URL —
  // already lowercased and without port. We strip a stray port defensively
  // (some platforms surface "host:port" in nextUrl.hostname).
  const hostname = (request.nextUrl.hostname || "")
    .toLowerCase()
    .replace(/:\d+$/, "");
  const { pathname, search } = request.nextUrl;
  // Trusted hostnames must be parsed/validated: a malformed env var
  // (scheme leak, trailing slash, spaces, …) would otherwise alter routing
  // decisions silently. `parseTrustedHostnameEnv` fails closed to the fallback
  // and logs `critical:true` in production.
  const appHostname = parseTrustedHostnameEnv(
    "NEXT_PUBLIC_APP_HOSTNAME",
    "app.scontrinozero.it",
  );
  const marketingHostname = parseTrustedHostnameEnv(
    "NEXT_PUBLIC_MARKETING_HOSTNAME",
    "scontrinozero.it",
  );
  const apiHostname = parseTrustedHostnameEnv(
    "NEXT_PUBLIC_API_HOSTNAME",
    "api.scontrinozero.it",
  );

  const allowedHostnames = new Set([
    appHostname,
    marketingHostname,
    `www.${marketingHostname}`,
    apiHostname,
  ]);

  // Safe-deny: unknown host → never trigger cross-domain redirect.
  if (!allowedHostnames.has(hostname)) return null;

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

  // Supabase non configurato:
  // - dev/test: passthrough (local dev senza auth, self-hosted in fase di setup)
  // - production: fail-closed sui PROTECTED_PREFIXES (P2-03). Lasciar passare
  //   /dashboard senza auth check vorrebbe dire rendere pagine RSC private
  //   senza la guardia che si aspettano. Le pagine pubbliche restano accessibili.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    if (process.env.NODE_ENV === "production") {
      const { pathname } = request.nextUrl;
      if (PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
        const loginUrl = request.nextUrl.clone();
        loginUrl.pathname = "/login";
        loginUrl.searchParams.set("redirect", pathname);
        return NextResponse.redirect(loginUrl);
      }
    }
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
    "/((?!_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt|api/health|api/v1|v1|monitoring|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)", // NOSONAR — String.raw breaks Next.js static analysis of matcher config
  ],
};
