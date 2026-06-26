-- Migration: 0022_partners
-- Programma Partner/reseller (es. NDS), v1.4.0. Anticipato dal commento di
-- 0021_referral_program: meccanismo leggero che riusa il sistema referral
-- esistente invece di introdurre codici dedicati.
--
-- Un partner è un normale profilo a cui viene assegnato manualmente il piano
-- `unlimited`. Riceve un subdomain ad-hoc `<slug>-app.scontrinozero.it` (es.
-- `nds-app.scontrinozero.it`) il cui unico effetto visivo è un testo statico
-- accanto al logo (`label`, es. "x NDS"). Le iscrizioni effettuate sul
-- subdomain vengono attribuite al partner forzando il suo referral code.
--
-- `slug`: prefisso del subdomain, label hostname-safe, lowercase. UNIQUE.
-- `label`: testo mostrato accanto al logo. Stringa libera decisa da noi.
-- `referrer_profile_id`: profilo del partner. Risolve il referral code (join a
--   profiles.referral_code, single source of truth) e alimenta il reporting
--   "quanti utenti ha portato il partner" (query su referral_redemptions).
-- `active`: disabilita il subdomain senza cancellare la riga (audit storico).
--
-- RLS: service-role only, stesso pattern di referral_redemptions (0021) e
-- trial_vat_ledger (0018) — nessuna policy = solo la service-role bypassa RLS.
--
-- Idempotente: CREATE TABLE IF NOT EXISTS / guardie su constraint e index.

CREATE TABLE IF NOT EXISTS "partners" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "slug" text NOT NULL,
  "label" text NOT NULL,
  "referrer_profile_id" uuid NOT NULL REFERENCES "profiles" ("id"),
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'partners_slug_unique'
  ) THEN
    ALTER TABLE "partners"
      ADD CONSTRAINT "partners_slug_unique" UNIQUE ("slug");
  END IF;
END $$;

-- Lookup per hostname → partner sul render di ogni pagina (layout + register):
-- filtriamo sempre su slug + active. L'indice UNIQUE su slug copre già il
-- lookup; nessun indice aggiuntivo necessario.

ALTER TABLE "partners" ENABLE ROW LEVEL SECURITY;
