import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { profiles } from "./profiles";

/**
 * Audit + idempotenza del reward referral. Una riga per ogni signup avvenuto
 * con un `?rcode=` valido. `rewardedAt` resta NULL finché il referee non
 * completa la verifica P.IVA (stesso checkpoint anti-abuso del
 * `trial_vat_ledger`) — solo a quel punto il referrer riceve +30 giorni su
 * `profiles.referral_bonus_days` (src/server/onboarding-actions.ts
 * finalizeAdeVerification).
 *
 * `refereeId` è UNIQUE: ogni referee può far guadagnare il reward al
 * referrer una sola volta, anche sotto race (claim via
 * `UPDATE ... WHERE rewarded_at IS NULL`).
 *
 * Le due FK si cancellano con il profilo (migrazione 0047): senza cascata la
 * cancellazione dell'account di uno dei due falliva a metà. Il bonus già
 * riconosciuto resta su `profiles.referral_bonus_days`.
 */
export const referralRedemptions = pgTable("referral_redemptions", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  referrerId: uuid("referrer_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  refereeId: uuid("referee_id")
    .notNull()
    .unique()
    .references(() => profiles.id, { onDelete: "cascade" }),
  referralCode: text("referral_code").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  rewardedAt: timestamp("rewarded_at", { withTimezone: true }),
});

export type InsertReferralRedemption = typeof referralRedemptions.$inferInsert;
export type SelectReferralRedemption = typeof referralRedemptions.$inferSelect;
