-- Migration: documentare l'intent della RLS no-policy su stripe_webhook_events
-- La tabella ha RLS abilitato senza policy → default-deny per anon/authenticated,
-- scrittura solo via service role del webhook Stripe.
-- Senza COMMENT esplicito un futuro PR potrebbe aggiungere una policy permissiva
-- pensando che ne manchi una.

COMMENT ON TABLE stripe_webhook_events IS
  'RLS no-policy intenzionale: scrittura solo via service role del webhook Stripe. Anon/authenticated default-deny.';
