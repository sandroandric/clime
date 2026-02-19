import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CliProfile, WorkflowChain } from "@cli-me/shared-types";

interface CuratedDataset {
  generated_at: string;
  clis: CliProfile[];
  workflows: WorkflowChain[];
  failures: unknown[];
}

interface SmokeRun {
  cli_slug: string;
  status: "pass" | "fail";
}

interface SmokeSummary {
  generated_at: string;
  auto_curated_checked: number;
  pass_count: number;
  fail_count: number;
  pass_rate: number;
  runs: SmokeRun[];
}

const ROOT = resolve(process.cwd());
const CURATED_JSON = resolve(ROOT, "infra/generated/curated-listings.json");
const CURATED_TS = resolve(ROOT, "apps/api/src/data/curated-generated.ts");
const CURATED_REPORT = resolve(ROOT, "infra/generated/curated-generation-report.json");
const SMOKE_SUMMARY = resolve(ROOT, "infra/generated/auto-smoke-summary.json");

function hasTag(cli: CliProfile, tag: string): boolean {
  return cli.identity.category_tags.includes(tag);
}

function toModule(clis: CliProfile[], workflows: WorkflowChain[]): string {
  return [
    'import type { CliProfile, WorkflowChain } from "@cli-me/shared-types";',
    "",
    `export const generatedCuratedClis: CliProfile[] = ${JSON.stringify(clis, null, 2)};`,
    "",
    `export const generatedCuratedWorkflows: WorkflowChain[] = ${JSON.stringify(workflows, null, 2)};`,
    ""
  ].join("\n");
}

function main() {
  const curated = JSON.parse(readFileSync(CURATED_JSON, "utf-8")) as CuratedDataset;
  const smoke = JSON.parse(readFileSync(SMOKE_SUMMARY, "utf-8")) as SmokeSummary;

  const passedAuto = new Set(smoke.runs.filter((run) => run.status === "pass").map((run) => run.cli_slug));

  const keptClis = curated.clis.filter((cli) => {
    if (hasTag(cli, "gold-curated")) {
      return true;
    }
    if (hasTag(cli, "auto-curated")) {
      return passedAuto.has(cli.identity.slug);
    }
    return false;
  });

  const keptSlugs = new Set(keptClis.map((cli) => cli.identity.slug));

  const keptWorkflows = curated.workflows
    .map((workflow) => {
      const steps = workflow.steps
        .filter((step) => keptSlugs.has(step.cli_slug))
        .map((step, idx) => ({ ...step, step_number: idx + 1 }));
      return {
        ...workflow,
        updated_at: new Date().toISOString(),
        steps
      } as WorkflowChain;
    })
    .filter((workflow) => workflow.steps.length > 0);

  const nextDataset: CuratedDataset = {
    generated_at: new Date().toISOString(),
    clis: keptClis,
    workflows: keptWorkflows,
    failures: curated.failures
  };

  writeFileSync(CURATED_JSON, JSON.stringify(nextDataset, null, 2));
  writeFileSync(CURATED_TS, toModule(keptClis, keptWorkflows));

  const report = {
    generated_at: nextDataset.generated_at,
    mode: "smoke-pruned",
    source_counts: {
      previous_clis: curated.clis.length,
      previous_workflows: curated.workflows.length,
      auto_smoke_checked: smoke.auto_curated_checked,
      auto_smoke_pass: smoke.pass_count,
      auto_smoke_fail: smoke.fail_count,
      auto_smoke_pass_rate: smoke.pass_rate
    },
    output_counts: {
      clis: keptClis.length,
      workflows: keptWorkflows.length,
      gold_curated: keptClis.filter((cli) => hasTag(cli, "gold-curated")).length,
      auto_curated: keptClis.filter((cli) => hasTag(cli, "auto-curated")).length
    },
    notes: [
      "Kept all gold-curated listings.",
      "Kept only smoke-pass auto-curated listings from auto-smoke-summary.",
      "Workflows were pruned to surviving CLI steps and re-numbered."
    ]
  };

  writeFileSync(CURATED_REPORT, JSON.stringify(report, null, 2));

  console.log(
    `Pruned curated dataset: clis ${curated.clis.length} -> ${keptClis.length}, workflows ${curated.workflows.length} -> ${keptWorkflows.length}`
  );
  console.log(
    `Kept gold=${report.output_counts.gold_curated} auto-pass=${report.output_counts.auto_curated} (smoke pass rate ${smoke.pass_rate})`
  );
}

main();
