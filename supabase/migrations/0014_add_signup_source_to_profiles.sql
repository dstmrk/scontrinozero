-- Migration: add signup_source to profiles
-- Feature: tracking conversioni per i post di lancio soft (v1.2.14)
-- Captured from ?ref= query string on /register, validated against an
-- allowlist server-side before insert. Nullable: legacy/direct signups
-- remain NULL and are filtered in analytics queries.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS signup_source text;
