import {
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { businesses } from "./businesses";

/**
 * Prodotti/servizi ricorrenti del catalogo locale dell'esercente.
 * Usati per pre-popolare la cassa con un tap, senza dover reinserire
 * descrizione e prezzo ogni volta.
 *
 * Nota: il catalogo è locale (DB ScontrinoZero). La sincronizzazione
 * con la rubrica prodotti AdE è prevista in una fase futura.
 */
export const catalogItems = pgTable(
  "catalog_items",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    defaultPrice: numeric("default_price", {
      precision: 10,
      scale: 2,
    }).notNull(),
    defaultVatCode: text("default_vat_code").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("idx_catalog_items_business_id").on(table.businessId)],
);

export type InsertCatalogItem = typeof catalogItems.$inferInsert;
export type SelectCatalogItem = typeof catalogItems.$inferSelect;
