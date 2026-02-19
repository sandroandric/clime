import { createSeedData } from "../data/seed.js";
import { PostgresPersistence } from "../lib/persistence.js";

async function run() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to seed data.");
  }

  const persistence = new PostgresPersistence(databaseUrl);
  try {
    const result = await persistence.seed(createSeedData());
    if (result.seeded) {
      console.log("Seed data inserted successfully.");
      return;
    }

    console.log(`Seed skipped: existing CLI rows found (${result.existingCliCount}).`);
  } finally {
    await persistence.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
