import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newDb } from "pg-mem";
import type { Pool } from "pg";
import { createSeedData } from "../src/data/seed.js";
import { PostgresPersistence } from "../src/lib/persistence.js";
import { RegistryStore } from "../src/lib/store.js";
import type { RegistryData } from "../src/lib/types.js";

let persistence: PostgresPersistence;

beforeAll(async () => {
  const mem = newDb({ autoCreateForeignKeyIndices: true, noAstCoverageCheck: true });
  const adapter = mem.adapters.createPg() as { Pool: new () => Pool };
  const pool = new adapter.Pool();
  persistence = new PostgresPersistence(pool);
});

afterAll(async () => {
  await persistence.close();
});

function createMinimalSeedData(): RegistryData {
  const seed = createSeedData();
  const workflow = seed.workflows.find((entry) => entry.id === "wf_full_stack_saas");
  if (!workflow) {
    throw new Error("Expected wf_full_stack_saas workflow in seed data");
  }

  const requiredCliSlugs = new Set(["vercel", ...workflow.steps.map((step) => step.cli_slug)]);
  const clis = seed.clis.filter((cli) => requiredCliSlugs.has(cli.identity.slug));

  return {
    ...seed,
    clis,
    workflows: [workflow],
    submissions: [],
    publisherClaims: [],
    reports: [],
    usageEvents: [],
    unmetRequests: [],
    listingVersions: clis.flatMap((cli) => (cli.listing_version ? [cli.listing_version] : [])),
    changes: clis.map((cli, index) => ({
      id: `chg_test_${index + 1}`,
      kind: "listing_updated",
      entity_id: cli.identity.slug,
      occurred_at: new Date().toISOString(),
      payload: { version_number: cli.listing_version?.version_number ?? 1 }
    })),
    rankings: []
  };
}

describe("postgres persistence", () => {
  it("persists submissions and reports across store restarts", async () => {
    const seed = createMinimalSeedData();

    const first = await RegistryStore.create(seed, persistence);

    const submission = await first.addSubmission({
      type: "new_cli",
      submitter: "tester",
      content: {
        slug: "acme-cli"
      }
    });

    expect(submission.status).toBe("pending");

    const reportResult = await first.addReport({
      status: "success",
      cli_slug: "vercel",
      cli_version: "34.2.0",
      workflow_id: "wf_full_stack_saas",
      duration_ms: 1500,
      exit_code: 0,
      agent_name: "codex",
      agent_version: "1.0",
      os: "linux",
      arch: "x64",
      request_id: "report_restart_test",
      timestamp: new Date().toISOString()
    });

    expect(reportResult.duplicate).toBe(false);

    const second = await RegistryStore.create(seed, persistence);
    const results = await second.searchClis("deploy full stack saas", 10);

    expect(results.some((entry) => entry.cli.slug === "vercel")).toBe(true);
    expect(second.listPublisherClaims().length).toBeGreaterThanOrEqual(0);

    const duplicate = await second.addReport({
      status: "success",
      cli_slug: "vercel",
      cli_version: "34.2.0",
      workflow_id: "wf_full_stack_saas",
      duration_ms: 900,
      exit_code: 0,
      agent_name: "codex",
      agent_version: "1.0",
      os: "linux",
      arch: "x64",
      request_id: "report_restart_test",
      timestamp: new Date().toISOString()
    });
    expect(duplicate.duplicate).toBe(true);

    const ranking = await second.getRanking("used");
    expect(ranking.entries.length).toBeGreaterThan(0);
  }, 20000);
});
