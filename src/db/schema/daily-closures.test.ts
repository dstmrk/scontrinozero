import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { closureStatusEnum, dailyClosures } from "./daily-closures";

describe("daily_closures schema", () => {
  it("has the correct SQL table name", () => {
    expect(getTableName(dailyClosures)).toBe("daily_closures");
  });

  it("has all required columns", () => {
    const cols = Object.keys(dailyClosures);
    expect(cols).toContain("id");
    expect(cols).toContain("businessId");
    expect(cols).toContain("closureDate");
    expect(cols).toContain("documentCount");
    expect(cols).toContain("totalGross");
    expect(cols).toContain("totalVat");
    expect(cols).toContain("status");
    expect(cols).toContain("adeRequest");
    expect(cols).toContain("adeResponse");
    expect(cols).toContain("createdAt");
    expect(cols).toContain("updatedAt");
  });

  it("closure status enum has correct values", () => {
    expect(closureStatusEnum.enumValues).toEqual([
      "PENDING",
      "COMPLETED",
      "ERROR",
    ]);
  });
});
