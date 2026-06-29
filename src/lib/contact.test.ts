import { describe, it, expect } from "vitest";
import { CONTACT_EMAIL, buildSupportMailtoHref } from "./contact";

/**
 * Decodifica i parametri query di un href `mailto:` in una mappa
 * `{ subject, body }`. Tiene il test leggibile senza ripetere lo split.
 */
function parseMailto(href: string): {
  address: string;
  params: URLSearchParams;
} {
  const [scheme, query] = href.split("?");
  return {
    address: scheme,
    params: new URLSearchParams(query ?? ""),
  };
}

describe("buildSupportMailtoHref", () => {
  it("punta all'indirizzo di contatto canonico", () => {
    const href = buildSupportMailtoHref({
      accountEmail: "mario@example.com",
      plan: "pro",
      appVersion: "1.4.1",
    });

    expect(parseMailto(href).address).toBe(`mailto:${CONTACT_EMAIL}`);
  });

  it("imposta l'oggetto pre-compilato", () => {
    const href = buildSupportMailtoHref({
      accountEmail: "mario@example.com",
      plan: "pro",
      appVersion: "1.4.1",
    });

    expect(parseMailto(href).params.get("subject")).toBe(
      "Richiesta assistenza ScontrinoZero",
    );
  });

  it("pre-compila il corpo con email account, piano e versione", () => {
    const href = buildSupportMailtoHref({
      accountEmail: "mario@example.com",
      plan: "pro",
      appVersion: "1.4.1",
    });
    const body = parseMailto(href).params.get("body") ?? "";

    expect(body).toContain("mario@example.com");
    expect(body).toContain("pro");
    expect(body).toContain("1.4.1");
    expect(body).toContain("Descrizione del problema");
  });

  it("usa un segnaposto quando l'email account è assente (mai 'undefined')", () => {
    const href = buildSupportMailtoHref({
      accountEmail: null,
      plan: null,
      appVersion: "1.4.1",
    });
    const body = parseMailto(href).params.get("body") ?? "";

    expect(body).not.toContain("undefined");
    expect(body).not.toContain("null");
    expect(body).toContain("non disponibile");
  });

  it("codifica i caratteri speciali (href valido, parametri ricostruibili)", () => {
    const href = buildSupportMailtoHref({
      accountEmail: "anna+test@example.com",
      plan: "starter",
      appVersion: "1.4.1",
    });

    // Lo spazio nell'oggetto non deve comparire grezzo: deve essere
    // percent-encoded (%20) o codificato come '+'.
    expect(href).not.toContain("Richiesta assistenza");
    // La '+' nell'email non deve rompere il parsing del corpo.
    expect(parseMailto(href).params.get("body") ?? "").toContain(
      "anna+test@example.com",
    );
  });
});
