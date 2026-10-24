import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { businesses } from "./businesses";

/** Titolare dell'attività e chi opera per suo conto (issue #1099). */
export const MEMBER_ROLES = ["owner", "collaborator"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

/**
 * Chi può operare su un'attività, con quale ruolo (migrazione 0044).
 *
 * `profiles` resta l'account del **titolare**: piano, trial, P.IVA, referral,
 * Stripe. Un collaboratore esisterà solo qui, senza profilo — così una lettura
 * del piano fatta col suo id non trova un trial suo, e una svista nel codice
 * fallisce chiusa invece di regalargli trenta giorni (decisione 1 sulla issue
 * #1099).
 *
 * `authUserId` è nullable: un collaboratore rimosso perde l'account ma non la
 * riga, perché i documenti che ha emesso (`commercial_documents.created_by`)
 * restano suoi. Nessuna FK verso `auth.users`, come per `subscriptions`: lo
 * schema auth non è di Drizzle.
 *
 * Nome, email e condizioni accettate valgono solo per il collaboratore
 * (migrazione 0045): quelle del titolare stanno in `profiles`. Il nome resta
 * dopo la rimozione, perché è ciò che attribuisce i documenti.
 */
export const businessMembers = pgTable(
  "business_members",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    authUserId: uuid("auth_user_id"),
    role: text("role").$type<MemberRole>().notNull(),
    name: text("name"),
    email: text("email"),
    termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
    termsVersion: text("terms_version"),
    collaboratorTermsVersion: text("collaborator_terms_version"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Una persona appartiene a una sola attività.
    uniqueIndex("idx_business_members_auth_user")
      .on(table.authUserId)
      .where(sql`${table.authUserId} IS NOT NULL`),
    // Un solo titolare per attività.
    uniqueIndex("idx_business_members_one_owner")
      .on(table.businessId)
      .where(sql`${table.role} = 'owner'`),
    index("idx_business_members_business").on(table.businessId),
    check(
      "business_members_role_check",
      sql`${table.role} IN ('owner', 'collaborator')`,
    ),
  ],
);

export type InsertBusinessMember = typeof businessMembers.$inferInsert;
export type SelectBusinessMember = typeof businessMembers.$inferSelect;
