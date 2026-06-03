import { describe, expect, it } from "vitest";
import { isValidUuid } from "./uuid";

describe("isValidUuid", () => {
  it("accepts a canonical lowercase v4 UUID", () => {
    expect(isValidUuid("123e4567-e89b-42d3-a456-426614174000")).toBe(true);
  });

  it("accepts an uppercase UUID (regex is case-insensitive)", () => {
    expect(isValidUuid("123E4567-E89B-42D3-A456-426614174000")).toBe(true);
  });

  it("accepts UUIDs regardless of version/variant digits matching the shape", () => {
    expect(isValidUuid("00000000-0000-0000-0000-000000000000")).toBe(true);
    expect(isValidUuid("ffffffff-ffff-ffff-ffff-ffffffffffff")).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(isValidUuid("")).toBe(false);
  });

  it("rejects a UUID without hyphens", () => {
    expect(isValidUuid("123e4567e89b42d3a456426614174000")).toBe(false);
  });

  it("rejects a value that is too short", () => {
    expect(isValidUuid("123e4567-e89b-42d3-a456-4266141740")).toBe(false);
  });

  it("rejects a value that is too long", () => {
    expect(isValidUuid("123e4567-e89b-42d3-a456-426614174000-extra")).toBe(
      false,
    );
  });

  it("rejects non-hex characters", () => {
    expect(isValidUuid("123e4567-e89b-42d3-a456-42661417400g")).toBe(false);
  });

  it("rejects a UUID with surrounding whitespace (no anchoring slack)", () => {
    expect(isValidUuid(" 123e4567-e89b-42d3-a456-426614174000 ")).toBe(false);
  });

  it("rejects misplaced hyphens", () => {
    expect(isValidUuid("123e456-7e89b-42d3-a456-426614174000")).toBe(false);
  });
});
