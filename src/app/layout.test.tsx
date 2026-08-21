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
  webSiteJsonLd: {},
}));
vi.mock("./globals.css", () => ({}));

import { metadata, viewport } from "./layout";

describe("RootLayout viewport", () => {
  it("dichiara un theme-color chiaro fisso fuori dall'app shell", () => {
    // Marketing/auth/onboarding montano fuori dal ThemeProvider: sono sempre
    // chiari, quindi una coppia light/dark qui darebbe barra scura su pagina
    // bianca. La coppia la dichiara il solo segmento /dashboard.
    expect(viewport.themeColor).toBe("#ffffff");
  });
});

describe("RootLayout metadata", () => {
  it("dichiara il meta standard mobile-web-app-capable (non deprecato)", () => {
    expect(metadata.other?.["mobile-web-app-capable"]).toBe("yes");
  });

  it("mantiene l'apple-mobile-web-app-capable per compat iOS", () => {
    expect(metadata.other?.["apple-mobile-web-app-capable"]).toBe("yes");
  });

  it("disattiva il rilevamento dei numeri di telefono di iOS", () => {
    // Senza questo, Safari su iPhone riscrive i digit-run lunghi (P.IVA in
    // footer, documentId sulla ricevuta pubblica) in <a href="tel:..."> prima
    // che React idrati: SCONTRINOZERO-Y.
    expect(metadata.formatDetection?.telephone).toBe(false);
  });
});
