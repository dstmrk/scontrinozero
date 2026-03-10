/**
 * Guard test: verifica che tutti gli identificatori dello schema Drizzle
 * rispettino il limite di 63 caratteri di PostgreSQL.
 * PostgreSQL tronca silenziosamente gli identificatori >63 chars, causando
 * nomi di constraint/indice diversi da quelli definiti nello schema.
 */
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  adeCredentials,
  businesses,
  catalogItems,
  commercialDocumentLines,
  commercialDocuments,
  profiles,
} from "@/db/schema";

const MAX_PG_IDENTIFIER = 63;

const allTables = [
  profiles,
  businesses,
  adeCredentials,
  commercialDocuments,
  commercialDocumentLines,
  catalogItems,
];

describe("DB schema identifier lengths (PostgreSQL max 63 chars)", () => {
  it("table names are ≤63 chars", () => {
    for (const table of allTables) {
      const config = getTableConfig(table);
      expect(
        config.name.length,
        `Table name "${config.name}" exceeds 63 chars (${config.name.length})`,
      ).toBeLessThanOrEqual(MAX_PG_IDENTIFIER);
    }
  });

  it("index names are ≤63 chars", () => {
    for (const table of allTables) {
      const config = getTableConfig(table);
      for (const idx of config.indexes) {
        const name = idx.config.name ?? "";
        expect(
          name.length,
          `Index name "${name}" exceeds 63 chars (${name.length})`,
        ).toBeLessThanOrEqual(MAX_PG_IDENTIFIER);
      }
    }
  });

  it("FK constraint names are ≤63 chars", () => {
    for (const table of allTables) {
      const config = getTableConfig(table);
      for (const fk of config.foreignKeys) {
        const name = fk.getName();
        expect(
          name.length,
          `FK constraint name "${name}" exceeds 63 chars (${name.length})`,
        ).toBeLessThanOrEqual(MAX_PG_IDENTIFIER);
      }
    }
  });
});
