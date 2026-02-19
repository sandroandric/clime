import { getCliSummaries } from "../../lib/api";
import { createPageMetadata } from "../../lib/metadata";
import { ExploreBrowser } from "../../components/explore-browser";

export const revalidate = 60;
export const metadata = createPageMetadata({
  title: "Explore CLI Tools",
  description:
    "Browse all CLI listings by category, publisher, verification status, trust score, and compatibility.",
  path: "/explore"
});

type Props = {
  searchParams: Promise<{
    q?: string;
    category?: string;
    status?: string;
    publisher?: string;
    sort?: string;
  }>;
};

export default async function ExplorePage({ searchParams }: Props) {
  const params = await searchParams;
  const clis = await getCliSummaries();

  const q = params.q?.trim().toLowerCase() ?? "";
  const category = params.category?.trim().toLowerCase() ?? "";
  const status = params.status?.trim().toLowerCase() ?? "";
  const publisher = params.publisher?.trim().toLowerCase() ?? "";
  const sort = params.sort ?? "trust";

  const publishers = [...new Set(clis.map((cli) => cli.publisher))].sort((a, b) => a.localeCompare(b));
  const entries = clis.map((cli) => ({
    slug: cli.slug,
    name: cli.name,
    description: cli.description,
    publisher: cli.publisher,
    verification_status: cli.verification_status,
    trust_score: cli.trust_score,
    popularity_score: cli.popularity_score,
    last_updated: cli.last_updated,
    category_tags: cli.category_tags,
    command_names: cli.command_signals
  }));

  return (
    <div className="page grid">
      <section>
        <p className="kicker">EXPLORE</p>
        <h1 className="page-title">Browse the CLI landscape.</h1>
        <p className="page-subtitle">
          Filter and sort {clis.length} command-line tools by category, publisher, and trust level.
        </p>
      </section>

      <ExploreBrowser
        entries={entries}
        publishers={publishers}
        initial={{ q, category, status, publisher, sort }}
      />
    </div>
  );
}
