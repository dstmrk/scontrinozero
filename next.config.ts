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
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  tunnelRoute: "/monitoring",
});
