import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hasCryptographicChecksum, type CliProfile, type ReportPayload, type UnmetRequest } from "@cli-me/shared-types";
import { createSeedData } from "../src/data/seed.js";
import { computeRanking } from "../src/lib/ranking.js";
import { RegistryStore } from "../src/lib/store.js";

interface CuratedDataset {
  generated_at: string;
  clis: CliProfile[];
  workflows: unknown[];
}

interface GoldAuditReport {
  listing_count: number;
  pass_count: number;
  fail_count: number;
  blocking_issue_count: number;
  manual_review_issue_count: number;
  warning_issue_count: number;
  listings_with_manual_review: string[];
}

const THIS_DIR = resolve(fileURLToPath(import.meta.url), "..");
const ROOT = resolve(THIS_DIR, "../../..");
const CURATED_INPUT = resolve(ROOT, "infra/generated/curated-listings.json");
const AUDIT_INPUT = resolve(ROOT, "infra/generated/gold-curation-audit.json");
const OUTPUT = resolve(ROOT, "infra/generated/publish-readiness-gate.json");

const MIN_PUBLISH_PASS_RATE = Number.parseFloat(process.env.CLIME_GATE_MIN_PUBLISH_PASS_RATE ?? "0.9");
const MAX_STALE_RATE = Number.parseFloat(process.env.CLIME_GATE_MAX_STALE_RATE ?? "0.1");
const HIGH_TRAFFIC_STALE_DAYS = Number.parseInt(process.env.CLIME_GATE_HIGH_TRAFFIC_STALE_DAYS ?? "7", 10);
const HIGH_TRAFFIC_COUNT = Number.parseInt(process.env.CLIME_GATE_HIGH_TRAFFIC_COUNT ?? "100", 10);
const MIN_SEARCH_RELEVANCE = Number.parseFloat(process.env.CLIME_GATE_MIN_SEARCH_RELEVANCE ?? "0.8");
const MAX_GOLD_MANUAL_REVIEW_RATE = Number.parseFloat(
  process.env.CLIME_GATE_MAX_GOLD_MANUAL_REVIEW_RATE ?? "0.1"
);
const MAX_GOLD_MANUAL_REVIEW_LISTINGS = Number.parseInt(
  process.env.CLIME_GATE_MAX_GOLD_MANUAL_REVIEW_LISTINGS ?? "20",
  10
);
const FAIL_ON_MANUAL_REVIEW_DEBT = process.env.CLIME_GATE_FAIL_ON_MANUAL_REVIEW_DEBT === "1";

const CANONICAL_QUERIES: Array<{ query: string; expectedAny: string[] }> = [
  { query: "deploy a next.js app", expectedAny: ["vercel", "netlify", "railway", "fly"] },
  { query: "host a static website quickly", expectedAny: ["netlify", "vercel", "cloudflare"] },
  { query: "set up postgres database", expectedAny: ["supabase", "neon", "planetscale", "turso", "prisma"] },
  { query: "run stripe payments in my backend", expectedAny: ["stripe"] },
  { query: "send transactional emails", expectedAny: ["postmark", "twilio"] },
  { query: "add user authentication", expectedAny: ["auth0"] },
  { query: "deploy infrastructure with kubernetes", expectedAny: ["kubectl", "helm", "k9s", "docker"] },
  { query: "inspect github pull requests from terminal", expectedAny: ["gh", "git", "github-actions"] },
  { query: "manage npm packages for node", expectedAny: ["npm", "pnpm", "yarn", "bun"] },
  { query: "monitor errors in production", expectedAny: ["sentry-cli", "datadog"] },
  { query: "configure cloudflare dns and cdn", expectedAny: ["cloudflare", "namecheap"] },
  { query: "run redis cache commands", expectedAny: ["redis-cli", "memcached"] },
  { query: "search data with algolia", expectedAny: ["algolia", "meilisearch"] },
  { query: "execute http requests from terminal", expectedAny: ["httpie", "curl", "wget"] },
  { query: "process media with ffmpeg", expectedAny: ["ffmpeg", "imagemagick"] },
  { query: "run playwright end to end tests", expectedAny: ["playwright", "cypress", "jest", "vitest"] },
  { query: "deploy serverless app on aws", expectedAny: ["aws-cli", "amplify", "serverless", "sst"] },
  { query: "build docker containers", expectedAny: ["docker", "podman"] },
  { query: "local llm inference tools", expectedAny: ["ollama", "huggingface-cli", "replicate"] },
  { query: "sync files between servers", expectedAny: ["rsync", "curl", "wget"] }
];

function readJson<T>(path: string): T {
  if (!existsSync(path)) {
    throw new Error(`Missing required file: ${path}`);
  }
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function daysSince(timestamp: string | undefined) {
  if (!timestamp) {
    return Number.POSITIVE_INFINITY;
  }
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) {
    return Number.POSITIVE_INFINITY;
  }
  return (Date.now() - parsed) / (1000 * 60 * 60 * 24);
}

function getTier(listing: CliProfile) {
  if (listing.identity.category_tags.includes("gold-curated")) {
    return "gold";
  }
  if (listing.identity.category_tags.includes("auto-curated")) {
    return "auto";
  }
  return "unknown";
}

