-- Migration: 0029_subscriptions_last_stripe_event_created
-- Guardia sull'ordine di consegna degli eventi Stripe (REVIEW.md #61).
--
-- Stripe consegna i webhook *di norma* in ordine, ma non lo garantisce: retry
-- (fino a 3 giorni) e consegne concorrenti possono invertire due
-- `customer.subscription.updated` ravvicinati (es. "annulla a fine periodo"
-- seguito da "riattiva" dal portale). La dedup per `event.id` protegge dai
-- duplicati, non dall'ordering: applicando per ultimo l'evento più vecchio, in
-- DB resta `cancel_at_period_end = true` — quindi copy UI e plan-gate sbagliati
-- — finché un evento successivo non corregge lo stato.
--
-- `last_stripe_event_created`: watermark = `event.created` dell'ultimo evento
-- **full-sync** applicato (`syncSubscriptionData` e `handleSubscriptionDeleted`).
-- L'UPDATE aggiunge `WHERE last_stripe_event_created IS NULL OR
-- last_stripe_event_created <= <event.created>`: un evento più vecchio aggiorna
-- 0 righe → warn `stripe_event_out_of_order` + 200 (ack, niente retry inutile).
--
-- Gli handler `invoice.*` restano fuori dal watermark di proposito: scrivono
-- campi mirati (solo `status`), non un full-sync, e alzare il watermark con il
-- `created` di un'invoice bloccherebbe il `customer.subscription.updated`
-- appaiato, che ha spesso un `created` di poco precedente.
--
-- Nullable, nessun backfill: NULL = "nessun evento full-sync registrato" → il
-- primo evento applica sempre. Solo ADD COLUMN IF NOT EXISTS → idempotente al
-- re-run.

ALTER TABLE "subscriptions"
  ADD COLUMN IF NOT EXISTS "last_stripe_event_created" timestamptz;
