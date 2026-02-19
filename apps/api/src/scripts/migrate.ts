import { PostgresPersistence } from "../lib/persistence.js";

async function run() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to run migrations.");
  }

  const persistence = new PostgresPersistence(databaseUrl);
  try {
    await persistence.migrate();
    console.log("Migrations applied successfully.");
  } finally {
    await persistence.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
