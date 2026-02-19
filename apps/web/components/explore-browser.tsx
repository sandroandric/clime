"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CATEGORY_FILTER_ALIASES, CATEGORY_TAXONOMY } from "../lib/category-taxonomy";

type ExploreEntry = {
  slug: string;
  name: string;
  description: string;
  publisher: string;
  verification_status: string;
  trust_score: number;
  popularity_score: number;
  last_updated: string;
  category_tags: string[];
  command_names: string[];
};

type ExploreBrowserProps = {
  entries: ExploreEntry[];
  publishers: string[];
  initial: {
    q: string;
    category: string;
    status: string;
    publisher: string;
    sort: string;
  };
};

function statusLabel(value: string) {
  if (value === "publisher-verified") {
    return "Claim Verified";
  }
  if (value === "community-curated") {
    return "Community Curated";
  }
  return "Observed";
}

function statusClass(value: string) {
  if (value === "publisher-verified") {
    return "verified";
  }
  if (value === "community-curated") {
    return "community";
  }
  return "neutral";
}

export function ExploreBrowser({ entries, publishers, initial }: ExploreBrowserProps) {
  const [q, setQ] = useState(initial.q);
  const [category, setCategory] = useState(initial.category);
  const [status, setStatus] = useState(initial.status);
  const [publisher, setPublisher] = useState(initial.publisher);
  const [sort, setSort] = useState(initial.sort);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entries) {
      for (const categoryDef of CATEGORY_TAXONOMY) {
        const matchesCategory = entry.category_tags.some((tag) => {
          const normalizedTag = tag.toLowerCase();
          return categoryDef.matchers.some((matcher) => normalizedTag.includes(matcher));
        });
        if (matchesCategory) {
          counts.set(categoryDef.slug, (counts.get(categoryDef.slug) ?? 0) + 1);
        }
      }
    }
    return counts;
  }, [entries]);

  const categoryOptions = useMemo(
    () =>
      CATEGORY_TAXONOMY.filter((entry) => (categoryCounts.get(entry.slug) ?? 0) > 0).map((entry) => ({
        slug: entry.slug,
        label: entry.label
      })),
    [categoryCounts]
  );

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    const selectedCategory = category.trim().toLowerCase();
    const selectedStatus = status.trim().toLowerCase();
    const selectedPublisher = publisher.trim().toLowerCase();

    return entries.filter((entry) => {
      const haystack = [
        entry.name,
        entry.slug,
        entry.description,
        entry.publisher,
        ...entry.category_tags,
        ...entry.command_names
      ]
        .join(" ")
        .toLowerCase();

      const matchesQuery = query ? haystack.includes(query) : true;
      const matchesCategory = selectedCategory
        ? entry.category_tags.some((tag) => {
            const normalizedTag = tag.toLowerCase();
            const aliases = CATEGORY_FILTER_ALIASES[selectedCategory] ?? [selectedCategory];
            return aliases.some((alias) => normalizedTag.includes(alias));
          })
        : true;
      const matchesStatus = selectedStatus ? entry.verification_status === selectedStatus : true;
      const matchesPublisher = selectedPublisher
        ? entry.publisher.toLowerCase() === selectedPublisher
        : true;

      return matchesQuery && matchesCategory && matchesStatus && matchesPublisher;
    });
  }, [entries, q, category, status, publisher]);

  const sorted = useMemo(() => {
    const next = [...filtered];
    next.sort((a, b) => {
      const curatedA = a.verification_status === "community-curated" || a.verification_status === "publisher-verified";
      const curatedB = b.verification_status === "community-curated" || b.verification_status === "publisher-verified";
      if (curatedA !== curatedB) {
        return curatedA ? -1 : 1;
      }
      if (sort === "name") {
        return a.name.localeCompare(b.name);
      }
      if (sort === "queries") {
        return b.popularity_score - a.popularity_score;
      }
      if (sort === "recently-added") {
        return Date.parse(b.last_updated) - Date.parse(a.last_updated);
      }
      return b.trust_score - a.trust_score;
    });
    return next;
  }, [filtered, sort]);

  return (
    <>
      <section className="card">
        <div className="section-label">Filters</div>
        <div className="grid grid-3">
          <input
            className="form-input"
            placeholder="Search CLIs or tasks"
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
          <select
            className="form-select"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="">All categories</option>
            {categoryOptions.map((entry) => (
              <option key={entry.slug} value={entry.slug}>
                {entry.label}
              </option>
            ))}
          </select>
          <select
            className="form-select"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">All statuses</option>
            <option value="publisher-verified">Claim verified</option>
            <option value="community-curated">Community curated</option>
            <option value="auto-indexed">Observed</option>
          </select>
          <select
            className="form-select"
            value={publisher}
            onChange={(event) => setPublisher(event.target.value)}
          >
            <option value="">All publishers</option>
            {publishers.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
          <select
            className="form-select"
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            <option value="trust">Sort: trust score</option>
            <option value="queries">Sort: queries/week</option>
            <option value="name">Sort: alphabetical</option>
            <option value="recently-added">Sort: recently added</option>
          </select>
          <button
            type="button"
            className="copy-button"
            onClick={() => {
              setQ("");
              setCategory("");
              setStatus("");
              setPublisher("");
              setSort("trust");
            }}
          >
            Reset Filters
          </button>
        </div>
        <p className="stat-meta" style={{ marginTop: "8px" }}>
          {sorted.length} result{sorted.length === 1 ? "" : "s"} shown instantly.
        </p>
      </section>

      <section className="card">
        <div className="section-label">Category Quick Links</div>
        <div className="badge-row">
          {categoryOptions.slice(0, 16).map((entry) => (
            <button
              type="button"
              key={`quick-${entry.slug}`}
              className={`badge neutral badge-interactive${category === entry.slug ? " active" : ""}`}
              onClick={() => setCategory(entry.slug)}
            >
              {entry.label} ({categoryCounts.get(entry.slug) ?? 0})
            </button>
          ))}
          <Link href="/categories" className="badge verified">
            Open comparison tables
          </Link>
        </div>
      </section>

      <section>
        <div className="section-label">All CLIs</div>
        {sorted.length === 0 ? (
          <article className="card">
            <p className="page-subtitle" style={{ marginTop: 0 }}>
              No CLIs match your current filters. Clear one or more filters to see results.
            </p>
          </article>
        ) : (
          <div className="grid grid-3">
            {sorted.map((cli) => (
              <article className="card" key={cli.slug}>
                <h2 className="workflow-card-title">
                  <Link href={`/cli/${cli.slug}`}>{cli.name}</Link>
                </h2>
                <p className="workflow-desc">{cli.description}</p>
                <div className="badge-row" style={{ marginTop: "8px" }}>
                  <span className={`badge ${statusClass(cli.verification_status)}`}>
                    {statusLabel(cli.verification_status)}
                  </span>
                  <span className="badge neutral">{cli.publisher}</span>
                </div>
                <p className="stat-meta" style={{ marginTop: "8px" }}>
                  Trust: {cli.trust_score.toFixed(1)} · Queries: {cli.popularity_score.toFixed(1)}
                </p>
                <div className="badge-row" style={{ marginTop: "8px" }}>
                  {cli.category_tags.slice(0, 3).map((tag) => (
                    <span key={`${cli.slug}-${tag}`} className="badge neutral">
                      {tag}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
