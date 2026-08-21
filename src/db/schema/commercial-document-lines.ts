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
    /**
     * Sconto applicato a QUESTA riga, lordo e gia' comprensivo della quantita'
     * (migrazione 0034). E' la grandezza nativa `scontoLordo` del tracciato
     * AdE (HAR.md voce #12), non uno sconto per unita': su una riga da 3 pezzi
     * a 40,00 con "sconto 20 euro" qui va `20.00`, non `6.67`.
     *
     * ⚠️ Dato FISCALE: riduce la base imponibile e quindi l'IVA dovuta
     * (voce #3a). Da non confondere con lo sconto a pagare, che vive in
     * `commercial_documents.public_request` e non tocca l'IVA.
     *
     * `0` su ogni riga storica: e' il valore che avevano implicitamente.
     */
    lineDiscount: numeric("line_discount", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
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
    check("cd_lines_line_discount_check", sql`${table.lineDiscount} >= 0`),
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
