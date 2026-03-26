import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { businesses } from "./businesses";
import { apiKeys } from "./api-keys";

export const documentKindEnum = pgEnum("document_kind", ["SALE", "VOID"]);

export const documentStatusEnum = pgEnum("document_status", [
  "PENDING",
  "ACCEPTED",
  "VOID_ACCEPTED",
  "REJECTED",
  "ERROR",
]);

/**
 * Scontrini elettronici emessi tramite Documento Commerciale Online (AdE).
 * Ogni record corrisponde a una vendita (SALE) o un annullo (VOID).
 * I payload AdE (request + response) sono archiviati as-is per audit e replay.
 */
export const commercialDocuments = pgTable(
  "commercial_documents",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    kind: documentKindEnum("kind").notNull(),
    idempotencyKey: uuid("idempotency_key").notNull().unique(),
    /** SaleRequest | VoidRequest — payload API pubblica ScontrinoZero */
    publicRequest: jsonb("public_request"),
    /** Payload JSON inviato all'AdE */
    adeRequest: jsonb("ade_request"),
    /** Risposta raw dell'AdE */
    adeResponse: jsonb("ade_response"),
    /** idtrx AdE — identificativo transazione */
    adeTransactionId: text("ade_transaction_id"),
    /** progressivo AdE — numero documento */
    adeProgressive: text("ade_progressive"),
    /** Codice Lotteria degli Scontrini del cliente (8 char [A-Z0-9]) — solo per SALE con PE */
    lotteryCode: text("lottery_code"),
    /** API key usata per emettere lo scontrino. NULL = emissione via UI (session). */
    apiKeyId: uuid("api_key_id").references(() => apiKeys.id, {
      onDelete: "set null",
    }),
    status: documentStatusEnum("status").notNull().default("PENDING"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_commercial_documents_business_created").on(
      table.businessId,
      table.createdAt,
    ),
    index("idx_commercial_documents_business_status").on(
      table.businessId,
      table.status,
    ),
    index("idx_commercial_documents_api_key").on(table.apiKeyId),
  ],
);

export type InsertCommercialDocument = typeof commercialDocuments.$inferInsert;
export type SelectCommercialDocument = typeof commercialDocuments.$inferSelect;
