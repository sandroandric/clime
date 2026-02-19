import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newDb } from "pg-mem";
import type { Pool } from "pg";
import { createSeedData } from "../src/data/seed.js";
import { PostgresPersistence } from "../src/lib/persistence.js";
import { RegistryStore } from "../src/lib/store.js";

let persistence: PostgresPersistence;

beforeAll(async () => {
  const mem = newDb({ autoCreateForeignKeyIndices: true, noAstCoverageCheck: true });
  const adapter = mem.adapters.createPg();
  const pool = new adapter.Pool() as unknown as Pool;
  persistence = new PostgresPersistence(pool);
});

afterAll(async () => {
  await persistence.close();
});

describe("postgres persistence", () => {
  it("persists submissions and reports across store restarts", async () => {
    const seed = createSeedData();

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
