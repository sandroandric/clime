import { createSeedData } from "../data/seed.js";
import { PostgresPersistence } from "../lib/persistence.js";

async function run() {
  // Seed synchronization should not depend on external embedding providers.
  process.env.CLIME_EMBEDDING_PROVIDER = "local";
  // Keep production canonical with generated curated seed; remove deprecated slugs/workflows.
  process.env.CLIME_SYNC_PRUNE = "true";

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to sync seed data.");
  }

  const persistence = new PostgresPersistence(databaseUrl);
  try {
    console.log(`Using embedding provider: ${process.env.CLIME_EMBEDDING_PROVIDER}`);
    const result = await persistence.syncSeed(createSeedData());
    console.log(
      `Seed sync complete. CLIs: ${result.cliCount}, workflows: ${result.workflowCount}, changes: ${result.changeCount}, pruned=${result.pruned}`
    );
  } finally {
    await persistence.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
