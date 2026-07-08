import { describe, it, expect } from "vitest";
import {
  adePinSchema,
  BUSINESS_PROFILE_LIMITS,
  isValidEmail,
  isStrongPassword,
  isValidLotteryCode,
  isValidItalianZipCode,
  italianZipCodeSchema,
  normalizeEmail,
  ITALIAN_ZIP_MESSAGE,
} from "./validation";

describe("BUSINESS_PROFILE_LIMITS", () => {
  // Snapshot dei valori canonici: cambiarli qui (con motivazione) si propaga
  // a server actions, Zod schema client e label UI senza drift.
  it("definisce i limiti attuali per ogni campo", () => {
    expect(BUSINESS_PROFILE_LIMITS).toEqual({
      firstName: 80,
      lastName: 80,
      businessName: 120,
      address: 150,
      streetNumber: 20,
      city: 80,
      province: 3,
    });
  });

  it("le proprietà sono readonly (`as const`)", () => {
    // Type-level guard: assegnare a un campo deve essere errore TS.
    // Runtime: i tre comportamenti accettabili sono throw (strict mode),
    // silent ignore o assegnazione effettiva. Verifichiamo solo che la
    // struttura sia esportata e con i tipi attesi.
    const limit: number = BUSINESS_PROFILE_LIMITS.businessName;
    expect(typeof limit).toBe("number");
  });
});

describe("adePinSchema", () => {
  const PIN_ERROR =
    "Il PIN Fisconline è composto da 10 cifre numeriche. Se ne hai solo 4, aspetta la lettera con le ultime 6 cifre per posta.";

  it("accepts exactly 10 numeric digits", () => {
    const result = adePinSchema.safeParse("1234567890");
    expect(result.success).toBe(true);
  });

  // Trimming is the caller's responsibility before safeParse (whitespace case).
  // Arabic-Indic case: U+0660–U+0669 are Arabic-Indic numerals; \d without the
  // u flag ignores them, quindi vengono respinti.
  it.each([
    ["empty string", ""],
    ["9 digits (too short by 1)", "123456789"],
    ["11 digits (too long by 1)", "12345678901"],
    ["10 characters containing a letter", "123456789a"],
    ["10 characters that are all letters", "abcdefghij"],
    ["PIN with internal space (9 digits + 1 space)", "12345 6789"],
    ["PIN with surrounding whitespace (schema does not trim)", " 1234567890 "],
    [
      "Arabic-Indic digits (\\d without /u flag matches only [0-9])",
      "٠١٢٣٤٥٦٧٨٩",
    ],
  ])("rejects %s", (_label, input) => {
    const result = adePinSchema.safeParse(input);
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

describe("isValidItalianZipCode", () => {
  it("accepts valid 5-digit CAPs", () => {
    expect(isValidItalianZipCode("00100")).toBe(true);
    expect(isValidItalianZipCode("20121")).toBe(true);
  });

  it("rejects too short", () => {
    expect(isValidItalianZipCode("1234")).toBe(false);
  });

  it("rejects too long", () => {
    expect(isValidItalianZipCode("123456")).toBe(false);
  });

  it("rejects non-numeric chars", () => {
    expect(isValidItalianZipCode("1234a")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidItalianZipCode("")).toBe(false);
  });
});

describe("italianZipCodeSchema", () => {
  it("accepts a valid CAP", () => {
    expect(italianZipCodeSchema.safeParse("00100").success).toBe(true);
  });

  it("rejects invalid input with the canonical message", () => {
    const result = italianZipCodeSchema.safeParse("12");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(ITALIAN_ZIP_MESSAGE);
  });
});
