import { describe, expect, it } from "vitest";
import { createSeedData } from "../src/data/seed.js";
import { RegistryStore } from "../src/lib/store.js";

const MULTI_INTENT_CASES: Array<{ query: string; expectedTop: string }> = [
  {
    query: "deploy nodejs api with postgres and stripe",
    expectedTop: "full-stack-saas"
  },
  {
    query: "build a saas with auth and payments",
    expectedTop: "full-stack-saas"
  },
  {
    query: "launch a full-stack product with database, billing, and email",
    expectedTop: "full-stack-saas"
  },
  {
    query: "ship a nextjs app with postgres and stripe checkout",
    expectedTop: "full-stack-saas"
  },
  {
    query: "create a subscription saas with login and transactional email",
    expectedTop: "full-stack-saas"
  },
  {
    query: "release an api with postgres storage and payments",
    expectedTop: "full-stack-saas"
  },
  {
    query: "deploy an app with auth, billing, and webhooks",
    expectedTop: "full-stack-saas"
  },
  {
    query: "build full stack app with supabase stripe resend auth0",
    expectedTop: "full-stack-saas"
  },
  {
    query: "set up a backend with database and monitoring",
    expectedTop: "database-setup"
  },
  {
    query: "provision infrastructure for backend deployment and observability",
    expectedTop: "infra-bootstrap"
  },
  {
    query: "deploy a static site with CDN and analytics",
    expectedTop: "jamstack-launch"
  }
];

describe("workflow multi-intent ranking", () => {
  it("prefers full coverage workflow over single-intent edge deployment", async () => {
    const store = await RegistryStore.create(createSeedData());
    const results = store.searchWorkflows("deploy nodejs api with postgres and stripe", 5);
    const slugs = results.map((workflow) => workflow.slug);

    expect(slugs[0]).toBe("full-stack-saas");

    const fullStackRank = slugs.indexOf("full-stack-saas");
    const edgeRank = slugs.indexOf("edge-api-launch");
    if (edgeRank !== -1) {
      expect(edgeRank).toBeGreaterThan(fullStackRank);
    }
  });

  it.each(MULTI_INTENT_CASES)(
    "returns expected top workflow for query: $query",
    async ({ query, expectedTop }) => {
      const store = await RegistryStore.create(createSeedData());
      const results = store.searchWorkflows(query, 5);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.slug).toBe(expectedTop);
    }
  );
});
