-- Migration: 0018_trial_vat_ledger
-- Anti-abuso trial cross-cancellazione. La P.IVA è UNIQUE su `profiles`
-- (anti-abuso trial), ma `deleteAccount` elimina la riga `profiles` e quindi
-- LIBERA quel vincolo: un utente poteva cancellare l'account a trial scaduto e
-- ri-registrarsi con la stessa P.IVA (email nuova) per un secondo trial.
--
-- Questo registro tiene traccia delle P.IVA che hanno GIÀ consumato un trial e
-- **sopravvive alla cancellazione dell'account** (nessuna FK a `profiles`, nessun
-- cascade). Una P.IVA presente qui → niente nuovo trial (l'utente entra subito in
-- sola lettura). Riga inserita la prima volta che le credenziali Fisconline
-- verificano e restituiscono la P.IVA (vedi `verifyAdeCredentials`).
--
-- Privacy/GDPR: NON memorizziamo la P.IVA in chiaro (sarebbe un dato personale
-- per le ditte individuali, conservato a tempo indeterminato oltre la
-- cancellazione). Salviamo solo un HMAC-SHA256 con secret server-side
-- (`PIVA_HASH_SECRET`): la P.IVA italiana è 11 cifre (~37 bit), un hash nudo
-- sarebbe forzabile per brute-force — l'HMAC con pepper è irreversibile/non
-- enumerabile senza il secret. Token a senso unico per sola anti-frode.
--
-- Idempotente: CREATE TABLE IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS "trial_vat_ledger" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "piva_hash" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "trial_vat_ledger_piva_hash_unique" UNIQUE ("piva_hash")
);

-- RLS: nessun accesso dal client. La tabella è manipolata solo server-side via
-- service role (come le altre tabelle non esposte). Abilitiamo RLS senza alcuna
-- policy → ogni richiesta con la anon/authenticated key viene negata di default.
ALTER TABLE "trial_vat_ledger" ENABLE ROW LEVEL SECURITY;
