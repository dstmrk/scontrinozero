import { describe, it, expect } from "vitest";
import { buildSecurityHeaders } from "./security-headers";

const ALLOWED_ORIGIN = "https://app.scontrinozero.it";

describe("buildSecurityHeaders", () => {
  it("imposta CSP in modalità enforce (no Report-Only)", () => {
    const headers = buildSecurityHeaders({
      nodeEnv: "production",
      allowedOrigin: ALLOWED_ORIGIN,
    });
    const cspKeys = headers.map((h) => h.key);

    expect(cspKeys).toContain("Content-Security-Policy");
    expect(cspKeys).not.toContain("Content-Security-Policy-Report-Only");
  });

  it("la CSP contiene la baseline allowlist (default-src self, object-src none)", () => {
    const headers = buildSecurityHeaders({
      nodeEnv: "production",
      allowedOrigin: ALLOWED_ORIGIN,
    });
    const csp = headers.find((h) => h.key === "Content-Security-Policy");

    expect(csp).toBeDefined();
    expect(csp!.value).toMatch(/default-src 'self'/);
    expect(csp!.value).toMatch(/object-src 'none'/);
    expect(csp!.value).toMatch(/frame-ancestors 'none'/);
  });

  it("Reporting-Endpoints usa URL assoluto basato sull'allowedOrigin", () => {
    const headers = buildSecurityHeaders({
      nodeEnv: "production",
      allowedOrigin: ALLOWED_ORIGIN,
    });
    const reporting = headers.find((h) => h.key === "Reporting-Endpoints");

    expect(reporting).toBeDefined();
    expect(reporting!.value).toBe(
      'csp-endpoint="https://app.scontrinozero.it/api/csp-report"',
    );
  });

  it("aggiunge HSTS solo in production", () => {
    const prod = buildSecurityHeaders({
      nodeEnv: "production",
      allowedOrigin: ALLOWED_ORIGIN,
    });
    const dev = buildSecurityHeaders({
      nodeEnv: "development",
      allowedOrigin: ALLOWED_ORIGIN,
    });
    const test = buildSecurityHeaders({
      nodeEnv: "test",
      allowedOrigin: ALLOWED_ORIGIN,
    });
    const undef = buildSecurityHeaders({
      nodeEnv: undefined,
      allowedOrigin: ALLOWED_ORIGIN,
    });

    expect(prod.map((h) => h.key)).toContain("Strict-Transport-Security");
    expect(dev.map((h) => h.key)).not.toContain("Strict-Transport-Security");
    expect(test.map((h) => h.key)).not.toContain("Strict-Transport-Security");
    expect(undef.map((h) => h.key)).not.toContain("Strict-Transport-Security");
  });

  it("HSTS in production ha max-age di 1 anno e includeSubDomains", () => {
    const headers = buildSecurityHeaders({
      nodeEnv: "production",
      allowedOrigin: ALLOWED_ORIGIN,
    });
    const hsts = headers.find((h) => h.key === "Strict-Transport-Security");

    expect(hsts).toBeDefined();
    expect(hsts!.value).toBe("max-age=31536000; includeSubDomains");
  });

  it("contiene la baseline X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy", () => {
    const headers = buildSecurityHeaders({
      nodeEnv: "production",
      allowedOrigin: ALLOWED_ORIGIN,
    });
    const byKey = Object.fromEntries(headers.map((h) => [h.key, h.value]));

    expect(byKey["X-Content-Type-Options"]).toBe("nosniff");
    expect(byKey["X-Frame-Options"]).toBe("DENY");
    expect(byKey["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(byKey["Permissions-Policy"]).toBe(
      "camera=(), microphone=(), geolocation=(), interest-cohort=()",
    );
  });

  it("supporta hostname sandbox e self-hosted", () => {
    const sandbox = buildSecurityHeaders({
      nodeEnv: "production",
      allowedOrigin: "https://sandbox.scontrinozero.it",
    });
    const sandboxReporting = sandbox.find(
      (h) => h.key === "Reporting-Endpoints",
    );
    expect(sandboxReporting!.value).toContain("sandbox.scontrinozero.it");

    const selfHosted = buildSecurityHeaders({
      nodeEnv: "production",
      allowedOrigin: "https://cassa.miosito.it",
    });
    const selfHostedReporting = selfHosted.find(
      (h) => h.key === "Reporting-Endpoints",
    );
    expect(selfHostedReporting!.value).toContain("cassa.miosito.it");
  });
});
