-- Migration: 0024_subscriptions_cancel_at_period_end
-- Visibilità in-app della cancellazione a fine periodo (REVIEW.md #34, PLAN.md v1.4.x).
--
-- Dal portale Stripe l'utente può annullare a fine periodo: Stripe imposta
-- `cancel_at_period_end=true` ma lascia `status='active'` fino alla scadenza,
-- poi emette `customer.subscription.deleted`. Finora lo schema non memorizzava
-- il flag e `syncSubscriptionData` non lo catturava: durante la finestra di
-- grazia la card billing mostrava "Pro attivo, rinnovo il …" invece di
-- "in cancellazione, attivo fino al …".
--
-- `cancel_at_period_end`: catturato dal webhook `customer.subscription.updated`
-- (syncSubscriptionData scrive sempre il valore corrente → la riattivazione lo
-- riporta a false da sola). Nessun backfill: il default `false` è corretto per
-- le righe esistenti — nessuna è in cancellazione finché un update non lo
-- imposta. Solo ADD COLUMN IF NOT EXISTS → idempotente al re-run.

ALTER TABLE "subscriptions"
  ADD COLUMN IF NOT EXISTS "cancel_at_period_end" boolean NOT NULL DEFAULT false;
