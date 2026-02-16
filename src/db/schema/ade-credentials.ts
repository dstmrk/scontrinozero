import { pgTable, text, timestamp, uuid, integer } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { businesses } from "./businesses";

/**
 * Encrypted Fisconline credentials for AdE integration.
 * All credential fields are encrypted with AES-256-GCM (src/lib/crypto.ts).
 * One credential set per business (1:1).
 */
export const adeCredentials = pgTable("ade_credentials", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  businessId: uuid("business_id")
    .notNull()
    .unique()
    .references(() => businesses.id, { onDelete: "cascade" }),
  encryptedCodiceFiscale: text("encrypted_codice_fiscale").notNull(),
  encryptedPassword: text("encrypted_password").notNull(),
  encryptedPin: text("encrypted_pin").notNull(),
  keyVersion: integer("key_version").notNull().default(1),
  /** Null means never verified; set after a successful test login to AdE */
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type InsertAdeCredential = typeof adeCredentials.$inferInsert;
export type SelectAdeCredential = typeof adeCredentials.$inferSelect;
