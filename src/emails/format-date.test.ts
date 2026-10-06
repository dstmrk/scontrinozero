// @vitest-environment node
import { describe, it, expect } from "vitest";
import { formatEmailDate } from "./format-date";

describe("formatEmailDate", () => {
  it("formatta in italiano con il mese per esteso", () => {
    expect(formatEmailDate(new Date("2026-07-07T12:00:00.000Z"))).toBe(
      "7 luglio 2026",
    );
  });

  it("usa il giorno italiano anche in un container UTC (sera dopo le 22 UTC)", () => {
    // 23:30 UTC del 14 agosto = 01:30 del 15 agosto a Roma (CEST).
    expect(formatEmailDate(new Date("2026-08-14T23:30:00.000Z"))).toBe(
      "15 agosto 2026",
    );
  });
});
