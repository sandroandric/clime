import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface SmokeRun {
  cli_slug: string;
  package_name: string | null;
  package_manager: string;
  binary: string;
  status: "pass" | "fail";
  install_status: "pass" | "fail";
  help_status: "pass" | "fail";
  version_status: "pass" | "fail";
  manual_required: boolean;
  blocking: boolean;
  reason: string;
  install_command: string;
  duration_ms: number;
  shard_index: number;
  shard_total: number;
  tested_at: string;
}

interface ShardResult {
  shard_index: number;
  shard_total: number;
  selected_count: number;
  pass_count: number;
  fail_count: number;
  pass_rate: number;
  runs: SmokeRun[];
}

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(THIS_DIR, "../../..");
const INPUT_DIR = resolve(ROOT, "infra/generated/smoke-runs");
const OUTPUT = resolve(ROOT, "infra/generated/auto-smoke-summary.json");

function main() {
  const files = readdirSync(INPUT_DIR).filter((file) => /^shard-\d+-of-\d+\.json$/.test(file));
  if (files.length === 0) {
    throw new Error("No shard outputs found in infra/generated/smoke-runs");
  }

  const allShards = files
    .map((file) => ({
      file,
      data: JSON.parse(readFileSync(resolve(INPUT_DIR, file), "utf-8")) as ShardResult
    }))
    .sort((a, b) => a.data.shard_index - b.data.shard_index);

  const expectedTotalEnv = Number(process.env.CLIME_SMOKE_SHARD_TOTAL_EXPECTED ?? "");
  const expectedTotal = Number.isInteger(expectedTotalEnv) && expectedTotalEnv > 0 ? expectedTotalEnv : null;

  const totalCounts = new Map<number, number>();
  for (const shard of allShards) {
    totalCounts.set(shard.data.shard_total, (totalCounts.get(shard.data.shard_total) ?? 0) + 1);
  }

  const inferredTotal = [...totalCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const selectedTotal = expectedTotal ?? inferredTotal;
  if (selectedTotal == null) {
    throw new Error("Could not infer shard_total from shard files");
  }

  const shards = allShards.filter((item) => item.data.shard_total === selectedTotal);
  if (shards.length === 0) {
    throw new Error(`No shard outputs matched shard_total=${selectedTotal}`);
  }
  if (allShards.length !== shards.length) {
    console.log(
      `Ignoring ${allShards.length - shards.length} shard file(s) not matching shard_total=${selectedTotal}`
    );
  }

  const runs = shards.flatMap((item) => item.data.runs);
  const dedup = new Map<string, SmokeRun>();
  for (const run of runs) {
    if (!dedup.has(run.cli_slug)) {
      dedup.set(run.cli_slug, run);
    }
  }

  const uniqueRuns = [...dedup.values()].sort((a, b) => a.cli_slug.localeCompare(b.cli_slug));
  const pass = uniqueRuns.filter((run) => run.status === "pass").length;
  const fail = uniqueRuns.length - pass;

  const byReason = new Map<string, number>();
  for (const run of uniqueRuns) {
    if (run.status === "fail") {
      byReason.set(run.reason, (byReason.get(run.reason) ?? 0) + 1);
    }
  }

  const summary = {
    generated_at: new Date().toISOString(),
    shard_files: shards.map((item) => item.file),
    shard_count: shards.length,
    auto_curated_checked: uniqueRuns.length,
    pass_count: pass,
    fail_count: fail,
    pass_rate: uniqueRuns.length ? Number((pass / uniqueRuns.length).toFixed(4)) : 0,
    manual_required_count: uniqueRuns.filter((run) => run.manual_required).length,
    blocking_failures: uniqueRuns.filter((run) => run.blocking).length,
    avg_duration_ms: uniqueRuns.length
      ? Math.round(uniqueRuns.reduce((sum, run) => sum + run.duration_ms, 0) / uniqueRuns.length)
      : 0,
    fail_reasons: [...byReason.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([reason, count]) => ({ reason, count })),
    runs: uniqueRuns
  };

  writeFileSync(OUTPUT, JSON.stringify(summary, null, 2));
  console.log(`Merged ${shards.length} shards -> ${OUTPUT}`);
  console.log(
    `auto_curated_checked=${summary.auto_curated_checked} pass=${summary.pass_count} fail=${summary.fail_count} pass_rate=${summary.pass_rate}`
  );
}

main();
