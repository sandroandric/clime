CREATE INDEX IF NOT EXISTS idx_usage_events_created_at
  ON usage_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_usage_events_api_key_created_at
  ON usage_events (api_key_id, created_at DESC);
