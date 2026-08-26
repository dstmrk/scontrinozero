// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { isAdminEmail, parseAdminEmails } from "./admin-gate";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("parseAdminEmails", () => {
  it("ritorna un set vuoto quando la env è assente (fail-closed)", () => {
    expect(parseAdminEmails(undefined).size).toBe(0);
  });

  it("ritorna un set vuoto quando la env è presente ma vuota (regola 18)", () => {
    expect(parseAdminEmails("").size).toBe(0);
    expect(parseAdminEmails("   ").size).toBe(0);
  });

  it("normalizza case e spazi di ogni voce", () => {
    const set = parseAdminEmails("  Marco@ScontrinoZero.it , ops@example.com ");

    expect([...set]).toEqual(["marco@scontrinozero.it", "ops@example.com"]);
  });

  it("scarta le voci vuote prodotte da virgole doppie o finali", () => {
    const set = parseAdminEmails("a@b.it,,c@d.it,");

    expect([...set]).toEqual(["a@b.it", "c@d.it"]);
  });

  it("scarta le voci che non sono indirizzi email", () => {
    const set = parseAdminEmails("a@b.it,non-una-email,@b.it,c@");

    expect([...set]).toEqual(["a@b.it"]);
  });
});

describe("isAdminEmail", () => {
  it("è false quando ADMIN_EMAILS non è configurata", () => {
    vi.stubEnv("ADMIN_EMAILS", "");

    expect(isAdminEmail("marco@scontrinozero.it")).toBe(false);
  });

  it("è true per un indirizzo nell'allowlist, a prescindere dal case", () => {
    vi.stubEnv("ADMIN_EMAILS", "marco@scontrinozero.it");

    expect(isAdminEmail("  MARCO@scontrinozero.IT ")).toBe(true);
  });

  it("è false per un indirizzo fuori allowlist", () => {
    vi.stubEnv("ADMIN_EMAILS", "marco@scontrinozero.it");

    expect(isAdminEmail("mallory@example.com")).toBe(false);
  });

  it("è false per email assente o vuota", () => {
    vi.stubEnv("ADMIN_EMAILS", "marco@scontrinozero.it");

    expect(isAdminEmail(undefined)).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail("")).toBe(false);
  });

  it("rilegge la env a ogni chiamata invece di memoizzarla al primo import", () => {
    vi.stubEnv("ADMIN_EMAILS", "");
    expect(isAdminEmail("marco@scontrinozero.it")).toBe(false);

    vi.stubEnv("ADMIN_EMAILS", "marco@scontrinozero.it");
    expect(isAdminEmail("marco@scontrinozero.it")).toBe(true);
  });
});
