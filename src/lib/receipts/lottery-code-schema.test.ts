// @vitest-environment node
import { describe, expect, it } from "vitest";
import { z } from "zod/v4";
import { LOTTERY_CODE_REGEX, refineLotteryCode } from "./lottery-code-schema";

const schema = z
  .object({
    paymentMethod: z.enum(["PC", "PE"]),
    lotteryCode: z.string().nullable().optional(),
  })
  .superRefine(refineLotteryCode);

describe("LOTTERY_CODE_REGEX", () => {
  it("accetta esattamente 8 caratteri [A-Z0-9]", () => {
    expect(LOTTERY_CODE_REGEX.test("ABC12345")).toBe(true);
  });

  it("rifiuta minuscolo, lunghezza errata, caratteri speciali, vuoto", () => {
    expect(LOTTERY_CODE_REGEX.test("abc12345")).toBe(false);
    expect(LOTTERY_CODE_REGEX.test("ABC1234")).toBe(false);
    expect(LOTTERY_CODE_REGEX.test("ABC-2345")).toBe(false);
    expect(LOTTERY_CODE_REGEX.test("")).toBe(false);
  });
});

describe("refineLotteryCode (via superRefine)", () => {
  it("PE + lotteryCode valido → success", () => {
    const r = schema.safeParse({
      paymentMethod: "PE",
      lotteryCode: "ABC12345",
    });
    expect(r.success).toBe(true);
  });

  it("PE + lotteryCode malformato → error con path corretto", () => {
    const r = schema.safeParse({
      paymentMethod: "PE",
      lotteryCode: "garbage",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].path).toEqual(["lotteryCode"]);
      expect(r.error.issues[0].message).toMatch(/lotteria/i);
    }
  });

  it("PE + lotteryCode null → success (campo opzionale)", () => {
    const r = schema.safeParse({ paymentMethod: "PE", lotteryCode: null });
    expect(r.success).toBe(true);
  });

  it("PC + lotteryCode malformato → success (validazione skippata)", () => {
    // Backward compat: il service layer ignora il valore per PC.
    const r = schema.safeParse({
      paymentMethod: "PC",
      lotteryCode: "garbage-value",
    });
    expect(r.success).toBe(true);
  });

  it("PC + lotteryCode assente → success", () => {
    const r = schema.safeParse({ paymentMethod: "PC" });
    expect(r.success).toBe(true);
  });
});
