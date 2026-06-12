import { type NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { parseTrustedHostnameEnv } from "@/lib/hostname-env";
import { isIndexableHost } from "@/lib/seo-indexable";
import { createMiddlewareSupabaseClient } from "@/lib/supabase/middleware";

/** Routes that require authentication */
const PROTECTED_PREFIXES = ["/dashboard", "/onboarding"];

/** Routes only for unauthenticated users (redirect to dashboard if logged in) */
const AUTH_ONLY_PATHS = ["/login", "/register", "/reset-password"];

/**
 * Routes served exclusively on the marketing domain.
 *
 * Source-of-truth per la separazione dei domini: tutto ciò che sul dominio
 * marketing non è `/` e non è qui dentro viene rimbalzato sul dominio app
 * (vedi `hostnameRedirect`). Ogni nuova route top-level in
 * `src/app/(marketing)/` DEVE essere aggiunta qui, altrimenti finisce per
 * errore su app.scontrinozero.it. Il match in `hostnameRedirect` usa
 * `pathname === r || pathname.startsWith(`${r}/`)`, quindi il prefisso
 * top-level copre anche le route dinamiche (`/guide/[slug]`, `/per/[slug]`,
 * `/strumenti/[slug]`).
 */
const MARKETING_ONLY_ROUTES = [
  "/confronto",
  "/cookie-policy",
  "/funzionalita",
  "/guide",
  "/help",
  "/per",
  "/prezzi",
  "/privacy",
  "/strumenti",
  "/termini",
];

/**
 * Risolve l'hostname pubblico della richiesta dall'header `Host`.
 *
 * Dietro Cloudflare l'header `Host` è la source-of-truth attendibile: l'edge lo
 * riscrive in base all'hostname effettivamente servito (SNI), quindi un client
 * non può falsificarlo per ingannare il routing. È la stessa sorgente usata da
 * `robots.ts` (`headers().get("host")`) e, a differenza di
 * `request.nextUrl.hostname`, resta corretta in produzione standalone dietro il
 * Cloudflare Tunnel: lì `nextUrl.hostname` può riflettere l'origin interno e
 * NON l'apex marketing, causando `X-Robots-Tag: noindex` sulle pagine pubbliche
 * e il mancato redirect del dominio marketing.
 *
 * Fallback a `nextUrl.hostname` solo se l'header è assente (richieste sintetiche
 * senza Host). Sempre normalizzato: lowercase + porta rimossa.
 */
function resolvePublicHostname(request: NextRequest): string {
  const fromHeader = request.headers.get("host");
  const raw =
    fromHeader && fromHeader.length > 0
      ? fromHeader
      : request.nextUrl.hostname || "";
  return raw.toLowerCase().replace(/:\d+$/, "");
}

/**
 * Redirects based on hostname to enforce domain separation.
 *
 * Trust model:
 * - Primary source is the `Host` header via `resolvePublicHostname()` — dietro
 *   Cloudflare è attendibile e coerente con `robots.ts`. `nextUrl.hostname` è
 *   solo fallback quando l'header manca.
 * - Hostname matching is done against an explicit allowlist (app, marketing,
 *   www-marketing, api). Anything outside the allowlist is left untouched
 *   (safe-deny: no implicit cross-domain redirect on unknown hosts).
 * - I target dei redirect sono costruiti SOLO da env trusted
 *   (`https://${appHostname}`), mai dall'host della richiesta → anche
 *   accettando l'header `Host` non si introduce alcun open-redirect.
 * - Skipped in local development where both domains share localhost:3000.
 */
function hostnameRedirect(request: NextRequest): NextResponse | null {
  if (process.env.NODE_ENV === "development") return null;

  const hostname = resolvePublicHostname(request);
  const { pathname, search } = request.nextUrl;
  // Trusted hostnames must be parsed/validated: a malformed env var
  // (scheme leak, trailing slash, spaces, …) would otherwise alter routing
  // decisions silently. `parseTrustedHostnameEnv` fails closed to the fallback
  // and logs `critical:true` in production.
  // APP_HOSTNAME (runtime override per sandbox/self-host) > NEXT_PUBLIC_APP_HOSTNAME
  // (baked al build) > default. Coerente con auth-actions.ts, trusted-app-url.ts,
  // marketing-to-app-href.ts: senza questa precedenza il middleware su sandbox
  // confronterebbe contro l'hostname baked di produzione e cadrebbe in safe-deny.
  const appHostnameEnv =
    process.env.APP_HOSTNAME === undefined
      ? "NEXT_PUBLIC_APP_HOSTNAME"
      : "APP_HOSTNAME";
  const appHostname = parseTrustedHostnameEnv(
    appHostnameEnv,
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

/**
 * Aggiunge `X-Robots-Tag: noindex, nofollow` quando la risposta è servita da un
 * host non di produzione (sandbox, dominio app, self-host custom). È il segnale
 * autorevole di de-indicizzazione: a differenza del solo `Disallow` in
 * robots.txt, garantisce che le pagine già note non restino nell'indice.
 * Applicato solo alle risposte HTML pass-through (non ai redirect 3xx).
 *
 * L'host è risolto dall'header `Host` (`resolvePublicHostname`), coerente con
 * `robots.ts`: in produzione `nextUrl.hostname` può non essere l'apex marketing
 * e marcherebbe per errore la landing pubblica come `noindex`.
 */
function applyNoindexHeader(
  response: NextResponse,
  request: NextRequest,
): NextResponse {
  if (!isIndexableHost(resolvePublicHostname(request))) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return response;
}

export async function proxy(request: NextRequest) {
  const redirect = hostnameRedirect(request);
  if (redirect) return redirect;

  // Supabase non configurato:
  // - dev/test: passthrough (local dev senza auth, self-hosted in fase di setup)
  // - production: fail-closed sui PROTECTED_PREFIXES. Lasciar passare
  //   /dashboard senza auth check vorrebbe dire rendere pagine RSC private
  //   senza la guardia che si aspettano. Le pagine pubbliche restano accessibili.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    if (process.env.NODE_ENV === "production") {
      const { pathname, search } = request.nextUrl;
      if (PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
        const loginUrl = request.nextUrl.clone();
        loginUrl.pathname = "/login";
        // Preserve the original query string so a deep link like
        // /dashboard/storico?from=…&to=… can fully restore state post-login.
        loginUrl.searchParams.set("redirect", pathname + search);
        return NextResponse.redirect(loginUrl);
      }
    }
    return applyNoindexHeader(NextResponse.next(), request);
  }

  // Performance (REVIEW.md #6): le route marketing/pubbliche (/, /guide/*,
  // /prezzi, /per/*, /strumenti/*, /help/*, …) non consumano mai la sessione
  // Supabase — solo i PROTECTED_PREFIXES (gate auth) e gli AUTH_ONLY_PATHS
  // (redirect-se-loggato) leggono `user`. Per ogni altra route il risultato di
  // getUser() verrebbe ignorato, ma per un visitatore con cookie di sessione può
  // innescare un token refresh (round-trip verso Supabase) su pagine SSG che non
  // ne hanno bisogno. Salta del tutto la creazione del client e applica solo il
  // noindex header (hostnameRedirect sopra è già girato su ogni route).
  // NB: oggi non esistono route app fuori da /dashboard, quindi non si perde
  // alcun refresh-on-navigation; una futura route app fuori dai prefissi sopra
  // andrebbe aggiunta a `needsAuth`.
  const { pathname } = request.nextUrl;
  const needsAuth =
    PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    AUTH_ONLY_PATHS.some((path) => pathname.startsWith(path));
  if (!needsAuth) {
    return applyNoindexHeader(NextResponse.next(), request);
  }

  const { supabase, response } = createMiddlewareSupabaseClient(request);

  // Refresh the session — MUST be called before getUser() to keep tokens valid.
  // getUser() triggers an internal token refresh; if the refresh token is stale
  // (rotated/expired/revoked, or the user signed out elsewhere) @supabase/ssr
  // throws an AuthApiError (code: refresh_token_not_found). On the edge runtime
  // that would surface as an unhandled 500 + raw stack trace in the logs. Treat
  // any auth failure as "no session": protected routes redirect to /login,
  // exactly as for an absent session. We log a structured, edge-safe breadcrumb
  // via console.warn — pino is NOT edge-compatible, so it cannot be used here.
  let user: User | null = null;
  try {
    ({
      data: { user },
    } = await supabase.auth.getUser());
  } catch (err) {
    const errorClass =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: unknown }).code)
        : "auth_error";
    console.warn(
      JSON.stringify({
        level: "warn",
        action: "middlewareGetUser",
        errorClass,
        msg: "session refresh failed; treating request as unauthenticated",
      }),
    );
  }

  const { search } = request.nextUrl;

  // Protected routes: redirect to /login if not authenticated
  if (
    !user &&
    PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  ) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    // Preserve the original query string so a deep link like
    // /dashboard/storico?from=…&to=… can fully restore state post-login.
    loginUrl.searchParams.set("redirect", pathname + search);
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

  return applyNoindexHeader(response(), request);
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
     * - sw.js / manifest.webmanifest (PWA assets — must be served as-is,
     *   senza session refresh né redirect: un service worker che riceve un
     *   3xx fallisce la registrazione, e ogni fetch di questi file non deve
     *   pagare un getUser())
     * - Static assets (svg, png, jpg, etc.)
     */
    "/((?!_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt|api/health|api/v1|v1|monitoring|sw\\.js|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)", // NOSONAR — String.raw breaks Next.js static analysis of matcher config
  ],
};
