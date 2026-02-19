import type { Metadata } from "next";
import {
  getCliProfiles,
  getPublisherAnalyticsById,
  getPublisherClaims,
  getRanking,
  getWorkflows
} from "../../../lib/api";
import { createPageMetadata } from "../../../lib/metadata";

export const revalidate = 60;

type Params = {
  params: Promise<{ id: string }>;
};

function toSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function toTitle(value: string) {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const name = toTitle(id);
  return createPageMetadata({
    title: `${name} Publisher Dashboard`,
    description: `Telemetry-backed dashboard for ${name} CLI listings, usage trends, workflow appearances, and reliability signals.`,
    path: `/publisher/${id}`
  });
}

export default async function PublisherDashboardPage({ params }: Params) {
  const { id } = await params;

  const [claims, usedRanking, workflows, clis, analytics] = await Promise.all([
    getPublisherClaims(),
    getRanking("used"),
    getWorkflows(),
    getCliProfiles(),
    getPublisherAnalyticsById(id)
  ]);

  const publisherNames = new Set<string>();
  for (const cli of clis) {
    if (toSlug(cli.identity.publisher) === id) {
      publisherNames.add(cli.identity.publisher);
    }
  }
  for (const claim of claims) {
    if (toSlug(claim.publisher_name) === id) {
      publisherNames.add(claim.publisher_name);
    }
  }

  const resolvedName = [...publisherNames][0] ?? toTitle(id);

  const publisherCliSlugs = new Set<string>();
  for (const cli of clis) {
    if (toSlug(cli.identity.publisher) === id) {
      publisherCliSlugs.add(cli.identity.slug);
    }
  }
  for (const claim of claims) {
    if (toSlug(claim.publisher_name) === id) {
      publisherCliSlugs.add(claim.cli_slug);
    }
  }

  const workflowAppearances = workflows.reduce((sum, workflow) => {
    const steps = workflow.steps.filter((step) => publisherCliSlugs.has(step.cli_slug));
    return sum + steps.length;
  }, 0);

  const compatibilitySummary = clis
    .filter((cli) => publisherCliSlugs.has(cli.identity.slug))
    .flatMap((cli) => cli.identity.compatibility)
    .reduce<Record<string, { successRate: number; count: number }>>((acc, item) => {
      const key = item.agent_name;
      const bucket = acc[key] ?? { successRate: 0, count: 0 };
      bucket.successRate += item.success_rate;
      bucket.count += 1;
      acc[key] = bucket;
      return acc;
    }, {});

  const compatibilityRows = Object.entries(compatibilitySummary)
    .map(([agent, stats]) => ({
      agent,
      avg: stats.count > 0 ? (stats.successRate / stats.count) * 100 : 0
    }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 8);

  const rankingPositions = usedRanking.entries
    .filter((entry) => publisherCliSlugs.has(entry.id))
    .sort((a, b) => a.rank - b.rank);

  const topPosition = rankingPositions[0]?.rank;
  const reportSuccessRate =
    analytics.report_count > 0
      ? (analytics.success_reports / analytics.report_count) * 100
      : 0;
  const topQueries = analytics.top_queries;
  const topCliActivity = analytics.top_clis;
  const maxCliActivity = topCliActivity[0]?.count ?? 1;

  return (
    <div className="page grid">
      <section>
        <p className="kicker">Publisher Dashboard</p>
        <h1 className="page-title">{resolvedName}</h1>
        <p className="page-subtitle">
          Discovery, install behavior, reliability signals, and competitive position across agent traffic.
        </p>
      </section>

      <section>
        <div className="section-label">Publisher Stats</div>
        <div className="grid grid-4">
          <article className="stat-card">
            <p className="stat-label">Discovery Count</p>
            <p className="stat-value">{analytics.search_impressions}</p>
            <p className="stat-meta">Search impressions tied to this publisher</p>
          </article>
          <article className="stat-card">
            <p className="stat-label">Install Count</p>
            <p className="stat-value">{analytics.install_attempts}</p>
            <p className="stat-meta">Install guidance requests</p>
          </article>
          <article className="stat-card">
            <p className="stat-label">Report Count</p>
            <p className="stat-value">{analytics.report_count}</p>
            <p className="stat-meta">Telemetry reports from agents</p>
          </article>
          <article className="stat-card">
            <p className="stat-label">Report Success Rate</p>
            <p className="stat-value">{reportSuccessRate.toFixed(1)}%</p>
            <p className="stat-meta">Success vs. fail telemetry reports</p>
          </article>
        </div>
      </section>

      <section className="grid grid-2">
        <article className="card">
          <div className="section-label">Top CLI Activity</div>
          {topCliActivity.length === 0 ? (
            <p className="page-subtitle" style={{ marginTop: 0 }}>
              No CLI-level telemetry interactions yet.
            </p>
          ) : (
            <div className="ranking-list">
              {topCliActivity.map((row, index) => {
                const width = Math.max((row.count / maxCliActivity) * 100, 8);
                return (
                  <div className="ranking-row" key={row.cli_slug}>
                    <div className="ranking-position">{index + 1}</div>
                    <div className="ranking-name">{row.cli_slug}</div>
                    <div className="ranking-bar-wrap">
                      <div className="ranking-bar" style={{ width: `${width}%` }} />
                    </div>
                    <div className="ranking-stat">{row.count}</div>
                  </div>
                );
              })}
            </div>
          )}
        </article>

        <article className="card">
          <div className="section-label">Top Queries</div>
          {topQueries.length === 0 ? (
            <p className="page-subtitle" style={{ marginTop: 0 }}>
              No query attribution data available yet.
            </p>
          ) : (
            <div className="ranking-list">
              {topQueries.map((row, index) => (
                <div className="ranking-row" key={row.query}>
                  <div className="ranking-position">{index + 1}</div>
                  <div className="ranking-name">{row.query}</div>
                  <div className="ranking-stat">{row.count}</div>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>

      <section className="grid grid-2">
        <article className="card">
          <div className="section-label">Compatibility Summary</div>
          {compatibilityRows.length === 0 ? (
            <p className="page-subtitle" style={{ marginTop: 0 }}>
              No compatibility telemetry yet for this publisher.
            </p>
          ) : (
            <div className="ranking-list">
              {compatibilityRows.map((row, index) => (
                <div className="ranking-row" key={row.agent}>
                  <div className="ranking-position">{index + 1}</div>
                  <div className="ranking-name">{row.agent}</div>
                  <div className="ranking-stat">{row.avg.toFixed(1)}%</div>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="card">
          <div className="section-label">Workflow Appearances</div>
          {workflowAppearances === 0 ? (
            <p className="page-subtitle" style={{ marginTop: 0 }}>
              No workflow placements detected for this publisher yet.
            </p>
          ) : (
            <p className="page-subtitle" style={{ marginTop: 0 }}>
              This publisher appears in {workflowAppearances} workflow steps across curated chains.
            </p>
          )}
        </article>
      </section>

      <section className="card">
        <div className="section-label">Competitive Position</div>
        <p className="page-subtitle" style={{ marginTop: 0 }}>
          {topPosition
            ? `Best listing rank in Most Used leaderboard: #${topPosition}.`
            : "No ranked listings yet for this publisher in the current snapshot."}
        </p>
      </section>
    </div>
  );
}
