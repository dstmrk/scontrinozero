import { afterEach, describe, expect, it, vi } from "vitest";

import { extractPartnerSlug, getAppHostname } from "./partner-host";

const PROD_APP = "app.scontrinozero.it";
const DEV_APP = "app-dev.scontrinozero.it";

describe("extractPartnerSlug", () => {
  it("extracts the slug from a partner subdomain", () => {
    expect(extractPartnerSlug("nds-app.scontrinozero.it", PROD_APP)).toBe(
      "nds",
    );
  });

  it("returns null for the bare app hostname", () => {
    expect(extractPartnerSlug("app.scontrinozero.it", PROD_APP)).toBeNull();
  });

  it("returns null for the marketing/apex hostname", () => {
    expect(extractPartnerSlug("scontrinozero.it", PROD_APP)).toBeNull();
  });

  it("does NOT treat the dev app hostname as a partner of the prod app", () => {
    // app-dev.scontrinozero.it must never resolve to slug "app" / "dev".
    expect(extractPartnerSlug(DEV_APP, PROD_APP)).toBeNull();
  });

  it("extracts a partner slug on the dev app hostname", () => {
    expect(extractPartnerSlug("nds-app-dev.scontrinozero.it", DEV_APP)).toBe(
      "nds",
    );
    // The dev app host itself is not a partner.
    expect(extractPartnerSlug(DEV_APP, DEV_APP)).toBeNull();
  });

  it("strips the port from the Host header", () => {
    expect(extractPartnerSlug("nds-app.scontrinozero.it:3000", PROD_APP)).toBe(
      "nds",
    );
  });

  it("lowercases the host before matching", () => {
    expect(extractPartnerSlug("NDS-App.ScontrinoZero.it", PROD_APP)).toBe(
      "nds",
    );
  });

  it("rejects a dotted (nested) slug to prevent subdomain abuse", () => {
    expect(extractPartnerSlug("a.b-app.scontrinozero.it", PROD_APP)).toBeNull();
  });

  it("rejects an empty slug", () => {
    expect(extractPartnerSlug("-app.scontrinozero.it", PROD_APP)).toBeNull();
  });

  it("rejects a slug with invalid hostname characters", () => {
    expect(
      extractPartnerSlug("nd s-app.scontrinozero.it", PROD_APP),
    ).toBeNull();
    expect(
      extractPartnerSlug("nd_s-app.scontrinozero.it", PROD_APP),
    ).toBeNull();
  });

  it("rejects a slug with a leading hyphen", () => {
    expect(extractPartnerSlug("-x-app.scontrinozero.it", PROD_APP)).toBeNull();
  });

  it.each([null, undefined, ""])("returns null for empty host %s", (host) => {
    expect(extractPartnerSlug(host, PROD_APP)).toBeNull();
  });

  it("derives the app hostname from env when not passed explicitly", () => {
    vi.stubEnv("APP_HOSTNAME", PROD_APP);
    expect(extractPartnerSlug("nds-app.scontrinozero.it")).toBe("nds");
    vi.unstubAllEnvs();
  });
});

describe("getAppHostname", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("defaults to the production app hostname with no env", () => {
    vi.stubEnv("APP_HOSTNAME", "");
    vi.stubEnv("NEXT_PUBLIC_APP_HOSTNAME", "");
    expect(getAppHostname()).toBe(PROD_APP);
  });

  it("prefers APP_HOSTNAME (runtime override)", () => {
    vi.stubEnv("APP_HOSTNAME", "sandbox.scontrinozero.it");
    vi.stubEnv("NEXT_PUBLIC_APP_HOSTNAME", PROD_APP);
    expect(getAppHostname()).toBe("sandbox.scontrinozero.it");
  });

  it("falls back to NEXT_PUBLIC_APP_HOSTNAME when APP_HOSTNAME is empty", () => {
    // Empty-safe (regola 18): present-but-empty must NOT win over the baked value.
    vi.stubEnv("APP_HOSTNAME", "");
    vi.stubEnv("NEXT_PUBLIC_APP_HOSTNAME", DEV_APP);
    expect(getAppHostname()).toBe(DEV_APP);
  });

  it("normalises case and whitespace", () => {
    vi.stubEnv("APP_HOSTNAME", "  App-Dev.ScontrinoZero.it  ");
    expect(getAppHostname()).toBe(DEV_APP);
  });
});
