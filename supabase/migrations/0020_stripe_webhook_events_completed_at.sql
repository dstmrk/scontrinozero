-- Migration: add completed_at to stripe_webhook_events
-- REVIEW.md #20: processed_at is set at claim time (INSERT), not at
-- completion, so it cannot tell apart a row whose handleEvent succeeded from
-- one still in progress or permanently stuck (handleEvent failed AND the
-- claim-release DELETE also failed). completed_at is set only after
-- handleEvent succeeds; the sweep job in src/instrumentation.ts deletes
-- claims with completed_at IS NULL older than 30 minutes.

ALTER TABLE stripe_webhook_events
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;
