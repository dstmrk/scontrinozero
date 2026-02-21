import { integer, numeric, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { commercialDocuments } from "./commercial-documents";

/**
 * Righe contabili degli scontrini elettronici.
 * Ogni riga corrisponde a un articolo/servizio nel documento commerciale.
 * adeLineId è il idElementoContabile AdE, necessario per i successivi annulli.
 */
export const commercialDocumentLines = pgTable("commercial_document_lines", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  documentId: uuid("document_id")
    .notNull()
    .references(() => commercialDocuments.id, { onDelete: "cascade" }),
  lineIndex: integer("line_index").notNull(),
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 3 }).notNull(),
  grossUnitPrice: numeric("gross_unit_price", {
    precision: 10,
    scale: 2,
  }).notNull(),
  vatCode: text("vat_code").notNull(),
  /** idElementoContabile AdE — richiesto per gli annulli parziali */
  adeLineId: text("ade_line_id"),
});

export type InsertCommercialDocumentLine =
  typeof commercialDocumentLines.$inferInsert;
export type SelectCommercialDocumentLine =
  typeof commercialDocumentLines.$inferSelect;
