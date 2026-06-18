import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Registro delle P.IVA che hanno già consumato un trial. Anti-abuso
 * cross-cancellazione: `profiles.partita_iva` è UNIQUE ma `deleteAccount`
 * elimina la riga e libera il vincolo, permettendo un secondo trial con email
 * diversa e stessa P.IVA. Questa tabella **sopravvive alla cancellazione**
 * (nessuna FK a `profiles`) e non viene mai svuotata in automatico.
 *
 * `pivaHash` è un HMAC-SHA256 con secret server-side (`PIVA_HASH_SECRET`, vedi
 * `src/lib/piva-hash.ts`): nessuna P.IVA in chiaro persiste oltre la
 * cancellazione dell'account (pseudonimizzazione GDPR-friendly).
 */
export const trialVatLedger = pgTable("trial_vat_ledger", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  pivaHash: text("piva_hash").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
