import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { partners, type SelectPartner } from "./partners";

describe("partners schema", () => {
  it("has the correct SQL table name", () => {
    expect(getTableName(partners)).toBe("partners");
  });

  it("has all required columns", () => {
    const cols = Object.keys(partners);
    expect(cols).toContain("id");
    expect(cols).toContain("slug");
    expect(cols).toContain("label");
    expect(cols).toContain("referrerProfileId");
    expect(cols).toContain("active");
    expect(cols).toContain("createdAt");
  });

  it("maps camelCase fields to snake_case columns", () => {
    expect(partners.referrerProfileId.name).toBe("referrer_profile_id");
    expect(partners.createdAt.name).toBe("created_at");
  });

  it("enforces slug uniqueness and not-null on slug/label/referrer", () => {
    expect(partners.slug.isUnique).toBe(true);
    expect(partners.slug.notNull).toBe(true);
    expect(partners.label.notNull).toBe(true);
    expect(partners.referrerProfileId.notNull).toBe(true);
  });

  it("defaults active to true", () => {
    expect(partners.active.notNull).toBe(true);
    expect(partners.active.hasDefault).toBe(true);
  });

  it("exposes a SelectPartner row shape with the partner label", () => {
    const row = {
      id: "00000000-0000-0000-0000-000000000000",
      slug: "nds",
      label: "x NDS",
      referrerProfileId: "11111111-1111-1111-1111-111111111111",
      active: true,
      createdAt: new Date(),
    } satisfies SelectPartner;
    expect(row.label).toBe("x NDS");
  });
});
