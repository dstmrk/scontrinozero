/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import {
  generateApiKey,
  hashApiKey,
  isManagementKey,
  isValidApiKeyFormat,
} from "./api-keys";

describe("generateApiKey", () => {
  it("genera una business key con prefisso corretto", () => {
    const { raw, hash, prefix } = generateApiKey("business");

    expect(raw).toMatch(/^szk_live_/);
    expect(hash).toHaveLength(64); // SHA-256 hex
    expect(prefix).toBe(raw.slice(0, 12));
    expect(prefix).toBe("szk_live_XXX".replace("XXX", raw.slice(9, 12)));
  });

  it("genera una management key con prefisso corretto", () => {
    const { raw, hash, prefix } = generateApiKey("management");

    expect(raw).toMatch(/^szk_mgmt_/);
    expect(hash).toHaveLength(64);
    expect(prefix).toBe(raw.slice(0, 12));
  });

  it("la raw key è lunga ~57 caratteri", () => {
    const { raw } = generateApiKey("business");
    // szk_live_ (9) + base64url(36 bytes) (48) = 57
    expect(raw).toHaveLength(57);
  });

  it("genera chiavi uniche ad ogni chiamata", () => {
    const k1 = generateApiKey("business");
    const k2 = generateApiKey("business");

    expect(k1.raw).not.toBe(k2.raw);
    expect(k1.hash).not.toBe(k2.hash);
  });

  it("hash e prefix sono derivati dalla raw key", () => {
    const { raw, hash, prefix } = generateApiKey("business");

    expect(hashApiKey(raw)).toBe(hash);
    expect(raw.startsWith(prefix)).toBe(true);
  });
});

describe("hashApiKey", () => {
  it("produce sempre lo stesso hash per la stessa input", () => {
    const raw = "szk_live_testkey12345";
    expect(hashApiKey(raw)).toBe(hashApiKey(raw));
  });

  it("produce hash diversi per input diverse", () => {
    expect(hashApiKey("szk_live_A")).not.toBe(hashApiKey("szk_live_B"));
  });

  it("l'hash è in formato hex a 64 caratteri (SHA-256)", () => {
    const hash = hashApiKey("szk_live_any");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("isManagementKey", () => {
  it("ritorna true per management key", () => {
    expect(isManagementKey("szk_mgmt_XXXXXXXX")).toBe(true);
  });

  it("ritorna false per business key", () => {
    expect(isManagementKey("szk_live_XXXXXXXX")).toBe(false);
  });

  it("ritorna false per stringa arbitraria", () => {
    expect(isManagementKey("Bearer token")).toBe(false);
    expect(isManagementKey("")).toBe(false);
  });
});

describe("isValidApiKeyFormat", () => {
  it("accetta business key", () => {
    expect(isValidApiKeyFormat("szk_live_XXXXXXXX")).toBe(true);
  });

  it("accetta management key", () => {
    expect(isValidApiKeyFormat("szk_mgmt_XXXXXXXX")).toBe(true);
  });

  it("rifiuta formato non valido", () => {
    expect(isValidApiKeyFormat("sk_live_stripe")).toBe(false);
    expect(isValidApiKeyFormat("szk_XXXXXXXX")).toBe(false);
    expect(isValidApiKeyFormat("")).toBe(false);
    expect(isValidApiKeyFormat("Bearer szk_live_X")).toBe(false);
  });
});
