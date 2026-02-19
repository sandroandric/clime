"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type CategoryItem = {
  slug: string;
  name: string;
  auth_type: string;
  install_methods: string[];
  trust_score: number;
  compatibility_score: number;
  free_tier: "yes" | "no" | "unknown";
};

type CategoryRow = {
  slug: string;
  label: string;
  count: number;
  display_count: number;
  truncated: boolean;
  items: CategoryItem[];
};

export function CategoriesBrowser({
  rows,
  initialSort
}: {
  rows: CategoryRow[];
  initialSort: "trust" | "compat";
}) {
  const [sortBy, setSortBy] = useState<"trust" | "compat">(initialSort);

  const sortedRows = useMemo(() => {
    return rows.map((row) => {
      const items = [...row.items].sort((a, b) => {
        if (sortBy === "compat") {
          return b.compatibility_score - a.compatibility_score;
        }
        return b.trust_score - a.trust_score;
      });
      return { ...row, items };
    });
  }, [rows, sortBy]);

  return (
    <>
      <section className="card">
        <div className="section-label">Sort</div>
        <div className="badge-row">
          <button
            type="button"
            className={`badge neutral badge-interactive${sortBy === "trust" ? " active" : ""}`}
            onClick={() => setSortBy("trust")}
          >
            trust score
          </button>
          <button
            type="button"
            className={`badge neutral badge-interactive${sortBy === "compat" ? " active" : ""}`}
            onClick={() => setSortBy("compat")}
          >
            compatibility
          </button>
        </div>
      </section>

      <section className="grid">
        {sortedRows.map((row) => (
          <article key={row.slug} className="card">
            <h2 className="workflow-card-title">{row.label}</h2>
            <p className="stat-meta">
              {row.truncated
                ? `Showing top ${row.display_count} of ${row.count} listings`
                : `${row.count} listings`}
            </p>
            <div className="category-table-wrap" style={{ marginTop: "8px" }}>
              <table className="category-table">
                <thead>
                  <tr>
                    <th>CLI</th>
                    <th>Auth</th>
                    <th>Install</th>
                    <th>Trust</th>
                    <th>Compat</th>
                    <th>Free Tier</th>
                  </tr>
                </thead>
                <tbody>
                  {row.items.map((cli) => (
                    <tr key={cli.slug}>
                      <td>
                        <Link href={`/cli/${cli.slug}`} className="inline-link">
                          {cli.name}
                        </Link>
                      </td>
                      <td>{cli.auth_type.replace(/_/g, " ")}</td>
                      <td>{cli.install_methods.slice(0, 2).join(", ") || "n/a"}</td>
                      <td>{cli.trust_score.toFixed(1)}</td>
                      <td>{Math.round(cli.compatibility_score * 100)}%</td>
                      <td>{cli.free_tier}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="stat-meta" style={{ marginTop: "8px" }}>
              <Link href={`/explore?category=${encodeURIComponent(row.slug)}`} className="inline-link">
                Open all {row.label} listings
              </Link>
            </p>
          </article>
        ))}
      </section>
    </>
  );
}
