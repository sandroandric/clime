import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { CliProfile } from "@cli-me/shared-types";

interface CuratedDataset {
  generated_at: string;
  clis: CliProfile[];
}

type SmokeStatus = "pass" | "fail";

interface SmokeRun {
  cli_slug: string;
  package_name: string | null;
  package_manager: string;
  binary: string;
  status: SmokeStatus;
  install_status: SmokeStatus;
  help_status: SmokeStatus;
  version_status: SmokeStatus;
  manual_required: boolean;
  blocking: boolean;
  reason: string;
  install_command: string;
  duration_ms: number;
  shard_index: number;
  shard_total: number;
  tested_at: string;
}

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(THIS_DIR, "../../..");
const INPUT = resolve(ROOT, "infra/generated/curated-listings.json");
const OUTPUT_DIR = resolve(ROOT, "infra/generated/smoke-runs");

const shardTotalRaw = Number.parseInt(process.env.CLIME_SMOKE_SHARD_TOTAL ?? "1", 10);
const shardIndexRaw = Number.parseInt(process.env.CLIME_SMOKE_SHARD_INDEX ?? "0", 10);
const maxListingsRaw = Number.parseInt(process.env.CLIME_SMOKE_MAX_LISTINGS ?? "0", 10);

const SHARD_TOTAL = Number.isFinite(shardTotalRaw) && shardTotalRaw > 0 ? shardTotalRaw : 1;
const SHARD_INDEX = Number.isFinite(shardIndexRaw) && shardIndexRaw >= 0 ? shardIndexRaw : 0;
const MAX_LISTINGS = Number.isFinite(maxListingsRaw) && maxListingsRaw > 0 ? maxListingsRaw : 0;
const OUTPUT = resolve(OUTPUT_DIR, `shard-${SHARD_INDEX}-of-${SHARD_TOTAL}.json`);

