-- Fix FK constraint name that exceeded PostgreSQL's 63-character identifier limit.
-- The original name "commercial_document_lines_document_id_commercial_documents_id_fk" (64 chars)
-- was silently truncated by PostgreSQL to 63 chars on creation.
-- Idempotent: only renames if the truncated name still exists.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'commercial_document_lines_document_id_commercial_documents_id_f'
  ) THEN
    ALTER TABLE "commercial_document_lines"
      RENAME CONSTRAINT "commercial_document_lines_document_id_commercial_documents_id_f"
      TO "cd_lines_document_id_fk";
  END IF;
END $$;
