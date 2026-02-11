import { describe, it, expect } from "vitest";
import { isValidEmail } from "./validation";

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
