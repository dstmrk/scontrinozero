import { describe, expect, it } from "vitest";
import { ALLOWED_SIGNUP_SOURCES, normalizeSignupSource } from "./signup-source";

describe("normalizeSignupSource", () => {
  it("returns the canonical value for an allowlisted source", () => {
    expect(normalizeSignupSource("reddit")).toBe("reddit");
    expect(normalizeSignupSource("linkedin")).toBe("linkedin");
    expect(normalizeSignupSource("producthunt")).toBe("producthunt");
  });

  it("normalises mixed-case input to lowercase", () => {
    expect(normalizeSignupSource("REDDIT")).toBe("reddit");
    expect(normalizeSignupSource("LinkedIn")).toBe("linkedin");
  });

  it("trims surrounding whitespace before validation", () => {
    expect(normalizeSignupSource("  reddit  ")).toBe("reddit");
    expect(normalizeSignupSource("\treddit\n")).toBe("reddit");
  });

  it("returns null for sources outside the allowlist", () => {
    expect(normalizeSignupSource("hacker")).toBeNull();
    expect(normalizeSignupSource("medium")).toBeNull();
    expect(normalizeSignupSource("competitor")).toBeNull();
  });

  it("returns null for empty or whitespace-only input", () => {
    expect(normalizeSignupSource("")).toBeNull();
    expect(normalizeSignupSource("   ")).toBeNull();
  });

  it("returns null for null or undefined input", () => {
    expect(normalizeSignupSource(null)).toBeNull();
    expect(normalizeSignupSource(undefined)).toBeNull();
  });

  it("returns null for input exceeding 64 chars", () => {
    expect(normalizeSignupSource("a".repeat(65))).toBeNull();
    expect(normalizeSignupSource("a".repeat(200))).toBeNull();
  });

  it("returns null for input containing non [a-z0-9_-] characters", () => {
    expect(normalizeSignupSource("reddit;DROP TABLE")).toBeNull();
    expect(normalizeSignupSource("red dit")).toBeNull();
    expect(normalizeSignupSource("reddit.com")).toBeNull();
    expect(normalizeSignupSource("red/dit")).toBeNull();
    expect(normalizeSignupSource("reddit?ref=foo")).toBeNull();
    expect(normalizeSignupSource("<script>")).toBeNull();
  });

  it("returns null for non-string input types", () => {
    expect(normalizeSignupSource(123 as unknown as string)).toBeNull();
    expect(normalizeSignupSource({} as unknown as string)).toBeNull();
    expect(normalizeSignupSource([] as unknown as string)).toBeNull();
  });

  it("exposes the allowlist as a frozen array", () => {
    expect(ALLOWED_SIGNUP_SOURCES).toContain("reddit");
    expect(ALLOWED_SIGNUP_SOURCES).toContain("indiehackers");
    expect(ALLOWED_SIGNUP_SOURCES).toContain("linkedin");
    expect(ALLOWED_SIGNUP_SOURCES).toContain("hn");
    expect(ALLOWED_SIGNUP_SOURCES).toContain("twitter");
    expect(ALLOWED_SIGNUP_SOURCES).toContain("fb");
    expect(ALLOWED_SIGNUP_SOURCES).toContain("direct");
    expect(ALLOWED_SIGNUP_SOURCES).toContain("producthunt");
  });
});
