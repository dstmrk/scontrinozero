import { describe, expect, it } from "vitest";
import {
  getFiscalDate,
  parseStrictIsoDateUtc,
  formatFiscalDateTime,
  formatIsoInRome,
} from "./date-utils";

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

describe("formatFiscalDateTime", () => {
  it("shows the Europe/Rome day, not UTC day, for a timestamp just past midnight UTC (winter, UTC+1)", () => {
    // 2026-12-31T23:30:00Z = 2027-01-01T00:30:00 CET (UTC+1)
    // A UTC-only formatter would show Dec 31; Rome-aware must show Jan 1 2027.
    const result = formatFiscalDateTime(new Date("2026-12-31T23:30:00Z"));
    expect(result).toContain("01");
    expect(result).toContain("2027");
  });

  it("shows the Europe/Rome day and hour for a timestamp just past midnight UTC (summer, UTC+2)", () => {
    // 2026-07-15T22:30:00Z = 2026-07-16T00:30:00 CEST (UTC+2)
    // UTC-only formatter would show July 15; Rome-aware must show July 16.
    const result = formatFiscalDateTime(new Date("2026-07-15T22:30:00Z"));
    expect(result).toContain("16");
    expect(result).toContain("07");
    expect(result).toContain("2026");
  });

  it("returns the Italy time for a midday UTC timestamp (no ambiguity)", () => {
    // 2026-02-15T12:30:00Z = 2026-02-15T13:30:00 CET (UTC+1)
    const result = formatFiscalDateTime(new Date("2026-02-15T12:30:00Z"));
    expect(result).toContain("15");
    expect(result).toContain("02");
    expect(result).toContain("2026");
    // The Rome hour (13) must appear, not the UTC hour (12)
    expect(result).toContain("13");
  });
});

describe("formatIsoInRome", () => {
  it("returns ISO 8601 with +02:00 offset in summer (CEST)", () => {
    // 2026-05-19T12:34:56.789Z → Rome CEST (UTC+2) → 14:34:56+02:00
    expect(formatIsoInRome(new Date("2026-05-19T12:34:56.789Z"))).toBe(
      "2026-05-19T14:34:56+02:00",
    );
  });

  it("returns ISO 8601 with +01:00 offset in winter (CET)", () => {
    // 2026-01-15T12:34:56Z → Rome CET (UTC+1) → 13:34:56+01:00
    expect(formatIsoInRome(new Date("2026-01-15T12:34:56Z"))).toBe(
      "2026-01-15T13:34:56+01:00",
    );
  });

  it("uses Rome day, not UTC day, for a timestamp just past midnight UTC in summer", () => {
    // 2026-07-15T22:30:00Z = 2026-07-16T00:30:00 CEST → July 16 in Rome
    expect(formatIsoInRome(new Date("2026-07-15T22:30:00Z"))).toBe(
      "2026-07-16T00:30:00+02:00",
    );
  });

  it("uses Rome day, not UTC day, for a timestamp just past midnight UTC in winter", () => {
    // 2026-12-31T23:30:00Z = 2027-01-01T00:30:00 CET → Jan 1 2027 in Rome
    expect(formatIsoInRome(new Date("2026-12-31T23:30:00Z"))).toBe(
      "2027-01-01T00:30:00+01:00",
    );
  });

  it("drops milliseconds from the output", () => {
    const result = formatIsoInRome(new Date("2026-05-01T10:00:00.999Z"));
    expect(result).not.toContain(".");
    expect(result).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/,
    );
  });

  // Regression guard sui bordi DST (REVIEW #16): la transizione CET↔CEST in
  // Europe/Rome avviene alle 01:00 UTC (ultima domenica di marzo/ottobre).
  // Asseriamo l'offset esatto agli istanti immediatamente prima/dopo lo switch.
  describe("DST transition boundaries", () => {
    it("keeps +01:00 one second before spring-forward (2026-03-29 01:00 UTC)", () => {
      // 2026-03-29T00:59:59Z = 01:59:59 CET, ancora UTC+1
      expect(formatIsoInRome(new Date("2026-03-29T00:59:59Z"))).toBe(
        "2026-03-29T01:59:59+01:00",
      );
    });

    it("switches to +02:00 at spring-forward (2026-03-29 01:00 UTC)", () => {
      // 2026-03-29T01:00:00Z: l'orologio salta 02:00→03:00 CEST, ora UTC+2
      expect(formatIsoInRome(new Date("2026-03-29T01:00:00Z"))).toBe(
        "2026-03-29T03:00:00+02:00",
      );
    });

    it("keeps +02:00 one second before fall-back (2026-10-25 00:59:59 UTC)", () => {
      // 2026-10-25T00:59:59Z = 02:59:59 CEST, ancora UTC+2
      expect(formatIsoInRome(new Date("2026-10-25T00:59:59Z"))).toBe(
        "2026-10-25T02:59:59+02:00",
      );
    });

    it("switches to +01:00 at fall-back (2026-10-25 01:00 UTC)", () => {
      // 2026-10-25T01:00:00Z: l'orologio torna 03:00→02:00 CET, ora UTC+1
      expect(formatIsoInRome(new Date("2026-10-25T01:00:00Z"))).toBe(
        "2026-10-25T02:00:00+01:00",
      );
    });
  });
});

describe("parseStrictIsoDateUtc", () => {
  it("returns a UTC-midnight Date for valid dates", () => {
    const d = parseStrictIsoDateUtc("2026-01-01");
    expect(d).toEqual(new Date("2026-01-01T00:00:00.000Z"));
  });

  it("returns correct UTC midnight for end of February in a non-leap year", () => {
    const d = parseStrictIsoDateUtc("2026-02-28");
    expect(d).toEqual(new Date("2026-02-28T00:00:00.000Z"));
  });

  it("returns correct UTC midnight for Dec 31", () => {
    const d = parseStrictIsoDateUtc("2026-12-31");
    expect(d).toEqual(new Date("2026-12-31T00:00:00.000Z"));
  });

  it("returns null for Feb 31 (impossible date — JS normalises to March)", () => {
    expect(parseStrictIsoDateUtc("2026-02-31")).toBeNull();
  });

  it("returns null for Apr 31 (impossible date — April has 30 days)", () => {
    expect(parseStrictIsoDateUtc("2026-04-31")).toBeNull();
  });

  it("returns null for month 13", () => {
    expect(parseStrictIsoDateUtc("2026-13-01")).toBeNull();
  });

  it("returns null for month 00", () => {
    expect(parseStrictIsoDateUtc("2026-00-10")).toBeNull();
  });

  it("returns null for day 00", () => {
    expect(parseStrictIsoDateUtc("2026-01-00")).toBeNull();
  });

  it("returns null for wrong format (no dashes)", () => {
    expect(parseStrictIsoDateUtc("20260101")).toBeNull();
  });

  it("returns null for partial format (single-digit month)", () => {
    expect(parseStrictIsoDateUtc("2026-1-1")).toBeNull();
  });

  it("returns null for non-date string", () => {
    expect(parseStrictIsoDateUtc("foo")).toBeNull();
  });

  it("round-trip: returned Date has correct UTC year/month/day", () => {
    const d = parseStrictIsoDateUtc("2026-07-15");
    expect(d).not.toBeNull();
    expect(d!.getUTCFullYear()).toBe(2026);
    expect(d!.getUTCMonth() + 1).toBe(7);
    expect(d!.getUTCDate()).toBe(15);
  });
});