function checksumIntegrityIssues(clis: CliProfile[]) {
  return clis.flatMap((cli) =>
    cli.install
      .filter((item) => item.checksum && !hasCryptographicChecksum(item.checksum))
      .map((item) => ({ slug: cli.identity.slug, os: item.os, checksum: item.checksum }))
  );
}

async function evaluateSearchRelevance() {
  const store = await RegistryStore.create(createSeedData());
  const results: Array<{ query: string; relevant: boolean; returned: string[] }> = [];

  for (const testCase of CANONICAL_QUERIES) {
    const found = await store.discoverClis(testCase.query, 5);
    const slugs = found.map((item) => item.cli.slug);
    const relevant = slugs.some((slug) => testCase.expectedAny.includes(slug));
    results.push({ query: testCase.query, relevant, returned: slugs });
  }

  const hitRate = results.filter((item) => item.relevant).length / Math.max(1, results.length);
  return { hitRate, results };
}

function evaluateTrendIntegrity(clis: CliProfile[], reports: ReportPayload[], unmetRequests: UnmetRequest[]) {
  const ranking = computeRanking("used", clis, reports, unmetRequests);
  const top = ranking.entries.slice(0, 25);
  const deltas = top.map((entry) => entry.delta ?? 0);

  const positives = deltas.filter((delta) => delta >= 0.5).length;
  const negatives = deltas.filter((delta) => delta <= -0.5).length;
  const flats = deltas.filter((delta) => Math.abs(delta) < 0.5).length;
  const missingSource = top.filter((entry) => !entry.metadata?.delta_source).length;
  const allZero = deltas.every((delta) => Math.abs(delta) < 0.01);

  return {
    top_count: top.length,
    positives,
    negatives,
    flats,
    missing_source: missingSource,
    all_zero: allZero
  };
}

