import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Stripe subscription record — 1:1 con l'utente Supabase Auth (auth.users).
 * Creata/aggiornata dal webhook Stripe. Non usa FK Drizzle su auth.users
 * perché quella tabella è fuori dallo schema Drizzle (gestita da Supabase).
 */
export const subscriptions = pgTable("subscriptions", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  /** auth.users.id — stessa FK usata su profiles.auth_user_id */
  userId: uuid("user_id").notNull().unique(),
  stripeCustomerId: text("stripe_customer_id").unique(),
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  stripePriceId: text("stripe_price_id"),
  /** 'active' | 'canceled' | 'past_due' | 'incomplete' */
  status: text("status"),
  /** Stripe currentPeriodEnd → data prossimo rinnovo/scadenza */
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  /** 'month' | 'year' */
  interval: text("interval"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type InsertSubscription = typeof subscriptions.$inferInsert;
export type SelectSubscription = typeof subscriptions.$inferSelect;
