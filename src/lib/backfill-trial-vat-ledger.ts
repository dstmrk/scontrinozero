import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { and, isNotNull, ne } from "drizzle-orm";
import { profiles, trialVatLedger } from "@/db/schema";
import { hashPiva } from "@/lib/piva-hash";
import { logger } from "@/lib/logger";

export type BackfillResult = { skipped: boolean; inserted: number };

/**
 * Backfill una-tantum del registro anti-frode `trial_vat_ledger` a partire
 * dalle P.IVA già presenti su `profiles` (account creati prima dell'introduzione
 * del ledger). Riusa `hashPiva` così l'HMAC è garantito identico a quello che
 * genererà ogni onboarding futuro.
 *
 * **Self-gated e idempotente:** esegue il backfill SOLO se il ledger è vuoto
 * (prima esecuzione dopo la migrazione `0018`). Può quindi girare a ogni boot
 * senza effetti collaterali: appena il ledger ha almeno una riga è un no-op
 * (un solo `SELECT ... LIMIT 1`). Gli onboarding successivi popolano il ledger
 * in modo incrementale in `verifyAdeCredentials`.
 */
export async function backfillTrialVatLedgerIfEmpty(
  db: PostgresJsDatabase,
): Promise<BackfillResult> {
  const existing = await db
    .select({ id: trialVatLedger.id })
    .from(trialVatLedger)
    .limit(1);
  if (existing.length > 0) {
    return { skipped: true, inserted: 0 };
  }

  const rows = await db
    .select({ partitaIva: profiles.partitaIva })
    .from(profiles)
    .where(and(isNotNull(profiles.partitaIva), ne(profiles.partitaIva, "")));

  // Dedup sugli hash: P.IVA distinte normalizzano sempre a hash distinti, ma
  // la dedup ci protegge anche da eventuali duplicati storici su profiles.
  const pivas = rows
    .map((r) => r.partitaIva)
    .filter((v): v is string => v !== null && v !== "");
  const hashes = [...new Set(pivas.map((piva) => hashPiva(piva)))];

  if (hashes.length === 0) {
    logger.info("backfill trial_vat_ledger: nessuna P.IVA pregressa");
    return { skipped: false, inserted: 0 };
  }

  await db
    .insert(trialVatLedger)
    .values(hashes.map((pivaHash) => ({ pivaHash })))
    .onConflictDoNothing();

  logger.info({ count: hashes.length }, "backfill trial_vat_ledger completato");
  return { skipped: false, inserted: hashes.length };
}
