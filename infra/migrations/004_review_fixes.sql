UPDATE usage_events
SET cli_slug = NULL
WHERE cli_slug IS NOT NULL
  AND cli_slug NOT IN (
    SELECT slug
    FROM clis
  );

ALTER TABLE usage_events
  DROP CONSTRAINT IF EXISTS usage_events_cli_slug_fkey;

ALTER TABLE usage_events
  ADD CONSTRAINT usage_events_cli_slug_fkey
  FOREIGN KEY (cli_slug) REFERENCES clis(slug) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_compatibility_matrix_cli_slug
  ON compatibility_matrix(cli_slug);
