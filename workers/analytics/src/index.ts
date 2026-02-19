import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface VerificationRun {
  cli_slug: string;
  status: "pass" | "fail" | "skipped";
}

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(THIS_DIR, "../../..");

export function computeCompatibilityLeaderboard(runs: VerificationRun[]) {
  const aggregate = new Map<string, { pass: number; fail: number; skipped: number }>();

  for (const run of runs) {
    const bucket = aggregate.get(run.cli_slug) ?? { pass: 0, fail: 0, skipped: 0 };
    bucket[run.status] += 1;
    aggregate.set(run.cli_slug, bucket);
  }

  return Array.from(aggregate.entries())
    .map(([cli, stats]) => {
      const score = stats.pass * 2 - stats.fail;
      return {
        cli,
        score,
        ...stats
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 50);
}

export async function run() {
  const verificationPath = resolve(ROOT_DIR, "infra/generated/verification-runs.json");
  const outputPath = resolve(ROOT_DIR, "infra/generated/analytics-snapshot.json");

  const parsed = JSON.parse(readFileSync(verificationPath, "utf-8")) as {
    runs: VerificationRun[];
  };
  const ranking = computeCompatibilityLeaderboard(parsed.runs);

  writeFileSync(
    outputPath,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        compatibility_leaderboard: ranking
      },
      null,
      2
    )
  );

  console.log(`Wrote analytics snapshot -> ${outputPath}`);
}

const isEntrypoint =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isEntrypoint) {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
