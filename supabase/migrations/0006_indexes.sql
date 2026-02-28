-- Performance indexes for commercial_documents
-- searchReceipts filters by business_id and orders by created_at DESC
CREATE INDEX idx_commercial_documents_business_created
  ON commercial_documents (business_id, created_at DESC);

-- Optional secondary index for status-filtered queries
CREATE INDEX idx_commercial_documents_business_status
  ON commercial_documents (business_id, status);
