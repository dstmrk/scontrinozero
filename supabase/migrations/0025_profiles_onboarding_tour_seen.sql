-- Migration: 0025_profiles_onboarding_tour_seen
-- Flag "tour onboarding visto" per-utente (PLAN.md v1.4.1).
--
-- Il tour guidato del dashboard (catalogo/cassa/storico/impostazioni) va
-- mostrato UNA SOLA VOLTA per-utente. La scelta di persistenza è una colonna su
-- `profiles` (non localStorage): così il flag è per-utente e non per-device,
-- quindi sopravvive al cambio dispositivo e alla reinstallazione della PWA.
--
-- `onboarding_tour_seen_at`: timestamptz nullable. NULL = tour mai visto →
-- verrà mostrato al primo accesso al dashboard. Valorizzato = già visto/skippato.
--
-- Backfill (decisione di rollout): solo i NUOVI utenti devono vedere il tour.
-- I profili già esistenti vengono marcati come "visto" (now()) per non
-- riproporre il walkthrough a chi usa già l'app. I profili creati dopo questa
-- migration nascono con NULL → vedono il tour.
--
-- Solo ADD COLUMN IF NOT EXISTS + UPDATE su righe ancora NULL → idempotente al
-- re-run.

ALTER TABLE "profiles"
  ADD COLUMN IF NOT EXISTS "onboarding_tour_seen_at" timestamptz;

UPDATE "profiles"
  SET "onboarding_tour_seen_at" = now()
  WHERE "onboarding_tour_seen_at" IS NULL;
