import { describe, expect, it } from "vitest";
import { createSeedData } from "../src/data/seed.js";
import { RegistryStore } from "../src/lib/store.js";

describe("approved submission promotions", () => {
  it("includes approved submission listings in the live seed", () => {
    const seed = createSeedData();
    const slugs = new Set(seed.clis.map((cli) => cli.identity.slug));

    for (const slug of [
      "apify",
      "confluence",
      "ha",
      "jira",
      "n8nc",
      "proxctl",
      "qnap",
      "unifi",
      "yuki",
      "zoom",
    ]) {
      expect(slugs.has(slug)).toBe(true);
    }
  });

  it("makes promoted listings discoverable through registry search", async () => {
    const store = await RegistryStore.create(createSeedData());

    const jira = await store.searchClis("jira issue tracking", 5);
    const apify = await store.searchClis("deploy and run apify actors", 5);

    expect(jira.some((entry) => entry.cli.slug === "jira")).toBe(true);
    expect(apify.some((entry) => entry.cli.slug === "apify")).toBe(true);
  });
});
