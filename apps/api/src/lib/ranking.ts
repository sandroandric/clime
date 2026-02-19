import type { CliProfile, RankingSnapshot, RankingType, UnmetRequest } from "@cli-me/shared-types";
import type { ReportPayload } from "@cli-me/shared-types";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function hashFraction(value: string) {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  }
  return (hash % 10_000) / 10_000;
}

function normalizeDisplayDelta(value: number) {
  return Math.round(clamp(value, -35, 35) * 10) / 10;
}

function avgCompatibilityRate(cli: CliProfile) {
  if (cli.identity.compatibility.length === 0) {
    return 0;
  }

  const total = cli.identity.compatibility.reduce((sum, item) => sum + item.success_rate, 0);
  return total / cli.identity.compatibility.length;
}

function reportStatsForCli(slug: string, reports: ReportPayload[]) {
  const now = Date.now();
  const cliReports = reports.filter((report) => report.cli_slug === slug);
  const success = cliReports.filter((report) => report.status === "success").length;
  const fail = cliReports.length - success;

  let recencyWeightedSuccess = 0;
  let recencyWeightedFail = 0;
  let last7 = 0;
  let prev7 = 0;

  for (const report of cliReports) {
    const ageDays = Math.max(0, (now - Date.parse(report.timestamp)) / (1000 * 60 * 60 * 24));
    const weight = Math.exp(-ageDays / 14);
    if (report.status === "success") {
      recencyWeightedSuccess += weight;
    } else {
      recencyWeightedFail += weight;
    }

    if (ageDays <= 7) {
      last7 += 1;
    } else if (ageDays <= 14) {
      prev7 += 1;
    }
  }

  const bayesianSuccessRate = (success + 2) / (cliReports.length + 4);
  return {
    count: cliReports.length,
    success,
    fail,
    recencyWeightedSuccess,
    recencyWeightedFail,
    bayesianSuccessRate,
    last7,
    prev7
  };
}

function seededTrendPercent(cli: CliProfile) {
  const seededOverride: Record<string, number> = {
    vercel: -1.4,
    railway: -1.1,
    netlify: -0.9,
    bun: -0.7,
    pip: -0.8,
    cypress: -1.6,
    supabase: -1.2,
    heroku: -2.1,
    firebase: -1.3,
    serverless: -0.8,
    contentful: -0.5,
    brew: 0.1,
    gh: 0.2,
    yarn: -0.1
  };
  if (cli.identity.slug in seededOverride) {
    return seededOverride[cli.identity.slug]!;
  }

  const fraction = hashFraction(`${cli.identity.slug}:trend`);
  const popularity = cli.identity.popularity_score;
  const variance = hashFraction(`${cli.identity.slug}:variance`);

  // Negative bucket (~20%) for realistic regressions.
  if (fraction < 0.2) {
    const magnitude =
      popularity >= 90 ? 0.5 + variance * 2.1 : popularity >= 70 ? 0.8 + variance * 2.6 : 1.2 + variance * 5.2;
    return normalizeDisplayDelta(-magnitude);
  }

  // Flat bucket (~14%) to avoid artificial all-up trend boards.
  if (fraction < 0.34) {
    return normalizeDisplayDelta((variance - 0.5) * 0.6);
  }

  // Positive bucket with tighter moves for dominant CLIs, wider for niche tools.
  if (popularity >= 90) {
    return normalizeDisplayDelta(0.6 + variance * 2.4);
  }

  if (popularity >= 70) {
    return normalizeDisplayDelta(0.6 + variance * 3.1);
  }

  return normalizeDisplayDelta(1.2 + variance * 10.8);
}

function trendPercentForCli(cli: CliProfile, stats: ReturnType<typeof reportStatsForCli>) {
  if (stats.last7 + stats.prev7 >= 6) {
      const baseline = Math.max(1, stats.prev7);
    return normalizeDisplayDelta(clamp(((stats.last7 - stats.prev7) / baseline) * 100, -35, 35));
  }
  return seededTrendPercent(cli);
}

export function computeRanking(
  type: RankingType,
  clis: CliProfile[],
  reports: ReportPayload[],
  unmetRequests: UnmetRequest[]
): RankingSnapshot {
  const generated_at = new Date().toISOString();

  if (type === "requested") {
    const entries = unmetRequests
      .slice()
      .sort((a, b) => b.count - a.count)
      .slice(0, 50)
      .map((request, index) => ({
        rank: index + 1,
        id: request.id,
        label: request.query,
        score: request.count,
        metadata: {
          last_seen: request.last_seen
        }
      }));

    return { type, generated_at, entries };
  }

  const sorted = clis
    .map((cli) => {
      const stats = reportStatsForCli(cli.identity.slug, reports);
      const compatibilityRate = avgCompatibilityRate(cli);
      const trendPercent = trendPercentForCli(cli, stats);

      const usedScoreRaw =
        cli.identity.popularity_score +
        stats.recencyWeightedSuccess * 18 -
        stats.recencyWeightedFail * 12 +
        stats.success * 1.2 -
        stats.fail * 0.8 +
        trendPercent * 0.8;

      const risingScoreRaw =
        50 +
        trendPercent * 4 +
        (stats.last7 - stats.prev7) * 6 +
        (stats.recencyWeightedSuccess - stats.recencyWeightedFail) * 8 +
        stats.count * 0.15;

      const compatScoreRaw = compatibilityRate * 100;

      const compatDelta = normalizeDisplayDelta(
        clamp(
          (compatibilityRate - 0.78) * 35 +
            (stats.bayesianSuccessRate - 0.72) * 22 +
            trendPercent * 0.18,
          -15,
          15
        )
      );

      const usedScore = clamp(usedScoreRaw, 0, 100);
      const risingScore = clamp(risingScoreRaw, 0, 100);
      const compatScore = clamp(compatScoreRaw, 0, 100);

      return {
        cli,
        stats,
        usedScore,
        risingScore,
        compatScore,
        trendPercent,
        compatDelta
      };
    })
    .sort((a, b) => {
      switch (type) {
        case "used":
          return b.usedScore - a.usedScore;
        case "rising":
          return b.trendPercent - a.trendPercent || b.risingScore - a.risingScore;
        case "compat":
          return b.compatScore - a.compatScore;
        default:
          return 0;
      }
    })
    .slice(0, 50);

  const entries = sorted.map((item, index) => ({
    rank: index + 1,
    id: item.cli.identity.slug,
    label: item.cli.identity.name,
    score:
      type === "used" ? item.usedScore : type === "rising" ? item.risingScore : item.compatScore,
    delta: type === "compat" ? item.compatDelta : item.trendPercent,
    metadata: {
      trust_score: item.cli.identity.trust_score,
      popularity_score: item.cli.identity.popularity_score,
      report_count: item.stats.count,
      success_rate: item.stats.bayesianSuccessRate,
      delta_source: item.stats.count >= 6 ? "measured" : "seeded"
    }
  }));

  return { type, generated_at, entries };
}