async function main() {
  const curated = readJson<CuratedDataset>(CURATED_INPUT);
  const audit = readJson<GoldAuditReport>(AUDIT_INPUT);

  const publishPassRate = audit.pass_count / Math.max(1, audit.pass_count + audit.fail_count);
  const staleListings = curated.clis.filter((cli) => daysSince(cli.identity.last_verified) > 30);
  const staleRate = staleListings.length / Math.max(1, curated.clis.length);

  const sortedByTraffic = curated.clis
    .slice()
    .sort((a, b) => b.identity.popularity_score - a.identity.popularity_score)
    .slice(0, Math.min(HIGH_TRAFFIC_COUNT, curated.clis.length));
  const highTrafficStale = sortedByTraffic.filter(
    (cli) => daysSince(cli.identity.last_verified) > HIGH_TRAFFIC_STALE_DAYS
  );

  const checksumIssues = checksumIntegrityIssues(curated.clis);
  const manualReviewListingSet = new Set(audit.listings_with_manual_review);
  const goldListings = curated.clis.filter((cli) => getTier(cli) === "gold");
  const autoListings = curated.clis.filter((cli) => getTier(cli) === "auto");
  const goldManualReviewListings = goldListings.filter((cli) =>
    manualReviewListingSet.has(cli.identity.slug)
  );
  const autoManualReviewListings = autoListings.filter((cli) =>
    manualReviewListingSet.has(cli.identity.slug)
  );
  const goldManualReviewRate =
    goldManualReviewListings.length / Math.max(1, goldListings.length);
  const autoManualReviewRate =
    autoManualReviewListings.length / Math.max(1, autoListings.length);
  const autoTierStatusMismatch = curated.clis
    .filter((cli) => getTier(cli) === "auto")
    .filter((cli) => cli.identity.verification_status !== "auto-indexed")
    .map((cli) => cli.identity.slug);
  const goldTierStatusMismatch = curated.clis
    .filter((cli) => getTier(cli) === "gold")
    .filter((cli) => cli.identity.verification_status !== "community-curated")
    .map((cli) => cli.identity.slug);

  const search = await evaluateSearchRelevance();
  const seed = createSeedData() as {
    clis: CliProfile[];
    reports: ReportPayload[];
    unmet_requests: UnmetRequest[];
  };
  const trend = evaluateTrendIntegrity(seed.clis, seed.reports, seed.unmet_requests);

  const blockers: string[] = [];
  const debtWarnings: string[] = [];
  if (publishPassRate < MIN_PUBLISH_PASS_RATE) {
    blockers.push(
      `publish_pass_rate ${publishPassRate.toFixed(3)} is below threshold ${MIN_PUBLISH_PASS_RATE.toFixed(3)}`
    );
  }
  if (staleRate > MAX_STALE_RATE) {
    blockers.push(`stale_listing_rate ${(staleRate * 100).toFixed(2)}% exceeds ${(MAX_STALE_RATE * 100).toFixed(2)}%`);
  }
  if (highTrafficStale.length > 0) {
    blockers.push(
      `high_traffic_recertification failed: ${highTrafficStale.length}/${sortedByTraffic.length} stale beyond ${HIGH_TRAFFIC_STALE_DAYS} days`
    );
  }
  if (search.hitRate < MIN_SEARCH_RELEVANCE) {
    blockers.push(
      `search_top5_hit_rate ${search.hitRate.toFixed(3)} is below threshold ${MIN_SEARCH_RELEVANCE.toFixed(3)}`
    );
  }
  if (checksumIssues.length > 0) {
    blockers.push(`checksum integrity failed for ${checksumIssues.length} install instructions`);
  }
  if (autoTierStatusMismatch.length > 0) {
    blockers.push(`auto tier status mismatch on ${autoTierStatusMismatch.length} listings`);
  }
  if (goldTierStatusMismatch.length > 0) {
    blockers.push(`gold tier status mismatch on ${goldTierStatusMismatch.length} listings`);
  }
  if (trend.missing_source > 0 || trend.all_zero) {
    blockers.push(
      `trend integrity failed (missing_source=${trend.missing_source}, all_zero=${trend.all_zero ? "true" : "false"})`
    );
  }
  const goldRateDebtMessage = `gold_manual_review_rate ${(goldManualReviewRate * 100).toFixed(2)}% exceeds ${(MAX_GOLD_MANUAL_REVIEW_RATE * 100).toFixed(2)}%`;
  const goldCountDebtMessage = `gold_manual_review_listing_count ${goldManualReviewListings.length} exceeds ${MAX_GOLD_MANUAL_REVIEW_LISTINGS}`;
  if (goldManualReviewRate > MAX_GOLD_MANUAL_REVIEW_RATE) {
    if (FAIL_ON_MANUAL_REVIEW_DEBT) {
      blockers.push(goldRateDebtMessage);
    } else {
      debtWarnings.push(goldRateDebtMessage);
    }
  }
  if (goldManualReviewListings.length > MAX_GOLD_MANUAL_REVIEW_LISTINGS) {
    if (FAIL_ON_MANUAL_REVIEW_DEBT) {
      blockers.push(goldCountDebtMessage);
    } else {
      debtWarnings.push(goldCountDebtMessage);
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    curated_generated_at: curated.generated_at,
    thresholds: {
      min_publish_pass_rate: MIN_PUBLISH_PASS_RATE,
      max_stale_rate: MAX_STALE_RATE,
      high_traffic_stale_days: HIGH_TRAFFIC_STALE_DAYS,
      min_search_relevance: MIN_SEARCH_RELEVANCE,
      max_gold_manual_review_rate: MAX_GOLD_MANUAL_REVIEW_RATE,
      max_gold_manual_review_listings: MAX_GOLD_MANUAL_REVIEW_LISTINGS,
      fail_on_manual_review_debt: FAIL_ON_MANUAL_REVIEW_DEBT
    },
    metrics: {
      listing_count: curated.clis.length,
      workflow_count: curated.workflows.length,
      publish_pass_rate: publishPassRate,
      stale_listing_count: staleListings.length,
      stale_listing_rate: staleRate,
      high_traffic_count: sortedByTraffic.length,
      high_traffic_stale_count: highTrafficStale.length,
      search_top5_hit_rate: search.hitRate,
      checksum_issue_count: checksumIssues.length,
      gold_manual_review_listing_count: goldManualReviewListings.length,
      gold_manual_review_rate: goldManualReviewRate,
      auto_manual_review_listing_count: autoManualReviewListings.length,
      auto_manual_review_rate: autoManualReviewRate,
      tier_counts: {
        gold: goldListings.length,
        auto: autoListings.length,
        unknown: curated.clis.filter((cli) => getTier(cli) === "unknown").length
      },
      trend_integrity: trend
    },
    details: {
      stale_listing_slugs: staleListings.map((cli) => cli.identity.slug),
      high_traffic_stale_slugs: highTrafficStale.map((cli) => cli.identity.slug),
      checksum_issues: checksumIssues,
      gold_manual_review_listing_slugs: goldManualReviewListings.map((cli) => cli.identity.slug),
      auto_manual_review_listing_slugs: autoManualReviewListings.map((cli) => cli.identity.slug),
      auto_tier_status_mismatch: autoTierStatusMismatch,
      gold_tier_status_mismatch: goldTierStatusMismatch,
      search_results: search.results,
      audit_summary: {
        pass_count: audit.pass_count,
        fail_count: audit.fail_count,
        blocking_issue_count: audit.blocking_issue_count,
        manual_review_issue_count: audit.manual_review_issue_count,
        warning_issue_count: audit.warning_issue_count
      }
    },
    blockers,
    debt_warnings: debtWarnings,
    ok: blockers.length === 0
  };

  writeFileSync(OUTPUT, JSON.stringify(report, null, 2));

  console.log(`Publish readiness report written -> ${OUTPUT}`);
  console.log(
    `listings=${report.metrics.listing_count} pass_rate=${(publishPassRate * 100).toFixed(2)}% stale=${(
      staleRate * 100
    ).toFixed(2)}% search_hit_rate=${(search.hitRate * 100).toFixed(2)}% blockers=${blockers.length} warnings=${debtWarnings.length}`
  );

  if (!report.ok) {
    throw new Error(`Publish readiness gate failed: ${blockers.join("; ")}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
