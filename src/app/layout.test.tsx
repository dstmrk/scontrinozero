import { describe, it, expect, vi } from "vitest";

// Dipendenze pesanti non rilevanti per il metadata: mock per poter importare il
// modulo senza caricare font/woff2, provider e CSS.
vi.mock("next/font/local", () => ({
  default: () => ({ variable: "--font-mock", className: "mock" }),
}));
vi.mock("@/components/providers", () => ({
  Providers: ({ children }: { children: unknown }) => children,
}));
vi.mock("@/components/json-ld", () => ({
  JsonLd: () => null,
  softwareApplicationJsonLd: {},
  organizationJsonLd: {},
}));
vi.mock("./globals.css", () => ({}));

import { metadata } from "./layout";

describe("RootLayout metadata", () => {
  it("dichiara il meta standard mobile-web-app-capable (non deprecato)", () => {
    expect(metadata.other?.["mobile-web-app-capable"]).toBe("yes");
  });

  it("mantiene l'apple-mobile-web-app-capable per compat iOS", () => {
    expect(metadata.other?.["apple-mobile-web-app-capable"]).toBe("yes");
  });
});
