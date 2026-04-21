import { describe, it, expect } from "vitest";
import {
  adePinSchema,
  isValidEmail,
  isStrongPassword,
  isValidLotteryCode,
  normalizeEmail,
} from "./validation";

describe("adePinSchema", () => {
  const PIN_ERROR =
    "Il PIN Fisconline è composto da 10 cifre numeriche. Se ne hai solo 4, aspetta la lettera con le ultime 6 cifre per posta.";

  it("accepts exactly 10 numeric digits", () => {
    const result = adePinSchema.safeParse("1234567890");
    expect(result.success).toBe(true);
  });

  it("rejects empty string", () => {
    const result = adePinSchema.safeParse("");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(PIN_ERROR);
  });

  it("rejects 9 digits (too short by 1)", () => {
    const result = adePinSchema.safeParse("123456789");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(PIN_ERROR);
  });

  it("rejects 11 digits (too long by 1)", () => {
    const result = adePinSchema.safeParse("12345678901");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(PIN_ERROR);
  });

  it("rejects 10 characters containing a letter", () => {
    const result = adePinSchema.safeParse("123456789a");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(PIN_ERROR);
  });

  it("rejects 10 characters that are all letters", () => {
    const result = adePinSchema.safeParse("abcdefghij");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(PIN_ERROR);
  });

  it("rejects PIN with internal space (9 digits + 1 space)", () => {
    const result = adePinSchema.safeParse("12345 6789");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(PIN_ERROR);
  });

  it("rejects PIN with surrounding whitespace (schema does not trim)", () => {
    // Trimming is the caller's responsibility before safeParse
    const result = adePinSchema.safeParse(" 1234567890 ");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(PIN_ERROR);
  });

  it("rejects Arabic-Indic digits (\\d without /u flag matches only [0-9])", () => {
    // U+0660–U+0669 are Arabic-Indic numerals; \d without the u flag ignores them
    const result = adePinSchema.safeParse("٠١٢٣٤٥٦٧٨٩");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(PIN_ERROR);
  });
});

describe("isStrongPassword", () => {
  describe("valid passwords", () => {
    it.each(["Password1!", "Secure#99x", "MyP@ss1234", "Abc123!@#"])(
      "accepts %s",
      (pwd) => {
        expect(isStrongPassword(pwd)).toBe(true);
      },
    );
  });

  describe("invalid passwords", () => {
    it("rejects empty string", () => {
      expect(isStrongPassword("")).toBe(false);
    });

    it("rejects password shorter than 8 chars", () => {
      expect(isStrongPassword("Ab1!")).toBe(false);
    });

    it("rejects password without uppercase letter", () => {
      expect(isStrongPassword("password1!")).toBe(false);
    });

    it("rejects password without lowercase letter", () => {
      expect(isStrongPassword("PASSWORD1!")).toBe(false);
    });

    it("rejects password without digit", () => {
      expect(isStrongPassword("Password!")).toBe(false);
    });

    it("rejects password without special character", () => {
      expect(isStrongPassword("Password1")).toBe(false);
    });
  });
});

describe("isValidEmail", () => {
  describe("valid emails", () => {
    it.each([
      "user@example.com",
      "a@b.co",
      "user+tag@domain.co.uk",
      "first.last@company.org",
      "name@123.123.123.com",
    ])("accepts %s", (email) => {
      expect(isValidEmail(email)).toBe(true);
    });
  });

  describe("invalid emails", () => {
    it("rejects empty string", () => {
      expect(isValidEmail("")).toBe(false);
    });

    it("rejects string without @", () => {
      expect(isValidEmail("userexample.com")).toBe(false);
    });

    it("rejects nothing before @", () => {
      expect(isValidEmail("@domain.com")).toBe(false);
    });

    it("rejects nothing after @", () => {
      expect(isValidEmail("user@")).toBe(false);
    });

    it("rejects domain without dot", () => {
      expect(isValidEmail("user@domain")).toBe(false);
    });

    it("rejects email over 254 characters", () => {
      const long = "a".repeat(249) + "@b.com";
      expect(long.length).toBeGreaterThan(254);
      expect(isValidEmail(long)).toBe(false);
    });

    it("rejects email with spaces", () => {
      expect(isValidEmail("user @example.com")).toBe(false);
    });

    it("rejects multiple @ signs", () => {
      expect(isValidEmail("user@@example.com")).toBe(false);
    });
  });
});

describe("normalizeEmail", () => {
  it("lowercases uppercase email", () => {
    expect(normalizeEmail("USER@EXAMPLE.COM")).toBe("user@example.com");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalizeEmail("  user@example.com  ")).toBe("user@example.com");
  });

  it("trims and lowercases together", () => {
    expect(normalizeEmail("  JOHN@EXAMPLE.COM  ")).toBe("john@example.com");
  });

  it("leaves an already-normalised email unchanged", () => {
    expect(normalizeEmail("user@example.com")).toBe("user@example.com");
  });

  it("handles an empty string", () => {
    expect(normalizeEmail("")).toBe("");
  });
});

describe("isValidLotteryCode", () => {
  describe("valid codes", () => {
    it.each(["YYWLR30G", "ABC12345", "12345678", "ABCDEFGH"])(
      "accepts %s",
      (code) => {
        expect(isValidLotteryCode(code)).toBe(true);
      },
    );
  });

  describe("invalid codes", () => {
    it("rejects empty string", () => {
      expect(isValidLotteryCode("")).toBe(false);
    });

    it("rejects code shorter than 8 chars", () => {
      expect(isValidLotteryCode("ABC123")).toBe(false);
    });

    it("rejects code longer than 8 chars", () => {
      expect(isValidLotteryCode("ABC123456")).toBe(false);
    });

    it("rejects lowercase letters", () => {
      expect(isValidLotteryCode("abc12345")).toBe(false);
    });

    it("rejects special characters", () => {
      expect(isValidLotteryCode("ABC1234!")).toBe(false);
    });

    it("rejects spaces", () => {
      expect(isValidLotteryCode("ABC 1234")).toBe(false);
    });
  });
});
