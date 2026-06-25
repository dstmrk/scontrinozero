-- Migration: 0021_referral_program
-- Referral program (member-get-member), v1.4.0. Distinto dal futuro
-- programma Partner/reseller (NDS, monouso, B2B) — nomi colonna scelti per
-- non collidere quando quel programma verrà implementato.
--
-- `referral_code`: codice personale riusabile, derivato deterministicamente
-- dall'authUserId (src/lib/referral-code.ts: SHA-256 troncato a 40 bit,
-- alfabeto base32 senza ambigui). NOT NULL: i profili pre-esistenti vengono
-- backfillati qui sotto con una funzione SQL che replica esattamente
-- l'algoritmo JS (stesso digest, stesso bit-packing, stesso alfabeto) — non
-- serve intervento manuale. I nuovi INSERT applicativi lo settano comunque
-- sempre da `src/lib/referral-code.ts`, questa funzione serve solo qui.
--
-- `referred_by_referral_code`: codice usato da QUESTO utente in fase di
-- signup (NULL se nessun referral). Solo audit, nessun vincolo.
--
-- `referral_bonus_days`: giorni bonus accumulati, additivo. Applicato in
-- src/lib/plans.ts fetchPlan() traslando trialStartedAt/planExpiresAt prima
-- di ritornarli — non viene mai letto né scritto dal webhook Stripe, quindi
-- sopravvive a qualunque rinnovo subscription che sovrascrive
-- `plan_expires_at` in toto.
--
-- `referral_redemptions`: una riga per ogni signup con `?rcode=` valido.
-- `rewarded_at` resta NULL finché il referee non completa la verifica P.IVA
-- (stesso checkpoint anti-abuso di trial_vat_ledger, migration 0018); solo a
-- quel punto il referrer riceve +30 giorni. `referee_id` UNIQUE impedisce il
-- doppio reward anche sotto race (claim via UPDATE ... WHERE rewarded_at IS NULL).
--
-- Idempotente: ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE "profiles"
  ADD COLUMN IF NOT EXISTS "referral_code" text,
  ADD COLUMN IF NOT EXISTS "referred_by_referral_code" text,
  ADD COLUMN IF NOT EXISTS "referral_bonus_days" integer NOT NULL DEFAULT 0;

-- Replica esatta di generateReferralCode() (src/lib/referral-code.ts): primi
-- 5 byte di sha256(seed) -> 40 bit -> 8 simboli da 5 bit sull'alfabeto senza
-- ambigui. Funzione temporanea, usata solo per il backfill qui sotto e poi
-- droppata: i nuovi INSERT applicativi generano il codice in JS, non in SQL.
CREATE OR REPLACE FUNCTION "pg_temp"."referral_code_from_seed"(seed text)
RETURNS text
LANGUAGE plpgsql
AS $fn$
DECLARE
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  digest_bytes bytea;
  bits bigint := 0;
  code text := '';
  idx int;
  i int;
BEGIN
  digest_bytes := digest(seed, 'sha256');
  FOR i IN 0..4 LOOP
    bits := (bits << 8) | get_byte(digest_bytes, i);
  END LOOP;
  FOR i IN REVERSE 7..0 LOOP
    idx := (bits >> (i * 5)) & 31;
    code := code || substr(alphabet, idx + 1, 1);
  END LOOP;
  RETURN code;
END;
$fn$;

-- Backfill deterministico dei profili pre-esistenti senza referral_code.
-- Possibili duplicati teorici (collisione SHA-256 troncata) risolti con un
-- suffisso incrementale prima di applicare lo UNIQUE — irrilevante in
-- pratica (40 bit di entropia) ma evita che la migration fallisca.
DO $$
DECLARE
  r RECORD;
  candidate text;
  suffix int;
BEGIN
  FOR r IN SELECT "id", "auth_user_id" FROM "profiles" WHERE "referral_code" IS NULL LOOP
    candidate := "pg_temp"."referral_code_from_seed"(r."auth_user_id"::text);
    suffix := 0;
    WHILE EXISTS (SELECT 1 FROM "profiles" WHERE "referral_code" = candidate) LOOP
      suffix := suffix + 1;
      candidate := "pg_temp"."referral_code_from_seed"(r."auth_user_id"::text || ':' || suffix::text);
    END LOOP;
    UPDATE "profiles" SET "referral_code" = candidate WHERE "id" = r."id";
  END LOOP;
END $$;

DROP FUNCTION "pg_temp"."referral_code_from_seed"(text);

ALTER TABLE "profiles"
  ALTER COLUMN "referral_code" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_referral_code_unique'
  ) THEN
    ALTER TABLE "profiles"
      ADD CONSTRAINT "profiles_referral_code_unique" UNIQUE ("referral_code");
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "referral_redemptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "referrer_id" uuid NOT NULL REFERENCES "profiles" ("id"),
  "referee_id" uuid NOT NULL REFERENCES "profiles" ("id"),
  "referral_code" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "rewarded_at" timestamptz,
  CONSTRAINT "referral_redemptions_referee_id_unique" UNIQUE ("referee_id")
);

-- RLS: service-role only, stesso pattern di trial_vat_ledger (migration 0018).
ALTER TABLE "referral_redemptions" ENABLE ROW LEVEL SECURITY;
