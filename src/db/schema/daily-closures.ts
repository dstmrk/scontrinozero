import {
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { businesses } from "./businesses";

export const closureStatusEnum = pgEnum("closure_status", [
  "PENDING",
  "COMPLETED",
  "ERROR",
]);

/**
 * Chiusure giornaliere di cassa.
 * Una chiusura per business per giorno (unique constraint).
 * Archivia i totali del giorno e i payload AdE per l'operazione di chiusura.
 */
export const dailyClosures = pgTable(
  "daily_closures",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    closureDate: date("closure_date").notNull(),
    documentCount: integer("document_count").notNull().default(0),
    totalGross: numeric("total_gross", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    totalVat: numeric("total_vat", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    status: closureStatusEnum("status").notNull().default("PENDING"),
    /** Payload chiusura inviato all'AdE */
    adeRequest: jsonb("ade_request"),
    /** Risposta raw dell'AdE per la chiusura */
    adeResponse: jsonb("ade_response"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("daily_closures_business_date_unique").on(
      t.businessId,
      t.closureDate,
    ),
  ],
);

export type InsertDailyClosure = typeof dailyClosures.$inferInsert;
export type SelectDailyClosure = typeof dailyClosures.$inferSelect;
