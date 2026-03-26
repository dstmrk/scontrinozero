import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { businesses } from "./businesses";
import { profiles } from "./profiles";

/**
 * Chiavi API per l'accesso programmatico a ScontrinoZero.
 *
 * Due tipi:
 * - 'business': associata a un business specifico, usata per emettere scontrini.
 * - 'management': non associata a un business (business_id = NULL), usata per
 *   le Partner Management API (creare/gestire esercenti in modo programmatico).
 *
 * La raw key è mostrata UNA sola volta al momento della creazione e non viene
 * mai persistita. In DB si salva solo il SHA-256 hash (hex) e i primi 12
 * caratteri per l'identificazione in UI.
 *
 * Prefissi visuali:
 * - Business key:    szk_live_<48chars>
 * - Management key:  szk_mgmt_<48chars>
 */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    /** NULL per management key; UUID per business key */
    businessId: uuid("business_id").references(() => businesses.id, {
      onDelete: "cascade",
    }),
    /** 'business' | 'management' */
    type: text("type").notNull().default("business"),
    /** Nome human-readable, es. "POS Integrazione" */
    name: text("name").notNull(),
    /** SHA-256 della raw key in formato hex — usato per lookup */
    keyHash: text("key_hash").notNull().unique(),
    /** Prime 12 char della raw key — mostrato in UI per identificazione */
    keyPrefix: text("key_prefix").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    /** null = non scade */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** null = attiva; valorizzato = revocata */
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_api_keys_key_hash").on(table.keyHash),
    index("idx_api_keys_profile_id").on(table.profileId),
    index("idx_api_keys_business_id").on(table.businessId),
  ],
);

export type InsertApiKey = typeof apiKeys.$inferInsert;
export type SelectApiKey = typeof apiKeys.$inferSelect;
