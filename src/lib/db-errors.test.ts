import { describe, expect, it } from "vitest";

import { isUniqueConstraintViolation } from "./db-errors";

describe("isUniqueConstraintViolation", () => {
  it("returns true for objects with code '23505'", () => {
    expect(isUniqueConstraintViolation({ code: "23505" })).toBe(true);
  });

  it("returns true for Error-like objects with code '23505'", () => {
    const err = Object.assign(new Error("duplicate key"), { code: "23505" });
    expect(isUniqueConstraintViolation(err)).toBe(true);
  });

  it("returns false for a different Postgres error code (FK violation 23503)", () => {
    expect(isUniqueConstraintViolation({ code: "23503" })).toBe(false);
  });

  it("returns false when the object has no code property", () => {
    expect(isUniqueConstraintViolation({ message: "boom" })).toBe(false);
  });

  it("returns false for non-object inputs", () => {
    expect(isUniqueConstraintViolation(null)).toBe(false);
    expect(isUniqueConstraintViolation(undefined)).toBe(false);
    expect(isUniqueConstraintViolation("23505")).toBe(false);
    expect(isUniqueConstraintViolation(23505)).toBe(false);
  });

  it("returns false when code is not the string '23505'", () => {
    expect(isUniqueConstraintViolation({ code: 23505 })).toBe(false);
  });
});
