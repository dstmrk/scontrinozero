import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const stripeWebhookEvents = pgTable("stripe_webhook_events", {
  eventId: text("event_id").primaryKey(),
  eventType: text("event_type").notNull(),
  /** Set at claim time (INSERT), NOT at completion — see completedAt. */
  processedAt: timestamp("processed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  /**
   * Set only after handleEvent succeeds. NULL means "claimed but not (yet)
   * completed" — used by the sweep job in src/instrumentation.ts to detect
   * and unblock stuck claims (REVIEW.md #20).
   */
  completedAt: timestamp("completed_at", { withTimezone: true }),
});
