-- Migration: index on stripe_webhook_events.completed_at
-- REVIEW.md #82: the sweep in src/instrumentation.ts runs every 10 minutes on
-- a table that only grows, and both of its DELETEs lead with completed_at:
--   1. stuck claims    -> WHERE completed_at IS NULL     AND processed_at < now() - 30 min
--   2. retention       -> WHERE completed_at IS NOT NULL AND completed_at < now() - 30 days
-- Without an index each pass is a sequential scan, forever.
--
-- Why ONE plain index and not two partial ones (the alternative sketched in
-- REVIEW.md #82): a btree indexes NULLs in Postgres, so query 1 reaches the
-- never-completed rows directly (they are a handful, so rechecking
-- processed_at on them is free) and query 2 is a plain range scan. Two partial
-- indexes would cost more, not less: every row is INSERTed with completed_at
-- NULL and then UPDATEd once the handler succeeds, so that UPDATE would delete
-- the entry from the "IS NULL" index and insert it into the "IS NOT NULL" one
-- — double write amplification on the hot webhook path — and the retention
-- partial index would still cover ~every row, so it would be no smaller than
-- this one.

CREATE INDEX IF NOT EXISTS "idx_stripe_webhook_events_completed_at"
  ON "stripe_webhook_events" ("completed_at");
