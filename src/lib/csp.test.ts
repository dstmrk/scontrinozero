import { describe, it, expect } from "vitest";
import { buildCsp, buildReportingEndpoints, sanitizeCspViolation } from "./csp";

describe("buildCsp", () => {
  const policy = buildCsp();

  it("contiene default-src self", () => {
    expect(policy).toMatch(/default-src 'self'/);
  });

  it("autorizza Cloudflare Turnstile come script-src e frame-src", () => {
    expect(policy).toMatch(
      /script-src[^;]*\bchallenges\.cloudflare\.com\b[^;]*;/,
    );
    expect(policy).toMatch(
      /frame-src[^;]*\bhttps:\/\/challenges\.cloudflare\.com\b[^;]*;/,
    );
  });

  it("autorizza Supabase REST e WebSocket in connect-src", () => {
    expect(policy).toMatch(
      /connect-src[^;]*\bhttps:\/\/\*\.supabase\.co\b[^;]*;/,
    );
    expect(policy).toMatch(
      /connect-src[^;]*\bwss:\/\/\*\.supabase\.co\b[^;]*;/,
    );
  });

  it("autorizza Sentry ingest in connect-src", () => {
    expect(policy).toMatch(
      /connect-src[^;]*\bhttps:\/\/\*\.ingest\.sentry\.io\b[^;]*;/,
    );
  });

  it("permette inline + data: per immagini, font e style (Tailwind/Radix)", () => {
    expect(policy).toMatch(/img-src[^;]*\bdata:[^;]*;/);
    expect(policy).toMatch(/font-src[^;]*\bdata:[^;]*;/);
    expect(policy).toMatch(/style-src[^;]*'unsafe-inline'[^;]*;/);
  });

  it("ammette unsafe-inline su script-src per i payload JSON-LD escaped", () => {
    // Mitigato da safeJsonLd() (escape <>&) e dal fatto che TUTTI i payload
    // JSON-LD sono statici a build time. Follow-up B14b per nonce/hash.
    expect(policy).toMatch(/script-src[^;]*'unsafe-inline'[^;]*;/);
  });

  it("blocca completamente i frame ancestors e gli object", () => {
    expect(policy).toMatch(/frame-ancestors 'none'/);
    expect(policy).toMatch(/object-src 'none'/);
  });

  it("punta /api/csp-report come report-uri e dichiara report-to", () => {
    expect(policy).toMatch(/report-uri \/api\/csp-report/);
    expect(policy).toMatch(/report-to csp-endpoint/);
  });

  it("non contiene direttive vuote o separatori duplicati", () => {
    // Consentite singole spaziature; nessun ";;" e nessun "; ;"
    expect(policy).not.toMatch(/;\s*;/);
    // Ogni segmento (split su ";") deve avere almeno 2 token: direttiva + valore
    for (const segment of policy.split(";").map((s) => s.trim())) {
      if (segment.length === 0) continue;
      expect(segment.split(/\s+/).length).toBeGreaterThanOrEqual(2);
    }
  });

  it("è deterministico tra invocazioni successive (snapshot regression)", () => {
    expect(buildCsp()).toBe(policy);
  });
});

describe("buildReportingEndpoints", () => {
  it("usa URL assoluto come richiesto dalla Reporting API", () => {
    const value = buildReportingEndpoints("https://app.scontrinozero.it");
    expect(value).toBe(
      'csp-endpoint="https://app.scontrinozero.it/api/csp-report"',
    );
  });

  it("rimuove la trailing slash dalla base URL", () => {
    const value = buildReportingEndpoints("https://app.scontrinozero.it/");
    expect(value).toBe(
      'csp-endpoint="https://app.scontrinozero.it/api/csp-report"',
    );
  });

  it("supporta hostname sandbox e custom (self-hosted)", () => {
    expect(buildReportingEndpoints("https://sandbox.scontrinozero.it")).toBe(
      'csp-endpoint="https://sandbox.scontrinozero.it/api/csp-report"',
    );
    expect(buildReportingEndpoints("https://cassa.miosito.it")).toBe(
      'csp-endpoint="https://cassa.miosito.it/api/csp-report"',
    );
  });

  it("non concatena URL malformata se manca lo schema (caller deve passare absolute)", () => {
    // Documenta il contratto: il caller (next.config.ts) è responsabile di
    // passare un URL assoluto. La funzione non normalizza/valida lo schema.
    const value = buildReportingEndpoints("scontrinozero.it");
    expect(value).toBe('csp-endpoint="scontrinozero.it/api/csp-report"');
  });
});

describe("sanitizeCspViolation", () => {
  it("conserva solo i campi safe della legacy report", () => {
    const raw = {
      "blocked-uri": "https://evil.example/script.js",
      "document-uri": "https://scontrinozero.it/dashboard",
      "violated-directive": "script-src",
      "effective-directive": "script-src-elem",
      "original-policy": "default-src 'self'; ...",
      referrer: "https://google.com",
      disposition: "report",
      "status-code": 200,
      // campi non in allowlist — devono essere strippati
      "source-file": "/etc/passwd",
      "script-sample": "any private code here",
      "line-number": 42,
    };
    const out = sanitizeCspViolation(raw);
    expect(out).toEqual({
      blockedUri: "https://evil.example/script.js",
      documentUri: "https://scontrinozero.it/dashboard",
      violatedDirective: "script-src",
      effectiveDirective: "script-src-elem",
      originalPolicy: "default-src 'self'; ...",
      referrer: "https://google.com",
      disposition: "report",
      statusCode: 200,
    });
  });

  it("conserva i campi safe della Reporting API (camelCase nativo)", () => {
    const raw = {
      blockedURL: "https://evil.example/script.js",
      documentURL: "https://scontrinozero.it/",
      violatedDirective: "script-src",
      effectiveDirective: "script-src-elem",
      originalPolicy: "default-src 'self'",
      referrer: "",
      disposition: "report",
      statusCode: 200,
      sourceFile: "/leak/me",
      sample: "private",
    };
    const out = sanitizeCspViolation(raw);
    expect(out.blockedUri).toBe("https://evil.example/script.js");
    expect(out.documentUri).toBe("https://scontrinozero.it/");
    expect(out).not.toHaveProperty("sourceFile");
    expect(out).not.toHaveProperty("sample");
  });

  it("tronca URL > 1024 byte per evitare log bombing", () => {
    const longUri = "https://evil.example/" + "a".repeat(2000);
    const out = sanitizeCspViolation({ "blocked-uri": longUri });
    expect(typeof out.blockedUri).toBe("string");
    expect((out.blockedUri as string).length).toBeLessThanOrEqual(1024);
  });

  it("ritorna oggetto vuoto su input non-oggetto", () => {
    expect(sanitizeCspViolation(null)).toEqual({});
    expect(sanitizeCspViolation(undefined)).toEqual({});
    expect(sanitizeCspViolation("string")).toEqual({});
    expect(sanitizeCspViolation(42)).toEqual({});
  });

  it("scarta valori non-stringa/non-numero per chiavi stringa attese", () => {
    const out = sanitizeCspViolation({
      "blocked-uri": { malicious: "object" },
      "violated-directive": ["array"],
      "status-code": 200,
    });
    expect(out).not.toHaveProperty("blockedUri");
    expect(out).not.toHaveProperty("violatedDirective");
    expect(out.statusCode).toBe(200);
  });
});
