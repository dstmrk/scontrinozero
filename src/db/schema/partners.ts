import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { profiles } from "./profiles";

/**
 * Programma Partner/reseller (es. NDS), v1.4.0. Meccanismo leggero che riusa
 * il sistema referral esistente: nessun codice dedicato.
 *
 * Un partner è un normale profilo a cui viene assegnato manualmente il piano
 * `unlimited`. Riceve un subdomain ad-hoc `<slug>-app.scontrinozero.it` il cui
 * unico effetto visivo è il testo `label` accanto al logo (es. "x NDS"). Le
 * iscrizioni sul subdomain vengono attribuite al partner forzando il suo
 * referral code (vedi src/lib/partners/).
 *
 * `referrerProfileId` punta al profilo del partner: risolve il referral code
 * via join a `profiles.referral_code` (single source of truth, niente
 * denormalizzazione) e alimenta il reporting "quanti utenti ha portato il
 * partner" (query su `referral_redemptions`).
 *
 * `active`: disabilita il subdomain senza cancellare la riga (audit storico).
 */
export const partners = pgTable("partners", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  slug: text("slug").notNull().unique(),
  label: text("label").notNull(),
  referrerProfileId: uuid("referrer_profile_id")
    .notNull()
    .references(() => profiles.id),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type InsertPartner = typeof partners.$inferInsert;
export type SelectPartner = typeof partners.$inferSelect;
