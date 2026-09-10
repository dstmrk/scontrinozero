import { describe, it, expect } from "vitest";
import { buildSecurityHeaders } from "./security-headers";

describe("buildSecurityHeaders", () => {
  it("imposta CSP in modalità enforce in production", () => {
    const headers = buildSecurityHeaders({
      nodeEnv: "production",
    });
    const cspKeys = headers.map((h) => h.key);

    expect(cspKeys).toContain("Content-Security-Policy");
    expect(cspKeys).not.toContain("Content-Security-Policy-Report-Only");
  });

  it("imposta CSP in modalità Report-Only in development e test", () => {
    // Next.js dev (Turbopack/Webpack HMR + React error overlay) usa eval(),
    // non compatibile senza 'unsafe-eval'. Tenere Report-Only in dev permette
    // di vedere le violation senza rompere HMR.
    for (const env of ["development", "test", undefined] as const) {
      const headers = buildSecurityHeaders({
        nodeEnv: env,
      });
      const cspKeys = headers.map((h) => h.key);

      expect(cspKeys).toContain("Content-Security-Policy-Report-Only");
      expect(cspKeys).not.toContain("Content-Security-Policy");
    }
  });

  it("la policy CSP è invariata byte-per-byte tra enforce e Report-Only", () => {
    // Stesso contenuto, cambia solo la chiave header. Garantisce parità di
    // copertura della telemetria tra dev e prod.
    const prod = buildSecurityHeaders({
      nodeEnv: "production",
    });
    const dev = buildSecurityHeaders({
      nodeEnv: "development",
    });

    const prodCsp = prod.find((h) => h.key === "Content-Security-Policy");
    const devCsp = dev.find(
      (h) => h.key === "Content-Security-Policy-Report-Only",
    );

    expect(prodCsp!.value).toBe(devCsp!.value);
  });

  it("la CSP contiene la baseline allowlist (default-src self, object-src none)", () => {
    const headers = buildSecurityHeaders({
      nodeEnv: "production",
    });
    const csp = headers.find((h) => h.key === "Content-Security-Policy");

    expect(csp).toBeDefined();
    expect(csp!.value).toMatch(/default-src 'self'/);
    expect(csp!.value).toMatch(/object-src 'none'/);
    expect(csp!.value).toMatch(/frame-ancestors 'none'/);
  });

  it("non emette Reporting-Endpoints: sarebbe bakato al valore di produzione", () => {
    const headers = buildSecurityHeaders({ nodeEnv: "production" });

    // La Reporting API pretende un URL assoluto, e `next.config.ts`
    // serializza questi header nel manifest al build: una sola immagine
    // serve prod e sandbox, quindi l'assoluto sarebbe quello di produzione
    // anche nel container sandbox. Lo calcola `src/proxy.ts` a runtime.
    expect(headers.map((h) => h.key)).not.toContain("Reporting-Endpoints");
  });

  it("aggiunge HSTS solo in production", () => {
    const prod = buildSecurityHeaders({
      nodeEnv: "production",
    });
    const dev = buildSecurityHeaders({
      nodeEnv: "development",
    });
    const test = buildSecurityHeaders({
      nodeEnv: "test",
    });
    const undef = buildSecurityHeaders({
      nodeEnv: undefined,
    });

    expect(prod.map((h) => h.key)).toContain("Strict-Transport-Security");
    expect(dev.map((h) => h.key)).not.toContain("Strict-Transport-Security");
    expect(test.map((h) => h.key)).not.toContain("Strict-Transport-Security");
    expect(undef.map((h) => h.key)).not.toContain("Strict-Transport-Security");
  });

  it("HSTS in production ha max-age di 1 anno e includeSubDomains", () => {
    const headers = buildSecurityHeaders({
      nodeEnv: "production",
    });
    const hsts = headers.find((h) => h.key === "Strict-Transport-Security");

    expect(hsts).toBeDefined();
    expect(hsts!.value).toBe("max-age=31536000; includeSubDomains");
  });

  it("contiene la baseline X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy", () => {
    const headers = buildSecurityHeaders({
      nodeEnv: "production",
    });
    const byKey = Object.fromEntries(headers.map((h) => [h.key, h.value]));

    expect(byKey["X-Content-Type-Options"]).toBe("nosniff");
    expect(byKey["X-Frame-Options"]).toBe("DENY");
    expect(byKey["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(byKey["Permissions-Policy"]).toBe(
      "camera=(), microphone=(), geolocation=(), interest-cohort=(), bluetooth=(self)",
    );
  });

  it("consente il Bluetooth alla propria origin: la stampa termica ne dipende", () => {
    // Regressione: con `bluetooth=()` la stampa su termica smetterebbe di
    // funzionare in silenzio — `navigator.bluetooth.getAvailability()`
    // lancerebbe SecurityError e la UI direbbe solo "browser non supportato".
    const headers = buildSecurityHeaders({
      nodeEnv: "production",
    });
    const policy = headers.find((h) => h.key === "Permissions-Policy");

    expect(policy!.value).toContain("bluetooth=(self)");
  });

  it("resta indipendente dall'hostname servito", () => {
    // Nessun header di questa lista dipende più dall'origin: è la proprietà
    // che rende sicuro serializzarli al build.
    const headers = buildSecurityHeaders({ nodeEnv: "production" });

    expect(headers.every((h) => !h.value.includes("scontrinozero.it"))).toBe(
      true,
    );
  });
});
