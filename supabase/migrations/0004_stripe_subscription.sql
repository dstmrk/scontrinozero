-- v0.9.0: Stripe payments — aggiunge colonne billing su profiles e crea tabella subscriptions

-- -----------------------------------------------------------------------
-- profiles: nuove colonne billing
-- -----------------------------------------------------------------------

ALTER TABLE "profiles"
  ADD COLUMN "plan"             text        NOT NULL DEFAULT 'trial',
  ADD COLUMN "trial_started_at" timestamptz          DEFAULT NOW(),
  ADD COLUMN "plan_expires_at"  timestamptz,
  -- Anti-abuso trial: stessa P.IVA non può aprire più trial
  ADD COLUMN "partita_iva"      text        UNIQUE;

-- -----------------------------------------------------------------------
-- subscriptions: record Stripe (1:1 con auth.users)
-- -----------------------------------------------------------------------

CREATE TABLE "subscriptions" (
  "id"                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"                uuid        NOT NULL UNIQUE
                             CONSTRAINT subscriptions_user_id_fk
                             REFERENCES auth.users(id) ON DELETE CASCADE,
  "stripe_customer_id"     text        UNIQUE,
  "stripe_subscription_id" text        UNIQUE,
  "stripe_price_id"        text,
  "status"                 text,
  "current_period_end"     timestamptz,
  "interval"               text,
  "created_at"             timestamptz NOT NULL DEFAULT NOW(),
  "updated_at"             timestamptz NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------
-- RLS: subscriptions
-- -----------------------------------------------------------------------

ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscriptions_own" ON "subscriptions"
  FOR ALL
  USING (user_id = auth.uid());
