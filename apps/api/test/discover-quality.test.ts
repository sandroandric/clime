import { describe, expect, it } from "vitest";
import { createSeedData } from "../src/data/seed.js";
import { RegistryStore } from "../src/lib/store.js";

const NATURAL_LANGUAGE_QUERIES: Array<{
  query: string;
  expectedAny: string[];
}> = [
  { query: "deploy a next.js app", expectedAny: ["vercel", "netlify", "railway", "fly"] },
  { query: "host a static website quickly", expectedAny: ["netlify", "vercel", "cloudflare"] },
  { query: "set up postgres database", expectedAny: ["supabase", "neon", "planetscale", "turso"] },
  { query: "run stripe payments in my backend", expectedAny: ["stripe"] },
  { query: "send transactional emails", expectedAny: ["resend", "postmark", "twilio"] },
  { query: "add user authentication", expectedAny: ["auth0"] },
  { query: "deploy infrastructure with kubernetes", expectedAny: ["kubectl", "helm", "k9s", "docker"] },
  { query: "inspect github pull requests from terminal", expectedAny: ["gh", "git", "github-actions"] },
  { query: "manage npm packages for node", expectedAny: ["npm", "pnpm", "yarn", "bun"] },
  { query: "monitor errors in production", expectedAny: ["sentry-cli", "datadog"] },
  { query: "configure cloudflare dns and cdn", expectedAny: ["cloudflare", "namecheap"] },
  { query: "run redis cache commands", expectedAny: ["redis-cli", "memcached"] },
  { query: "search data with meilisearch", expectedAny: ["meilisearch", "typesense", "algolia"] },
  { query: "execute http requests from terminal", expectedAny: ["httpie", "curl", "wget"] },
  { query: "process media with ffmpeg", expectedAny: ["ffmpeg", "imagemagick"] },
  { query: "run playwright end to end tests", expectedAny: ["playwright", "cypress", "jest", "vitest"] },
  { query: "deploy serverless app on aws", expectedAny: ["aws", "amplify", "serverless", "sst"] },
  { query: "build docker containers", expectedAny: ["docker", "podman"] },
  { query: "local llm inference tools", expectedAny: ["ollama", "huggingface-cli", "replicate"] },
  { query: "sync files between servers", expectedAny: ["rsync", "scp", "curl"] }
];

describe("discover quality", () => {
  it("keeps top-5 relevance above 80% across natural-language tasks", async () => {
    const store = await RegistryStore.create(createSeedData());

    let relevant = 0;
    for (const testCase of NATURAL_LANGUAGE_QUERIES) {
      const results = await store.discoverClis(testCase.query, 5);
      const slugs = results.map((entry) => entry.cli.slug);
      if (slugs.some((slug) => testCase.expectedAny.includes(slug))) {
        relevant += 1;
      }
    }

    const relevance = relevant / NATURAL_LANGUAGE_QUERIES.length;
    expect(relevance).toBeGreaterThanOrEqual(0.8);
  });

  it("elevates multi-intent coverage for deploy+database+payments tasks", async () => {
    const store = await RegistryStore.create(createSeedData());
    const results = await store.discoverClis("deploy a next.js app with postgres and stripe", 5);
    const slugs = results.map((entry) => entry.cli.slug);

    expect(slugs).toContain("vercel");
    expect(
      slugs.some((slug) => ["supabase", "neon", "planetscale", "turso", "prisma"].includes(slug))
    ).toBe(true);
    expect(slugs.some((slug) => ["stripe"].includes(slug))).toBe(true);
  });

  it("suppresses weak auto-indexed short-slug noise for payments intent queries", async () => {
    const store = await RegistryStore.create(createSeedData());
    const results = await store.discoverClis("configure card payments and webhooks", 5);
    const slugs = results.map((entry) => entry.cli.slug);

    expect(slugs).toContain("stripe");
    expect(
      results.some(
        (entry) =>
          entry.cli.verification_status === "auto-indexed" && entry.cli.slug.length <= 2
      )
    ).toBe(false);
  });
});
