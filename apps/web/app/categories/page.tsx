import { getCliSummaries } from "../../lib/api";
import { CategoriesBrowser } from "../../components/categories-browser";
import { createPageMetadata } from "../../lib/metadata";
import { CATEGORY_TAXONOMY } from "../../lib/category-taxonomy";

export const revalidate = 60;
export const metadata = createPageMetadata({
  title: "CLI Task Categories",
  description:
    "Browse CLIs by task with side-by-side comparisons for auth complexity, install method, trust score, and agent compatibility.",
  path: "/categories"
});

const MAX_CATEGORY_ROWS = 10;

function inferFreeTier(
  categoryTags: string[],
  description: string
): "yes" | "no" | "unknown" {
  const haystack = `${categoryTags.join(" ")} ${description}`.toLowerCase();
  if (
    haystack.includes("paid-only") ||
    haystack.includes("no free tier") ||
    haystack.includes("enterprise-only")
  ) {
    return "no";
  }
  if (
    haystack.includes("free tier") ||
    haystack.includes("open source") ||
    haystack.includes("oss")
  ) {
    return "yes";
  }
  return "unknown";
}

type Props = {
  searchParams: Promise<{ sort?: "trust" | "compat" }>;
};

export default async function CategoriesPage({ searchParams }: Props) {
  const { sort } = await searchParams;
  const sortBy = sort === "compat" ? "compat" : "trust";
  const clis = await getCliSummaries();

  const normalizedTagsBySlug = new Map(
    clis.map((cli) => [cli.slug, cli.category_tags.map((tag) => tag.toLowerCase())] as const)
  );

  const canonicalRows = CATEGORY_TAXONOMY.map((category) => {
    const matches = clis.filter((cli) => {
      const tags = normalizedTagsBySlug.get(cli.slug) ?? [];
      return category.matchers.some((matcher) => tags.some((tag) => tag.includes(matcher)));
    });
    return {
      slug: category.slug,
      label: category.label,
      count: matches.length,
      items: matches
    };
  }).filter((row) => row.count > 0);

  const rows = canonicalRows
    .map((row) => ({
      slug: row.slug,
      label: row.label,
      count: row.count,
      display_count: Math.min(row.count, MAX_CATEGORY_ROWS),
      truncated: row.count > MAX_CATEGORY_ROWS,
      items: row.items.slice(0, MAX_CATEGORY_ROWS).map((cli) => ({
        slug: cli.slug,
        name: cli.name,
        auth_type: cli.auth_type,
        install_methods: cli.install_methods,
        trust_score: cli.trust_score,
        compatibility_score: cli.compatibility_score,
        free_tier: inferFreeTier(cli.category_tags, cli.description)
      }))
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  return (
    <div className="page grid">
      <section>
        <p className="kicker">Categories</p>
        <h1 className="page-title">Browse by task intent.</h1>
        <p className="page-subtitle">
          Compare CLIs by what you are trying to accomplish, with trust and compatibility signals.
        </p>
      </section>
      <CategoriesBrowser rows={rows} initialSort={sortBy} />
    </div>
  );
}
