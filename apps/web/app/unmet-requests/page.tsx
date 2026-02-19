import Link from "next/link";
import { CopyableCommand } from "../../components/copyable-command";
import { getUnmetRequests } from "../../lib/api";
import { createPageMetadata } from "../../lib/metadata";
import { formatRelativeTime } from "../../lib/time";

export const revalidate = 60;
export const metadata = createPageMetadata({
  title: "Unmet CLI Demand",
  description:
    "See which CLI capabilities agents are requesting most but cannot currently resolve in the registry.",
  path: "/unmet-requests"
});

export default async function UnmetRequestsPage() {
  const unmet = await getUnmetRequests(100);
  const top = unmet.slice(0, 50);
  const totalSignals = top.reduce((sum, entry) => sum + entry.count, 0);

  return (
    <div className="page grid">
      <section>
        <p className="kicker">Unmet Demand</p>
        <h1 className="page-title">CLIs agents ask for but cannot find.</h1>
        <p className="page-subtitle">
          Public demand signals from real agent queries. Use this board to prioritize new listings
          and command-map coverage.
        </p>
      </section>

      <section className="grid grid-3">
        <article className="stat-card">
          <p className="stat-label">Unmet Queries</p>
          <p className="stat-value">{top.length}</p>
          <p className="stat-meta">Top unresolved intents</p>
        </article>
        <article className="stat-card">
          <p className="stat-label">Total Signals</p>
          <p className="stat-value">{totalSignals}</p>
          <p className="stat-meta">Search misses recorded</p>
        </article>
        <article className="stat-card">
          <p className="stat-label">Submit Path</p>
          <p className="stat-value">1 step</p>
          <p className="stat-meta">`clime submit` or web form</p>
        </article>
      </section>

      <section>
        <div className="section-label">Demand Board</div>
        {top.length === 0 ? (
          <div className="grid" style={{ gap: "8px" }}>
            <p className="page-subtitle" style={{ marginTop: 0 }}>
              No unmet requests yet. Search activity will populate this board automatically.
            </p>
            <div className="badge-row">
              <Link href="/submissions" className="badge verified">
                Submit a missing CLI
              </Link>
            </div>
          </div>
        ) : (
            <div className="ranking-list">
            <div className="ranking-header">
              <div className="ranking-position">#</div>
              <div className="ranking-name">Requested Capability</div>
              <div className="ranking-bar-wrap" aria-hidden="true">
                <div className="ranking-header-bar" />
              </div>
              <div className="ranking-stat">Count</div>
              <div className="ranking-trend">Last Seen</div>
            </div>
            {top.map((entry, index) => {
              const width = Math.max((entry.count / Math.max(top[0]?.count ?? 1, 1)) * 100, 8);
              return (
                <div className="ranking-row" key={entry.id}>
                  <div className="ranking-position">{index + 1}</div>
                  <div className="ranking-name">{entry.query}</div>
                  <div className="ranking-bar-wrap" aria-hidden="true">
                    <div className="ranking-bar" style={{ width: `${width}%` }} />
                  </div>
                  <div className="ranking-stat">{entry.count}</div>
                  <div className="ranking-trend flat">{formatRelativeTime(entry.last_seen)}</div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="card">
        <div className="section-label">Contribute</div>
        <p className="page-subtitle" style={{ marginTop: 0 }}>
          If you maintain a missing CLI, submit it directly:
        </p>
        <div className="command-copy-row">
          <CopyableCommand value={'clime submit --name "mycli" --repo "github.com/org/mycli"'} compact />
          <Link href="/submissions" className="copy-button">
            Open Submit
          </Link>
        </div>
      </section>
    </div>
  );
}
