-- Migration: add lottery_code to commercial_documents
-- Feature: Lotteria degli Scontrini (v1.1.0)
-- Stores the 8-char alphanumeric customer lottery code transmitted to AdE (cfCessionarioCommittente).
-- Only populated for SALE documents with electronic payment (PE).

ALTER TABLE commercial_documents
  ADD COLUMN IF NOT EXISTS lottery_code text;
