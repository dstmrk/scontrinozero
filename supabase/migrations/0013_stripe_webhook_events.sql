-- Tabella per il dedup degli eventi Stripe webhook.
-- L'INSERT ... ON CONFLICT DO NOTHING sull'event_id garantisce che ogni
-- evento venga processato al massimo una volta, anche in caso di retry Stripe.
CREATE TABLE stripe_webhook_events (
  event_id    TEXT        PRIMARY KEY,
  event_type  TEXT        NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;
