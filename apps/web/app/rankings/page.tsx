import { RankingsTabs } from "../../components/rankings-tabs";
import { getRanking } from "../../lib/api";
import { createPageMetadata } from "../../lib/metadata";
import Link from "next/link";

export const revalidate = 60;
export const metadata = createPageMetadata({
  title: "CLI Rankings and Trends",
  description:
    "Most used CLIs, rising tools, compatibility leaders, and unmet CLI demand signals from clime.",
  path: "/rankings"
});

export default async function RankingsPage() {
  const [used, rising, compat, requested] = await Promise.all([
    getRanking("used"),
    getRanking("rising"),
    getRanking("compat"),
    getRanking("requested")
  ]);

  return (
    <div className="page grid">
      <section>
        <p className="kicker">Rankings</p>
        <h1 className="page-title">CLI momentum and compatibility signals.</h1>
        <p className="page-subtitle">
          Compare usage, growth, compatibility, and unmet demand from real agent behavior.
        </p>
      </section>

      <section>
        <div className="section-label">Leaderboard Views</div>
        <p className="stat-meta" style={{ marginBottom: "8px" }}>
          Trend provenance: <strong>Measured</strong> = observed report data,{" "}
          <strong>Estimated</strong> = seeded fallback for low-volume CLIs.
        </p>
        <p className="stat-meta" style={{ marginBottom: "8px" }}>
          Need the full unmet-demand board?{" "}
          <Link href="/unmet-requests" className="inline-link">
            Open public unmet requests
          </Link>
        </p>
        <RankingsTabs
          groups={[
            { key: "used", title: "Most Used", snapshot: used },
            { key: "rising", title: "Rising", snapshot: rising },
            { key: "compat", title: "Best Compatibility", snapshot: compat },
            { key: "requested", title: "Most Requested", snapshot: requested }
          ]}
        />
      </section>
    </div>
  );
}
