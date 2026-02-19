ALTER TABLE usage_events
  ADD COLUMN IF NOT EXISTS cli_slug TEXT,
  ADD COLUMN IF NOT EXISTS query TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE listing_claims
  ADD COLUMN IF NOT EXISTS verification_method TEXT NOT NULL DEFAULT 'dns_txt',
  ADD COLUMN IF NOT EXISTS verification_token TEXT,
  ADD COLUMN IF NOT EXISTS verification_instructions TEXT,
  ADD COLUMN IF NOT EXISTS repository_url TEXT,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS label TEXT;

ALTER TABLE clis
  ADD COLUMN IF NOT EXISTS permission_scope JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS cli_embeddings (
  cli_slug TEXT PRIMARY KEY REFERENCES clis(slug) ON DELETE CASCADE,
  embedding JSONB NOT NULL,
  searchable_text TEXT NOT NULL,
  top_commands JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_events_cli_slug ON usage_events(cli_slug);
CREATE INDEX IF NOT EXISTS idx_usage_events_query ON usage_events((lower(query)));
