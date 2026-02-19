-- Remove non-installable/manual-doc entries from the curated registry.
-- These slugs are intentionally removed from listings and workflows.
DELETE FROM clis
WHERE slug IN ('lemonsqueezy', 'sendgrid', 'clerk', 'paddle');
