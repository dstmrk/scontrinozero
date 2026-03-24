-- Migration: remove unused columns
-- profiles.full_name: never populated (onboarding captures first_name + last_name separately)
-- businesses.activity_code, businesses.tax_regime: planned but never implemented

ALTER TABLE profiles
  DROP COLUMN IF EXISTS full_name;

ALTER TABLE businesses
  DROP COLUMN IF EXISTS activity_code,
  DROP COLUMN IF EXISTS tax_regime;
