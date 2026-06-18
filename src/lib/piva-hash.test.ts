import { afterEach, describe, expect, it, vi } from "vitest";
import { hashPiva } from "./piva-hash";

const SECRET = "test-piva-hash-secret-0123456789abcdef";

describe("hashPiva", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("è deterministico: stessa P.IVA + stesso secret → stesso hash", () => {
    vi.stubEnv("PIVA_HASH_SECRET", SECRET);
    expect(hashPiva("12345678901")).toBe(hashPiva("12345678901"));
  });

  it("produce un digest esadecimale SHA-256 (64 caratteri hex)", () => {
    vi.stubEnv("PIVA_HASH_SECRET", SECRET);
    expect(hashPiva("12345678901")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("P.IVA diverse producono hash diversi", () => {
    vi.stubEnv("PIVA_HASH_SECRET", SECRET);
    expect(hashPiva("12345678901")).not.toBe(hashPiva("10987654321"));
  });

  it("normalizza spazi interni e di contorno (stesso hash)", () => {
    vi.stubEnv("PIVA_HASH_SECRET", SECRET);
    expect(hashPiva("  123 456 78901 ")).toBe(hashPiva("12345678901"));
  });

  it("normalizza il case (uppercase) per P.IVA con lettere", () => {
    vi.stubEnv("PIVA_HASH_SECRET", SECRET);
    expect(hashPiva("it12345678901")).toBe(hashPiva("IT12345678901"));
  });

  it("il secret influenza l'output: secret diverso → hash diverso", () => {
    vi.stubEnv("PIVA_HASH_SECRET", SECRET);
    const a = hashPiva("12345678901");
    vi.stubEnv("PIVA_HASH_SECRET", "un-secret-completamente-diverso");
    const b = hashPiva("12345678901");
    expect(a).not.toBe(b);
  });

  it("in produzione lancia se il secret è assente", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PIVA_HASH_SECRET", "");
    expect(() => hashPiva("12345678901")).toThrow(/PIVA_HASH_SECRET/);
  });

  it("in produzione lancia se il secret è solo whitespace (present-but-empty)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PIVA_HASH_SECRET", "   ");
    expect(() => hashPiva("12345678901")).toThrow(/PIVA_HASH_SECRET/);
  });

  it("fuori produzione usa un fallback e non lancia se il secret è assente", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("PIVA_HASH_SECRET", "");
    expect(hashPiva("12345678901")).toMatch(/^[0-9a-f]{64}$/);
  });
});
