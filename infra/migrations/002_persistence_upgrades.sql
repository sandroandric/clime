ALTER TABLE listing_claims
  ADD COLUMN IF NOT EXISTS evidence TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_unmet_requests_query_unique
  ON unmet_requests (lower(query));

CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_events_request_id
  ON usage_events (request_id);
