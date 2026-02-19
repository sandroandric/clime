-- Core identity
CREATE TABLE IF NOT EXISTS clis (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  publisher TEXT NOT NULL,
  description TEXT NOT NULL,
  website TEXT NOT NULL,
  repository TEXT NOT NULL,
  verification_status TEXT NOT NULL CHECK (verification_status IN ('auto-indexed', 'community-curated', 'publisher-verified')),
  latest_version TEXT NOT NULL,
  popularity_score NUMERIC NOT NULL DEFAULT 0,
  trust_score NUMERIC NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_verified TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS cli_tags (
  cli_slug TEXT NOT NULL REFERENCES clis(slug) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (cli_slug, tag)
);

CREATE TABLE IF NOT EXISTS install_methods (
  id BIGSERIAL PRIMARY KEY,
  cli_slug TEXT NOT NULL REFERENCES clis(slug) ON DELETE CASCADE,
  os TEXT NOT NULL,
  package_manager TEXT NOT NULL,
  command TEXT NOT NULL,
  checksum TEXT,
  signature TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_flows (
  id BIGSERIAL PRIMARY KEY,
  cli_slug TEXT NOT NULL REFERENCES clis(slug) ON DELETE CASCADE,
  auth_type TEXT NOT NULL,
  token_refresh TEXT NOT NULL,
  scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  environment_variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  setup_steps JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS command_entries (
  id TEXT PRIMARY KEY,
  cli_slug TEXT NOT NULL REFERENCES clis(slug) ON DELETE CASCADE,
  command TEXT NOT NULL,
  description TEXT NOT NULL,
  required_parameters JSONB NOT NULL DEFAULT '[]'::jsonb,
  optional_parameters JSONB NOT NULL DEFAULT '[]'::jsonb,
  examples JSONB NOT NULL DEFAULT '[]'::jsonb,
  expected_output TEXT NOT NULL,
  common_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  workflow_context JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Workflows and stacks
CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  estimated_minutes INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_steps (
  workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  cli_slug TEXT NOT NULL REFERENCES clis(slug) ON DELETE CASCADE,
  purpose TEXT NOT NULL,
  command_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  auth_prerequisite BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (workflow_id, step_number)
);

CREATE TABLE IF NOT EXISTS stack_recommendations (
  id TEXT PRIMARY KEY,
  use_case TEXT NOT NULL,
  workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  rationale TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trust, compatibility, reports
CREATE TABLE IF NOT EXISTS compatibility_matrix (
  id BIGSERIAL PRIMARY KEY,
  cli_slug TEXT NOT NULL REFERENCES clis(slug) ON DELETE CASCADE,
  agent_name TEXT NOT NULL,
  success_rate NUMERIC NOT NULL,
  status TEXT NOT NULL,
  last_verified TIMESTAMPTZ NOT NULL,
  UNIQUE (cli_slug, agent_name)
);

CREATE TABLE IF NOT EXISTS reports (
  request_id TEXT PRIMARY KEY,
  cli_slug TEXT NOT NULL REFERENCES clis(slug) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('success', 'fail')),
  cli_version TEXT NOT NULL,
  workflow_id TEXT,
  command_id TEXT,
  duration_ms BIGINT NOT NULL,
  exit_code INTEGER NOT NULL,
  agent_name TEXT NOT NULL,
  agent_version TEXT NOT NULL,
  os TEXT NOT NULL,
  arch TEXT NOT NULL,
  error_code TEXT,
  stderr_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS verification_runs (
  id BIGSERIAL PRIMARY KEY,
  cli_slug TEXT NOT NULL REFERENCES clis(slug) ON DELETE CASCADE,
  agent_name TEXT NOT NULL,
  status TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  verified_at TIMESTAMPTZ NOT NULL
);

-- Ranking, unmet demand, reverse marketplace freshness
CREATE TABLE IF NOT EXISTS ranking_snapshots (
  id BIGSERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL,
  entries JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS unmet_requests (
  id TEXT PRIMARY KEY,
  query TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  last_seen TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS listing_versions (
  id TEXT PRIMARY KEY,
  cli_slug TEXT NOT NULL REFERENCES clis(slug) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  changed_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  changelog TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (cli_slug, version_number)
);

CREATE TABLE IF NOT EXISTS change_feed_events (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Accounts and governance
CREATE TABLE IF NOT EXISTS publishers (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  domain TEXT UNIQUE,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS listing_claims (
  id BIGSERIAL PRIMARY KEY,
  cli_slug TEXT NOT NULL REFERENCES clis(slug) ON DELETE CASCADE,
  publisher_id BIGINT NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  UNIQUE (cli_slug, publisher_id)
);

CREATE TABLE IF NOT EXISTS community_submissions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  submitter TEXT NOT NULL,
  target_cli_slug TEXT,
  content JSONB NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  reviewed_at TIMESTAMPTZ,
  reviewer TEXT,
  review_notes TEXT
);

CREATE TABLE IF NOT EXISTS api_keys (
  id BIGSERIAL PRIMARY KEY,
  key_hash TEXT UNIQUE NOT NULL,
  owner_type TEXT NOT NULL,
  owner_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS usage_events (
  id BIGSERIAL PRIMARY KEY,
  api_key_id BIGINT REFERENCES api_keys(id) ON DELETE SET NULL,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  latency_ms INTEGER NOT NULL,
  request_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clis_popularity ON clis(popularity_score DESC);
CREATE INDEX IF NOT EXISTS idx_clis_trust ON clis(trust_score DESC);
CREATE INDEX IF NOT EXISTS idx_reports_cli_created ON reports(cli_slug, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_change_feed_occurred ON change_feed_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_unmet_requests_count ON unmet_requests(count DESC);
