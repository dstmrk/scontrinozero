import { getTableName } from "drizzle-orm";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { businessMembers, MEMBER_ROLES } from "./business-members";

describe("business_members schema", () => {
  const config = getTableConfig(businessMembers);

  it("has the correct SQL table name", () => {
    expect(getTableName(businessMembers)).toBe("business_members");
  });

  it("has all required columns", () => {
    const cols = Object.keys(businessMembers);
    expect(cols).toEqual(
      expect.arrayContaining([
        "id",
        "businessId",
        "authUserId",
        "role",
        "createdAt",
      ]),
    );
  });

  // Un collaboratore rimosso perde l'account ma non la riga: i suoi documenti
  // restano attribuiti a lui (issue #1099).
  it("auth_user_id è nullable", () => {
    expect(businessMembers.authUserId.notNull).toBe(false);
  });

  // Nome, email e condizioni sono del collaboratore: sulla riga del titolare
  // restano NULL, perché le sue stanno in `profiles` (migrazione 0045).
  it.each([
    "name",
    "email",
    "termsAcceptedAt",
    "termsVersion",
    "collaboratorTermsVersion",
  ] as const)("%s è nullable", (column) => {
    expect(businessMembers[column].notNull).toBe(false);
  });

  it("i ruoli sono titolare e collaboratore", () => {
    expect(MEMBER_ROLES).toEqual(["owner", "collaborator"]);
  });

  it("la riga segue l'attività quando l'attività viene cancellata", () => {
    const fk = config.foreignKeys.find(
      (key) => getTableName(key.reference().foreignTable) === "businesses",
    );
    expect(fk?.onDelete).toBe("cascade");
  });

  it.each([
    // Una persona appartiene a una sola attività (decisione 15).
    ["idx_business_members_auth_user", '"auth_user_id" IS NOT NULL'],
    // Un solo titolare per attività.
    ["idx_business_members_one_owner", "'owner'"],
  ])("ha l'indice unico parziale %s", (name, predicate) => {
    const index = config.indexes.find((idx) => idx.config.name === name);
    expect(index?.config.unique).toBe(true);
    const where = new PgDialect().sqlToQuery(index!.config.where!).sql;
    expect(where).toContain(predicate);
  });
});
