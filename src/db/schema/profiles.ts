import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const profiles = pgTable("profiles", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  authUserId: uuid("auth_user_id").notNull().unique(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
  termsVersion: text("terms_version"),
  // Stripe / billing
  plan: text("plan").notNull().default("trial"),
  trialStartedAt: timestamp("trial_started_at", {
    withTimezone: true,
  }).defaultNow(),
  planExpiresAt: timestamp("plan_expires_at", { withTimezone: true }),
  // Anti-abuso trial: UNIQUE per P.IVA
  partitaIva: text("partita_iva").unique(),
});

export type InsertProfile = typeof profiles.$inferInsert;
export type SelectProfile = typeof profiles.$inferSelect;
