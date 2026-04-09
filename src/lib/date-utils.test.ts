import { describe, expect, it } from "vitest";
import { getFiscalDate } from "./date-utils";

describe("getFiscalDate", () => {
  it("returns YYYY-MM-DD format", () => {
    const result = getFiscalDate(new Date("2026-06-15T10:00:00Z"));
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns the correct day for a midday timestamp in Europe/Rome", () => {
    // 2026-06-15 12:00 UTC = 2026-06-15 14:00 CEST (Rome) → same day
    const result = getFiscalDate(new Date("2026-06-15T12:00:00Z"));
    expect(result).toBe("2026-06-15");
  });

  it("returns the Rome day, not UTC day, for a timestamp just past midnight UTC", () => {
    // 2026-06-15 00:30:00 UTC = 2026-06-15 02:30 CEST (Rome) → still June 15
    // Without timezone awareness this would be correct by coincidence,
    // but the critical case is the reverse:
    // 2026-06-14 23:00 UTC = 2026-06-15 01:00 CEST (Rome)
    // UTC day is Jun 14, Rome day is Jun 15 — we want Rome's day.
    const result = getFiscalDate(
      new Date("2026-06-14T23:00:00Z"),
      "Europe/Rome",
    );
    expect(result).toBe("2026-06-15");
  });

  it("returns the UTC day when UTC is explicitly specified", () => {
    // The same instant above in UTC should give Jun 14 when tz=UTC
    const result = getFiscalDate(new Date("2026-06-14T23:00:00Z"), "UTC");
    expect(result).toBe("2026-06-14");
  });

  it("defaults to Europe/Rome timezone", () => {
    // 2026-01-01 00:30 UTC = 2026-01-01 01:30 CET (Rome) → Jan 1 in Rome
    // (in winter Rome is UTC+1, so this is within Jan 1 Rome time)
    const withDefault = getFiscalDate(new Date("2026-01-01T00:30:00Z"));
    const withExplicit = getFiscalDate(
      new Date("2026-01-01T00:30:00Z"),
      "Europe/Rome",
    );
    expect(withDefault).toBe(withExplicit);
  });

  it("defaults date to now when called with no arguments", () => {
    const before = new Date();
    const result = getFiscalDate();
    const after = new Date();
    // The result must be within the date range spanned by before..after
    const expectedDates = new Set([
      getFiscalDate(before),
      getFiscalDate(after),
    ]);
    expect(expectedDates.has(result)).toBe(true);
  });

  it("handles DST boundary: 2026-10-25 00:30 UTC is Oct 24 23:30 CEST but Oct 25 01:30 CET", () => {
    // DST ends in Europe/Rome on 2026-10-25 (clocks go back at 03:00 CEST → 02:00 CET)
    // 2026-10-24 22:30 UTC = 2026-10-25 00:30 CEST → Oct 25 in Rome
    const result = getFiscalDate(
      new Date("2026-10-24T22:30:00Z"),
      "Europe/Rome",
    );
    expect(result).toBe("2026-10-25");
  });
});
