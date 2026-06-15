import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import withSerwistInit from "@serwist/next";
import { parseTrustedHostnameEnv } from "./src/lib/hostname-env";
import { buildSecurityHeaders } from "./src/lib/security-headers";

const withSerwist = withSerwistInit({
  swSrc: "src/sw.ts",
  swDest: "public/sw.js",
  // Disable SW in development to avoid caching issues during development.
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  output: "standalone",
  // pdfkit uses __dirname to locate its bundled AFM font files at runtime.
  // Turbopack/webpack rewrites __dirname to "/ROOT", breaking the path resolution.
  // Marking pdfkit as an external package preserves the original Node.js module
  // resolution and keeps __dirname pointing to the actual node_modules location.
  serverExternalPackages: ["pdfkit"],
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  async rewrites() {
    // Requests arriving at the API subdomain (api[-sandbox].scontrinozero.it) come in
    // as /v1/... — rewrite to /api/v1/... where the actual route handlers live.
    return [
      {
        source: "/v1/:path*",
        destination: "/api/v1/:path*",
      },
    ];
  },
  async redirects() {
    // `/` su dominio app → `/dashboard`. Lo stesso branch esiste in
    // src/proxy.ts:hostnameRedirect ma in Next.js 16 la landing marketing
    // (src/app/(marketing)/page.tsx) è prerenderizzata in build e servita
    // dal Full Route Cache PRIMA che il proxy venga invocato (verificato in
    // prod v1.3.2: GET https://app.scontrinozero.it/ → 200 con header
    // `x-nextjs-prerender: 1` + `x-nextjs-cache: HIT`, niente 307).
    // `redirects()` è valutato a livello routing, prima della FRC → scatta.
    //
    // Priorità host: APP_HOSTNAME (runtime override, sandbox/self-host) →
    // NEXT_PUBLIC_APP_HOSTNAME (baked al build) → default. Coerente con
    // auth-actions.ts, trusted-app-url.ts, marketing-to-app-href.ts.
    const appHostnameEnv =
      process.env.APP_HOSTNAME === undefined
        ? "NEXT_PUBLIC_APP_HOSTNAME"
        : "APP_HOSTNAME";
    const appHostname = parseTrustedHostnameEnv(
      appHostnameEnv,
      "app.scontrinozero.it",
    );
    return [
      {
        source: "/",
        has: [{ type: "host", value: appHostname }],
        destination: "/dashboard",
        permanent: false,
      },
      {
        // `/confronto` è una pagina singola, senza sotto-rotte: qualunque
        // `/confronto/<qualcosa>` è un 404 (es. backlink esterni o URL indovinati,
        // come `/confronto/fatture-in-cloud` segnalato da Search Console). Lo
        // consolidiamo con un 308 sulla pagina canonica per non disperdere link
        // equity. `:path+` richiede almeno un segmento → non tocca `/confronto`.
        source: "/confronto/:path+",
        destination: "/confronto",
        permanent: true,
      },
    ];
  },
  async headers() {
    // Restrict internal API routes to the app's own origin only.
    // NEXT_PUBLIC_APP_URL is set per-environment (e.g. http://localhost:3000 in dev,
    // https://app.scontrinozero.it in production — API calls come from the app subdomain).
    const allowedOrigin =
      process.env.NEXT_PUBLIC_APP_URL ?? "https://app.scontrinozero.it";

    // Baseline security headers applied to every response.
    //
    // CSP è in modalità enforce in production (B14 chiuso in v1.2.10) e in
    // Report-Only in dev/test per non bloccare l'HMR di Next.js e il React
    // error overlay (entrambi usano `eval()`). Lo storico del rollout
    // Report-Only → enforce è documentato in `src/lib/csp.ts`.
    // La logica della lista header è in `src/lib/security-headers.ts` per
    // permettere unit test diretti.
    const securityHeaders = buildSecurityHeaders({
      nodeEnv: process.env.NODE_ENV,
      allowedOrigin,
    });

    return [
      {
        // Apply baseline security headers to every response.
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // Internal API routes — restricted to app origin
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: allowedOrigin },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, Authorization",
          },
        ],
      },
      {
        // Developer API — open CORS (Bearer auth only, no cookies)
        // Placed after the generic rule so it overrides Access-Control-Allow-Origin
        // for /api/v1/* paths specifically.
        source: "/api/v1/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, Authorization",
          },
        ],
      },
      {
        // Incoming /v1/* requests (from the API subdomain, before rewrite) also need
        // open CORS — Next.js header rules match the original path, not the rewritten one.
        source: "/v1/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, Authorization",
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(withSerwist(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  tunnelRoute: "/monitoring",
});
