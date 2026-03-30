-- Remove columns that were defined in schema but never written or read.
-- ade_line_id: planned for partial voids, never implemented.
-- ade_request: only ade_response is persisted for audit; request was never stored.
ALTER TABLE commercial_document_lines DROP COLUMN ade_line_id;
ALTER TABLE commercial_documents DROP COLUMN ade_request;
