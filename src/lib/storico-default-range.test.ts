// @vitest-environment node
import { describe, expect, it } from "vitest";
import { defaultLast7DaysRomeRange } from "./storico-default-range";

describe("defaultLast7DaysRomeRange", () => {
  it("usa Europe/Rome anche a cavallo di mezzanotte UTC (CEST, estate)", () => {
    // 19 maggio 23:30 UTC = 20 maggio 01:30 ora Rome (CEST = UTC+2).
    // Il default deve essere "oggi=2026-05-20", non "ieri=2026-05-19".
    const res = defaultLast7DaysRomeRange(new Date("2026-05-19T23:30:00Z"));
    expect(res.dateTo).toBe("2026-05-20");
    expect(res.dateFrom).toBe("2026-05-14");
  });

  it("usa Europe/Rome a cavallo di mezzanotte UTC anche in inverno (CET = UTC+1)", () => {
    // 14 gennaio 23:30 UTC = 15 gennaio 00:30 ora Rome (CET = UTC+1).
    const res = defaultLast7DaysRomeRange(new Date("2026-01-14T23:30:00Z"));
    expect(res.dateTo).toBe("2026-01-15");
    expect(res.dateFrom).toBe("2026-01-09");
  });

  it("ritorna 7 giorni inclusivi (today incluso, today-6 come from)", () => {
    const res = defaultLast7DaysRomeRange(new Date("2026-05-19T12:00:00Z"));
    expect(res.dateTo).toBe("2026-05-19");
    expect(res.dateFrom).toBe("2026-05-13");
  });

  it("attraversa correttamente il cambio mese", () => {
    const res = defaultLast7DaysRomeRange(new Date("2026-06-03T10:00:00Z"));
    expect(res.dateTo).toBe("2026-06-03");
    expect(res.dateFrom).toBe("2026-05-28");
  });
});
