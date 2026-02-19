import { createSeedData } from "../data/seed.js";
import { InstallChecksumResolver } from "../lib/install-checksum-resolver.js";
import { PostgresPersistence } from "../lib/persistence.js";
import { RegistryStore } from "../lib/store.js";

async function run() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to refresh install checksums.");
  }

  const scope = (process.env.CLIME_CHECKSUM_REFRESH_SCOPE ?? "top").trim().toLowerCase() === "all"
    ? "all"
    : "top";
  const limit = Math.max(1, Number(process.env.CLIME_CHECKSUM_REFRESH_LIMIT ?? 250));
  const resolver = new InstallChecksumResolver({
    cacheTtlSeconds: Number(process.env.CLIME_CHECKSUM_CACHE_TTL_SECONDS ?? 43_200),
    maxCacheEntries: Number(process.env.CLIME_CHECKSUM_MAX_CACHE_ENTRIES ?? 2000),
    requestTimeoutMs: Number(process.env.CLIME_CHECKSUM_REQUEST_TIMEOUT_MS ?? 10_000),
    maxDownloadBytes: Number(process.env.CLIME_CHECKSUM_MAX_DOWNLOAD_BYTES ?? 80 * 1024 * 1024)
  });

  const persistence = new PostgresPersistence(databaseUrl);

  try {
    const store = await RegistryStore.create(createSeedData(), persistence);
    const rankedClis = store
      .listClis()
      .slice()
      .sort((a, b) => b.identity.popularity_score - a.identity.popularity_score);
    const clis = scope === "all" ? rankedClis : rankedClis.slice(0, limit);

    let instructionCount = 0;
    let hadChecksumBefore = 0;
    let hasChecksumAfter = 0;
    let newlyResolved = 0;
    let changedChecksum = 0;
    let clisUpdated = 0;

    for (const cli of clis) {
      const instructions = store.getInstallInstructions(cli.identity.slug) ?? [];
      instructionCount += instructions.length;
      const beforeChecksums = instructions.map((instruction) => instruction.checksum);
      const beforeResolvedCount = beforeChecksums.filter((checksum) => Boolean(checksum)).length;
      hadChecksumBefore += beforeResolvedCount;

      const resolved = await resolver.enrichInstallInstructions(cli.identity.slug, instructions);
      const afterChecksums = resolved.map((instruction) => instruction.checksum);
      const afterResolvedCount = afterChecksums.filter((checksum) => Boolean(checksum)).length;
      hasChecksumAfter += afterResolvedCount;

      let cliChanged = false;
      for (let index = 0; index < resolved.length; index += 1) {
        const before = beforeChecksums[index];
        const after = afterChecksums[index];
        if (before === after) {
          continue;
        }
        cliChanged = true;
        if (!before && after) {
          newlyResolved += 1;
          continue;
        }
        changedChecksum += 1;
      }
      if (cliChanged) {
        clisUpdated += 1;
      }

      await store.persistResolvedInstallChecksums(cli.identity.slug, resolved);
    }

    console.log(
      JSON.stringify(
        {
          scope,
          limit,
          clis_processed: clis.length,
          install_instructions_processed: instructionCount,
          checksum_available_before: hadChecksumBefore,
          checksum_available_after: hasChecksumAfter,
          newly_resolved_checksums: newlyResolved,
          changed_existing_checksums: changedChecksum,
          clis_with_checksum_updates: clisUpdated
        },
        null,
        2
      )
    );
  } finally {
    await persistence.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
