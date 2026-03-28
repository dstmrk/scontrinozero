// @vitest-environment node
import { describe, expect, it } from "vitest";

import { isValidUuid } from "@/lib/uuid";

describe("isValidUuid", () => {
  it("returns true for a valid UUID v4", () => {
    expect(isValidUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("returns true for another valid UUID v4", () => {
    expect(isValidUuid("123e4567-e89b-12d3-a456-426614174000")).toBe(true);
  });

  it("returns false for an empty string", () => {
    expect(isValidUuid("")).toBe(false);
  });

  it("returns false for a plain string", () => {
    expect(isValidUuid("not-a-uuid")).toBe(false);
  });

  it("returns false for a UUID with wrong length", () => {
    expect(isValidUuid("550e8400-e29b-41d4-a716-44665544000")).toBe(false);
  });

  it("returns false for a UUID with wrong group count", () => {
    expect(isValidUuid("550e8400e29b41d4a716446655440000")).toBe(false);
  });

  it("returns false for a UUID with invalid characters", () => {
    expect(isValidUuid("550e8400-e29b-41d4-a716-44665544000z")).toBe(false);
  });

  it("returns false for a SQL injection string", () => {
    expect(isValidUuid("'; DROP TABLE documents; --")).toBe(false);
  });

  it("returns false for a numeric string", () => {
    expect(isValidUuid("12345")).toBe(false);
  });

  it("returns false for undefined cast as string", () => {
    expect(isValidUuid("undefined")).toBe(false);
  });
});
