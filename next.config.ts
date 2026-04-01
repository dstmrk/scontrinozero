import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import withSerwistInit from "@serwist/next";

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
  async headers() {
    // Restrict internal API routes to the app's own origin only.
    // NEXT_PUBLIC_APP_URL is set per-environment (e.g. http://localhost:3000 in dev,
    // https://app.scontrinozero.it in production — API calls come from the app subdomain).
    const allowedOrigin =
      process.env.NEXT_PUBLIC_APP_URL ?? "https://app.scontrinozero.it";
    return [
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
    ];
  },
};

export default withSentryConfig(withSerwist(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  tunnelRoute: "/monitoring",
});
