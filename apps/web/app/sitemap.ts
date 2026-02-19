import type { MetadataRoute } from "next";
import { blogPosts } from "../lib/blog";
import { getCliSummaries, getPublisherClaims, getWorkflows } from "../lib/api";

function toSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://clime.sh";
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/explore`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/workflows`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/rankings`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/unmet-requests`, changeFrequency: "daily", priority: 0.85 },
    { url: `${base}/demo`, changeFrequency: "weekly", priority: 0.75 },
    { url: `${base}/benchmarks`, changeFrequency: "weekly", priority: 0.75 },
    { url: `${base}/publishers`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/categories`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/submissions`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/blog`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/leaderboards`, changeFrequency: "monthly", priority: 0.5 }
  ];

  const [clis, workflows, claims] = await Promise.allSettled([
    getCliSummaries(),
    getWorkflows(),
    getPublisherClaims()
  ]);
  const cliRoutes =
    clis.status === "fulfilled"
      ? clis.value.map((cli) => ({
          url: `${base}/cli/${cli.slug}`,
          changeFrequency: "weekly" as const,
          priority: 0.8
        }))
      : [];
  const workflowRoutes =
    workflows.status === "fulfilled"
      ? workflows.value.map((workflow) => ({
          url: `${base}/workflows/${workflow.slug}`,
          changeFrequency: "weekly" as const,
          priority: 0.75
        }))
      : [];
  const publisherRoutes = (() => {
    const ids = new Set<string>();
    if (clis.status === "fulfilled") {
      for (const cli of clis.value) {
        ids.add(toSlug(cli.publisher));
      }
    }
    if (claims.status === "fulfilled") {
      for (const claim of claims.value) {
        ids.add(toSlug(claim.publisher_name));
      }
    }
    return [...ids]
      .filter(Boolean)
      .map((id) => ({
        url: `${base}/publisher/${id}`,
        changeFrequency: "weekly" as const,
        priority: 0.6
      }));
  })();

  const blogRoutes = blogPosts.map((post) => ({
    url: `${base}/blog/${post.slug}`,
    changeFrequency: "monthly" as const,
    priority: 0.65
  }));

  return [...staticRoutes, ...cliRoutes, ...workflowRoutes, ...publisherRoutes, ...blogRoutes];
}