function compact(value: string, max = 280) {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function run(command: string, args: string[], timeout = 120_000) {
  const started = Date.now();
  const result = spawnSync(command, args, {
    encoding: "utf-8",
    timeout,
    maxBuffer: 4 * 1024 * 1024
  });
  const combined = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  return {
    ok: result.status === 0,
    status: result.status ?? -1,
    output: compact(combined || `exit:${result.status ?? "unknown"}`),
    duration: Date.now() - started
  };
}

function parseNpmPackage(command: string) {
  return command.match(/npm\s+install(?:\s+--global|\s+-g)?(?:\s+--[a-zA-Z0-9-]+)*\s+([^\s&|]+)/)?.[1] ?? null;
}

function sanitizeBinaryCandidate(candidate: string) {
  const trimmed = candidate.trim();
  if (!trimmed || trimmed.startsWith("-")) {
    return null;
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function inferBinary(listing: CliProfile) {
  const first = listing.commands[0]?.command?.split(/\s+/)?.[0] ?? "";
  const fromCommand = sanitizeBinaryCandidate(first);
  if (fromCommand) {
    return fromCommand;
  }
  return sanitizeBinaryCandidate(listing.identity.slug.split("/").pop() ?? listing.identity.slug) ?? "unknown";
}

function scopedPackageDir(baseDir: string, packageName: string) {
  if (!packageName.startsWith("@")) {
    return join(baseDir, "node_modules", packageName);
  }
  const parts = packageName.split("/");
  if (parts.length !== 2) {
    return join(baseDir, "node_modules", packageName);
  }
  return join(baseDir, "node_modules", parts[0], parts[1]);
}

function resolveBinCandidates(baseDir: string, packageName: string, preferred: string) {
  const candidates = new Set<string>();
  if (preferred && preferred !== "unknown") {
    candidates.add(preferred);
  }

  const packageDir = scopedPackageDir(baseDir, packageName);
  const packageJsonPath = join(packageDir, "package.json");
  if (existsSync(packageJsonPath)) {
    try {
      const parsed = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
        bin?: string | Record<string, string>;
      };
      if (typeof parsed.bin === "string") {
        const inferred = sanitizeBinaryCandidate(packageName.split("/").pop() ?? packageName);
        if (inferred) {
          candidates.add(inferred);
        }
      } else if (parsed.bin && typeof parsed.bin === "object") {
        for (const key of Object.keys(parsed.bin)) {
          const safe = sanitizeBinaryCandidate(key);
          if (safe) {
            candidates.add(safe);
          }
        }
      }
    } catch {
      // noop
    }
  }

  return [...candidates];
}

function makeManualRun(
  listing: CliProfile,
  installCommand: string,
  packageManager: string,
  reason: string
): SmokeRun {
  return {
    cli_slug: listing.identity.slug,
    package_name: null,
    package_manager: packageManager,
    binary: inferBinary(listing),
    status: "fail",
    install_status: "fail",
    help_status: "fail",
    version_status: "fail",
    manual_required: true,
    blocking: false,
    reason,
    install_command: installCommand,
    duration_ms: 0,
    shard_index: SHARD_INDEX,
    shard_total: SHARD_TOTAL,
    tested_at: new Date().toISOString()
  };
}

function smokeNpm(listing: CliProfile, installCommand: string): SmokeRun {
  const started = Date.now();
  const packageName = parseNpmPackage(installCommand);
  if (!packageName) {
    return {
      ...makeManualRun(listing, installCommand, "npm", "Could not parse npm package from install command"),
      blocking: true,
      manual_required: false,
      reason: "Could not parse npm package from install command"
    };
  }

  const tempDir = mkdtempSync(join(tmpdir(), "clime-smoke-"));

  try {
    const installRun = run(
      "npm",
      ["install", "--prefix", tempDir, "--no-fund", "--no-audit", "--silent", packageName],
      180_000
    );

    if (!installRun.ok) {
      const networkLike = /ENOTFOUND|ETIMEDOUT|EAI_AGAIN|network|TLS|timeout/i.test(installRun.output);
      return {
        cli_slug: listing.identity.slug,
        package_name: packageName,
        package_manager: "npm",
        binary: inferBinary(listing),
        status: "fail",
        install_status: "fail",
        help_status: "fail",
        version_status: "fail",
        manual_required: networkLike,
        blocking: !networkLike,
        reason: `Install failed: ${installRun.output}`,
        install_command: installCommand,
        duration_ms: Date.now() - started,
        shard_index: SHARD_INDEX,
        shard_total: SHARD_TOTAL,
        tested_at: new Date().toISOString()
      };
    }

    const preferredBinary = inferBinary(listing);
    const candidates = resolveBinCandidates(tempDir, packageName, preferredBinary);

    if (candidates.length === 0) {
      return {
        cli_slug: listing.identity.slug,
        package_name: packageName,
        package_manager: "npm",
        binary: preferredBinary,
        status: "fail",
        install_status: "pass",
        help_status: "fail",
        version_status: "fail",
        manual_required: true,
        blocking: false,
        reason: "Install succeeded but no runnable binary could be inferred",
        install_command: installCommand,
        duration_ms: Date.now() - started,
        shard_index: SHARD_INDEX,
        shard_total: SHARD_TOTAL,
        tested_at: new Date().toISOString()
      };
    }

    for (const candidate of candidates) {
      const binPath = join(tempDir, "node_modules", ".bin", candidate);
      if (!existsSync(binPath)) {
        continue;
      }

      const helpRun = run(binPath, ["--help"], 30_000);
      const versionRun = helpRun.ok
        ? run(binPath, ["--version"], 30_000)
        : run(binPath, ["-v"], 30_000);

      const status: SmokeStatus = helpRun.ok || versionRun.ok ? "pass" : "fail";
      const manual = status === "fail";
      const reason = status === "pass"
        ? `Install + smoke passed (${candidate})`
        : `Smoke failed (${candidate}) help='${helpRun.output}' version='${versionRun.output}'`;

      return {
        cli_slug: listing.identity.slug,
        package_name: packageName,
        package_manager: "npm",
        binary: candidate,
        status,
        install_status: "pass",
        help_status: helpRun.ok ? "pass" : "fail",
        version_status: versionRun.ok ? "pass" : "fail",
        manual_required: manual,
        blocking: false,
        reason,
        install_command: installCommand,
        duration_ms: Date.now() - started,
        shard_index: SHARD_INDEX,
        shard_total: SHARD_TOTAL,
        tested_at: new Date().toISOString()
      };
    }

    return {
      cli_slug: listing.identity.slug,
      package_name: packageName,
      package_manager: "npm",
      binary: preferredBinary,
      status: "fail",
      install_status: "pass",
      help_status: "fail",
      version_status: "fail",
      manual_required: true,
      blocking: false,
      reason: "Install succeeded but inferred binary path was not present in node_modules/.bin",
      install_command: installCommand,
      duration_ms: Date.now() - started,
      shard_index: SHARD_INDEX,
      shard_total: SHARD_TOTAL,
      tested_at: new Date().toISOString()
    };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function chooseInstallInstruction(listing: CliProfile) {
  const linux = listing.install.find((item) => item.os === "linux");
  if (linux) {
    return linux;
  }
  return listing.install[0];
}

function smokeListing(listing: CliProfile): SmokeRun {
  const install = chooseInstallInstruction(listing);
  if (!install) {
    return makeManualRun(listing, "", "unknown", "No install instruction available");
  }

  const packageManager = install.package_manager.toLowerCase();
  if (packageManager === "npm" || install.command.includes("npm install")) {
    return smokeNpm(listing, install.command);
  }

  return makeManualRun(
    listing,
    install.command,
    install.package_manager,
    `Real smoke install for package manager '${install.package_manager}' requires dedicated system sandbox`
  );
}

function main() {
  const data = JSON.parse(readFileSync(INPUT, "utf-8")) as CuratedDataset;
  const auto = data.clis.filter((cli) => cli.identity.category_tags.includes("auto-curated"));
  const sharded = auto.filter((_, index) => index % SHARD_TOTAL === SHARD_INDEX);
  const selected = MAX_LISTINGS > 0 ? sharded.slice(0, MAX_LISTINGS) : sharded;

  console.log(
    `Running smoke shard ${SHARD_INDEX + 1}/${SHARD_TOTAL} - selected ${selected.length} auto-curated listings`
  );

  const runs: SmokeRun[] = [];
  for (let index = 0; index < selected.length; index += 1) {
    const cli = selected[index]!;
    if ((index + 1) % 10 === 0 || index === 0) {
      console.log(`[${index + 1}/${selected.length}] ${cli.identity.slug}`);
    }
    runs.push(smokeListing(cli));
  }

  const passCount = runs.filter((run) => run.status === "pass").length;
  const failCount = runs.length - passCount;

  const summary = {
    generated_at: new Date().toISOString(),
    shard_index: SHARD_INDEX,
    shard_total: SHARD_TOTAL,
    selected_count: selected.length,
    pass_count: passCount,
    fail_count: failCount,
    manual_required_count: runs.filter((run) => run.manual_required).length,
    blocking_failures: runs.filter((run) => run.blocking).length,
    pass_rate: runs.length > 0 ? Number((passCount / runs.length).toFixed(4)) : 0,
    runs
  };

  writeFileSync(OUTPUT, JSON.stringify(summary, null, 2));
  console.log(`Wrote shard output -> ${OUTPUT}`);
  console.log(`pass=${passCount} fail=${failCount} pass_rate=${summary.pass_rate}`);
}

main();
