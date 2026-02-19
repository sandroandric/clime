import { describe, expect, it } from "vitest";
import { createSeedData } from "../src/data/seed.js";
import { RegistryStore } from "../src/lib/store.js";

describe("semantic search", () => {
  it("finds deployment CLIs for natural-language queries", async () => {
    const store = await RegistryStore.create(createSeedData());
    const results = await store.searchClis("launch a jamstack website", 5);

    const slugs = results.map((entry) => entry.cli.slug);
    const deploymentCandidates = ["vercel", "netlify", "railway", "render", "fly", "amplify"];
    expect(slugs.some((slug) => deploymentCandidates.includes(slug))).toBe(true);
  });

  it("retrieves infra tooling for iac intent", async () => {
    const store = await RegistryStore.create(createSeedData());
    const results = await store.searchClis("provision infrastructure as code", 5);

    const slugs = results.map((entry) => entry.cli.slug);
    expect(slugs).toContain("terraform");
  });
});
