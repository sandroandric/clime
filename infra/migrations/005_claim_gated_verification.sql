-- Publisher verification must be claim-based only.
-- Any seeded/manual publisher-verified rows without an approved claim are downgraded.
UPDATE clis
SET
  verification_status = 'community-curated',
  trust_score = LEAST(trust_score, 84)
WHERE verification_status = 'publisher-verified'
  AND slug NOT IN (
    SELECT lc.cli_slug
    FROM listing_claims AS lc
    WHERE lc.status = 'approved'
  );
