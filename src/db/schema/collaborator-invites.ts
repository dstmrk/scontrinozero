import {
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { businesses } from "./businesses";

/**
 * Un invito di collaboratore in attesa (migrazione 0045, issue #1099).
 *
 * Nel DB solo lo SHA-256 del token. Niente colonne di stato: revoca e
 * accettazione cancellano la riga, un invito scaduto resta finché il titolare
 * non lo reinvia o lo elimina. Una riga per email e attività: reinviare
 * sostituisce token e scadenza.
 */
export const collaboratorInvites = pgTable(
  "collaborator_invites",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_collaborator_invites_token_hash").on(table.tokenHash),
    uniqueIndex("idx_collaborator_invites_business_email").on(
      table.businessId,
      table.email,
    ),
  ],
);

export type InsertCollaboratorInvite = typeof collaboratorInvites.$inferInsert;
export type SelectCollaboratorInvite = typeof collaboratorInvites.$inferSelect;
