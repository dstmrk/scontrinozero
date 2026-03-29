// @vitest-environment node
import { describe, expect, it } from "vitest";
import { sanitizePdfFilename } from "@/lib/receipts/generate-pdf-response";

describe("sanitizePdfFilename (P3-01)", () => {
  it("leaves safe characters untouched", () => {
    expect(sanitizePdfFilename("2024-001")).toBe("2024-001");
  });

  it("replaces slashes with dashes", () => {
    expect(sanitizePdfFilename("2024/001")).toBe("2024-001");
    expect(sanitizePdfFilename("2024\\001")).toBe("2024-001");
  });

  it("replaces all non-whitelist characters", () => {
    const result = sanitizePdfFilename("a b\tc\x00d;e:f");
    expect(result).toMatch(/^[A-Za-z0-9._-]+$/);
  });

  it("fallback to 'scontrino' when result is empty", () => {
    expect(sanitizePdfFilename("")).toBe("scontrino");
    expect(sanitizePdfFilename("   ")).toBe("scontrino");
  });

  it("trims leading and trailing dashes", () => {
    expect(sanitizePdfFilename("---abc---")).toBe("abc");
  });

  it("truncates to 100 characters max", () => {
    const long = "a".repeat(200);
    expect(sanitizePdfFilename(long).length).toBe(100);
  });

  it("resists path traversal attempts (removes slashes)", () => {
    const result = sanitizePdfFilename("../../../etc/passwd");
    // Slashes are removed — the string becomes safe as a filename component
    expect(result).not.toContain("/");
    expect(result).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(result.length).toBeGreaterThan(0);
  });

  it("handles typical AdE progressive format", () => {
    expect(sanitizePdfFilename("000001")).toBe("000001");
    expect(sanitizePdfFilename("2024-0001")).toBe("2024-0001");
  });

  it("handles Unicode characters by replacing them", () => {
    const result = sanitizePdfFilename("caffè-001");
    expect(result).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(result.length).toBeGreaterThan(0);
  });
});
