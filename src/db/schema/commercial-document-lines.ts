import {
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { commercialDocuments } from "./commercial-documents";

/**
 * Righe contabili degli scontrini elettronici.
 * Ogni riga corrisponde a un articolo/servizio nel documento commerciale.
 */
export const commercialDocumentLines = pgTable(
  "commercial_document_lines",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    documentId: uuid("document_id").notNull(),
    lineIndex: integer("line_index").notNull(),
    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 10, scale: 3 }).notNull(),
    grossUnitPrice: numeric("gross_unit_price", {
      precision: 10,
      scale: 2,
    }).notNull(),
    vatCode: text("vat_code").notNull(),
  },
  (table) => [
    foreignKey({
      name: "cd_lines_document_id_fk",
      columns: [table.documentId],
      foreignColumns: [commercialDocuments.id],
    }).onDelete("cascade"),
    index("idx_commercial_document_lines_document_id").on(table.documentId),
    // Defense-in-depth (migration 0019): CHECK constraints allineati allo Zod.
    check("cd_lines_quantity_check", sql`${table.quantity} >= 0`),
    check("cd_lines_gross_unit_price_check", sql`${table.grossUnitPrice} >= 0`),
    check(
      "cd_lines_description_length_check",
      sql`char_length(${table.description}) <= 200`,
    ),
  ],
);

export type InsertCommercialDocumentLine =
  typeof commercialDocumentLines.$inferInsert;
export type SelectCommercialDocumentLine =
  typeof commercialDocumentLines.$inferSelect;
