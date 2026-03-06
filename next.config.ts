import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

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
    // Restrict API routes to the app's own origin only.
    // NEXT_PUBLIC_APP_URL is set per-environment (e.g. http://localhost:3000 in dev,
    // https://scontrinozero.it in production).
    const allowedOrigin =
      process.env.NEXT_PUBLIC_APP_URL ?? "https://scontrinozero.it";
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: allowedOrigin },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET, POST, OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, Authorization",
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  tunnelRoute: "/monitoring",
});
