import { describe, expect, it } from "vitest";
import { validateLotteryCode } from "./lotteria";

describe("validateLotteryCode", () => {
  it("accetta 8 caratteri alfanumerici maiuscoli", () => {
    expect(validateLotteryCode("ABCD1234").ok).toBe(true);
    expect(validateLotteryCode("12345678").ok).toBe(true);
    expect(validateLotteryCode("ABCDEFGH").ok).toBe(true);
    expect(validateLotteryCode("A1B2C3D4").ok).toBe(true);
  });

  it("rifiuta lunghezze diverse da 8", () => {
    const short = validateLotteryCode("ABCD123");
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.error).toMatch(/8 caratteri/i);

    expect(validateLotteryCode("ABCD12345").ok).toBe(false);
    expect(validateLotteryCode("").ok).toBe(false);
  });

  it("rifiuta lettere minuscole", () => {
    const lower = validateLotteryCode("abcd1234");
    expect(lower.ok).toBe(false);
    if (!lower.ok) expect(lower.error).toMatch(/maiuscoli|A-Z/i);
  });

  it("rifiuta caratteri speciali", () => {
    expect(validateLotteryCode("ABCD-234").ok).toBe(false);
    expect(validateLotteryCode("ABCD 234").ok).toBe(false);
    expect(validateLotteryCode("ABCD_234").ok).toBe(false);
    expect(validateLotteryCode("ABCD!234").ok).toBe(false);
  });

  it("tollera whitespace ai bordi (trim implicito)", () => {
    expect(validateLotteryCode("  ABCD1234  ").ok).toBe(true);
    expect(validateLotteryCode("\tABCD1234\n").ok).toBe(true);
  });

  it("rifiuta whitespace interno", () => {
    expect(validateLotteryCode("ABCD 1234").ok).toBe(false);
  });

  it("ritorna il codice normalizzato (trimmed) sul successo", () => {
    const result = validateLotteryCode("  ABCD1234  ");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.code).toBe("ABCD1234");
  });

  it("non auto-uppercase: codice in minuscolo è errore esplicito", () => {
    const result = validateLotteryCode("abcd1234");
    expect(result.ok).toBe(false);
  });

  it("rifiuta input non-stringa (defense in depth)", () => {
    // simulate user passing non-string from form
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = validateLotteryCode(null as any);
    expect(result.ok).toBe(false);
  });
});
