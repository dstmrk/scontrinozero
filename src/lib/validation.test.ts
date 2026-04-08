import { describe, it, expect } from "vitest";
import {
  isValidEmail,
  isStrongPassword,
  isValidLotteryCode,
  normalizeEmail,
} from "./validation";

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
