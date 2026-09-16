import { pgTable, text, timestamp, uuid, integer } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { businesses } from "./businesses";

/**
 * Encrypted AdE access credentials. One set per business (1:1).
 *
 * Il metodo di accesso (`loginMethod`) determina quali campi sono valorizzati
 * (validato a livello applicativo, non dallo schema):
 *  - `fisconline`: encryptedCodiceFiscale + encryptedPassword + encryptedPin
 *  - `cie`:        encryptedUsername (email CIE ID) + encryptedPassword
 *  - `spid`:       nessun segreto (solo loginMethod + spidProvider); username e
 *                  password reinseriti a ogni rinnovo — regole AgID vietano di
 *                  conservare la password SPID lato service provider.
 *
 * Tutti i campi `encrypted*` usano AES-256-GCM (src/lib/crypto.ts) e sono
 * NULLABLE dalla migrazione 0027 in poi.
 */
export const adeCredentials = pgTable("ade_credentials", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  businessId: uuid("business_id")
    .notNull()
    .unique()
    .references(() => businesses.id, { onDelete: "cascade" }),
  /** Metodo di accesso AdE: 'fisconline' | 'cie' | 'spid'. */
  loginMethod: text("login_method").notNull().default("fisconline"),
  encryptedCodiceFiscale: text("encrypted_codice_fiscale"),
  /** Username del metodo, quando distinto dal CF (email per CIE). */
  encryptedUsername: text("encrypted_username"),
  encryptedPassword: text("encrypted_password"),
  encryptedPin: text("encrypted_pin"),
  /** Provider SPID selezionato (es. 'sielte'); null per Fisconline/CIE. */
  spidProvider: text("spid_provider"),
  keyVersion: integer("key_version").notNull().default(1),
  /**
   * Partita IVA dell'utenza di lavoro scelta al primo collegamento, per gli
   * accessi che operano per conto di societa' terze (HAR.md #18, migrazione
   * 0037). NULL = utenza "me stesso", il caso storico.
   *
   * E' un input del login, rigiocato a ogni re-auth: vive qui e non su
   * `businesses` perche' condivide il ciclo di vita delle credenziali con cui
   * la scelta e' stata fatta. `businesses.vatNumber` resta il valore
   * **osservato** dopo la verifica; i due devono coincidere.
   */
  utenzaPiva: text("utenza_piva"),
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
