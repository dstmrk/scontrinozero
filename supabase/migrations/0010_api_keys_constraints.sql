-- Migration 0010: add structural constraints on api_keys
--
-- 1. Enforce valid values for the `type` column.
-- 2. Enforce consistency between `type` and `business_id`:
--    - 'business' keys must have a non-null business_id
--    - 'management' keys must have business_id = NULL

ALTER TABLE api_keys
  ADD CONSTRAINT api_keys_type_check
  CHECK (type IN ('business', 'management'));

ALTER TABLE api_keys
  ADD CONSTRAINT api_keys_business_id_consistency
  CHECK (
    (type = 'business'    AND business_id IS NOT NULL) OR
    (type = 'management'  AND business_id IS NULL)
  );
