import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { CliProfile, InstallInstruction } from "@cli-me/shared-types";

type ValidationStatus = "pass" | "fail";
type RootCause =
  | "verified"
  | "host_os_incompatible"
  | "tool_missing_in_sandbox"
  | "listing_install_command_invalid"
  | "package_unavailable_or_private"
  | "install_url_unreachable"
  | "verifier_parse_limitation"
  | "binary_not_installed_in_sandbox"
  | "non_standard_help_output"
  | "unsupported_install_command";

interface InstallCheck {
  os: string;
  package_manager: string;
  command: string;
  status: ValidationStatus;
  reason: string;
  root_cause: RootCause;
  manual_required: boolean;
  blocking: boolean;
}

interface HelpCheck {
  binary: string;
  command: string;
  status: ValidationStatus;
  reason: string;
  root_cause: RootCause;
  manual_required: boolean;
  blocking: boolean;
}

interface VerificationRun {
  cli_slug: string;
  binary: string;
  status: ValidationStatus;
  install_checks: InstallCheck[];
  help_check: HelpCheck;
  manual_required: boolean;
  manual_reasons: string[];
  blocking_failures: string[];
  verified_at: string;
}

interface CuratedDataset {
  clis: CliProfile[];
}

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(THIS_DIR, "../../..");
const INPUT_PATH = resolve(ROOT_DIR, "infra/generated/curated-listings.json");
const OUTPUT_PATH = resolve(ROOT_DIR, "infra/generated/verification-runs.json");

function compactOutput(value: string, maxLen = 320) {
  return value.trim().replace(/\s+/g, " ").slice(0, maxLen);
}

function runCommand(command: string, args: string[], timeout = 10_000) {
  const run = spawnSync(command, args, {
    encoding: "utf-8",
    timeout,
    maxBuffer: 2 * 1024 * 1024
  });
  const combined = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  return {
    success: run.status === 0,
    output: compactOutput(combined) || `exit:${run.status ?? "unknown"}`
  };
}

function commandExists(command: string) {
  return spawnSync("which", [command], { stdio: "ignore" }).status === 0;
}

function pickTokenAfter(command: string, marker: string) {
  const segments = command.split(/\s+/);
  const markerIndex = segments.findIndex((item) => item === marker);
  if (markerIndex < 0) {
    return null;
  }
  for (let index = markerIndex + 1; index < segments.length; index += 1) {
    const token = segments[index];
    if (!token || token.startsWith("-")) {
      continue;
    }
    if (token === "&&" || token === "||") {
      break;
    }
    return token;
  }
  return null;
}

function extractUrl(command: string) {
  const match = command.match(/https?:\/\/[^\s"')]+/);
  return match?.[0] ?? null;
}

function parseNpmPackage(command: string) {
  return (
    command.match(/npm\s+install(?:\s+--global|\s+-g)?(?:\s+--[a-zA-Z0-9-]+)*\s+([^\s&|]+)/)?.[1] ??
    pickTokenAfter(command, "install")
  );
}

function parseBrewFormula(command: string) {
  const matches = [...command.matchAll(/brew\s+install(?:\s+--[a-zA-Z0-9-]+)*\s+([^\s&|]+)/g)];
  return matches.at(-1)?.[1] ?? null;
}

function parseBrewTaps(command: string) {
  return [...command.matchAll(/brew\s+tap\s+([^\s&|]+)/g)].map((match) => match[1]);
}

function makeInstallCheck(
  install: InstallInstruction,
  status: ValidationStatus,
  reason: string,
  rootCause: RootCause,
  manualRequired: boolean,
  blocking: boolean
): InstallCheck {
  return {
    os: install.os,
    package_manager: install.package_manager,
    command: install.command,
    status,
    reason,
    root_cause: rootCause,
    manual_required: manualRequired,
    blocking
  };
}

function makeHelpCheck(
  binary: string,
  command: string,
  status: ValidationStatus,
  reason: string,
  rootCause: RootCause,
  manualRequired: boolean,
  blocking: boolean
): HelpCheck {
  return {
    binary,
    command,
    status,
    reason,
    root_cause: rootCause,
    manual_required: manualRequired,
    blocking
  };
}

function isLikelyPackageUnavailable(output: string) {
  return /E404|404 Not Found|No available formula|No available cask|Unable to locate package/i.test(output);
}

function isLikelyPrivateOrAuthBlocked(output: string) {
  return /E401|Access token expired|revoked|authentication|permission denied/i.test(output);
}

function isLikelyNetworkIssue(output: string) {
  return /ENOTFOUND|ETIMEDOUT|EAI_AGAIN|network|TLS|timeout|temporarily unavailable/i.test(output);
}

function validateBrewInstall(install: InstallInstruction): InstallCheck {
  if (!commandExists("brew")) {
    return makeInstallCheck(
      install,
      "fail",
      "brew is not installed in this sandbox",
      "tool_missing_in_sandbox",
      true,
      false
    );
  }

  const formula = parseBrewFormula(install.command);
  if (!formula) {
    return makeInstallCheck(
      install,
      "fail",
      "Could not parse brew formula from install command",
      "verifier_parse_limitation",
      true,
      false
    );
  }

  for (const tap of parseBrewTaps(install.command)) {
    runCommand("brew", ["tap", tap], 20_000);
  }

  const run = runCommand("brew", ["info", formula], 20_000);
  if (run.success) {
    return makeInstallCheck(install, "pass", run.output, "verified", false, false);
  }

  if (isLikelyPackageUnavailable(run.output)) {
    return makeInstallCheck(
      install,
      "fail",
      run.output,
      "listing_install_command_invalid",
      false,
      true
    );
  }

  return makeInstallCheck(
    install,
    "fail",
    run.output,
    isLikelyNetworkIssue(run.output) ? "install_url_unreachable" : "tool_missing_in_sandbox",
    true,
    false
  );
}

function validateNpmInstall(install: InstallInstruction): InstallCheck {
  if (!commandExists("npm")) {
    return makeInstallCheck(
      install,
      "fail",
      "npm is not installed in this sandbox",
      "tool_missing_in_sandbox",
      true,
      false
    );
  }

  const packageName = parseNpmPackage(install.command);
  if (!packageName) {
    return makeInstallCheck(
      install,
      "fail",
      "Could not parse npm package from install command",
      "verifier_parse_limitation",
      true,
      false
    );
  }

  const run = runCommand("npm", ["view", packageName, "version"], 20_000);
  if (run.success) {
    return makeInstallCheck(install, "pass", run.output, "verified", false, false);
  }

  if (isLikelyPackageUnavailable(run.output) || isLikelyPrivateOrAuthBlocked(run.output)) {
    return makeInstallCheck(
      install,
      "fail",
      run.output,
      "package_unavailable_or_private",
      false,
      true
    );
  }

  return makeInstallCheck(
    install,
    "fail",
    run.output,
    isLikelyNetworkIssue(run.output) ? "install_url_unreachable" : "tool_missing_in_sandbox",
    true,
    false
  );
}

function validatePipInstall(install: InstallInstruction): InstallCheck {
  const pipBin = commandExists("pip3") ? "pip3" : commandExists("pip") ? "pip" : null;
  if (!pipBin) {
    return makeInstallCheck(
      install,
      "fail",
      "pip is not installed in this sandbox",
      "tool_missing_in_sandbox",
      true,
      false
    );
  }

  const packageName = install.command.match(/pip(?:3)?\s+install\s+([^\s&|]+)/)?.[1] ?? null;
  if (!packageName) {
    return makeInstallCheck(
      install,
      "fail",
      "Could not parse pip package from install command",
      "verifier_parse_limitation",
      true,
      false
    );
  }

  const run = runCommand(pipBin, ["index", "versions", packageName], 20_000);
  if (run.success) {
    return makeInstallCheck(install, "pass", run.output, "verified", false, false);
  }

  if (isLikelyPackageUnavailable(run.output)) {
    return makeInstallCheck(
      install,
      "fail",
      run.output,
      "package_unavailable_or_private",
      false,
      true
    );
  }

  return makeInstallCheck(
    install,
    "fail",
    run.output,
    isLikelyNetworkIssue(run.output) ? "install_url_unreachable" : "tool_missing_in_sandbox",
    true,
    false
  );
}

function validateAptInstall(install: InstallInstruction): InstallCheck {
  if (process.platform !== "linux") {
    return makeInstallCheck(
      install,
      "fail",
      `Host OS is ${process.platform}; apt verification requires Linux host`,
      "host_os_incompatible",
      true,
      false
    );
  }

  if (!commandExists("apt-cache")) {
    return makeInstallCheck(
      install,
      "fail",
      "apt-cache not available in this Linux sandbox",
      "tool_missing_in_sandbox",
      true,
      false
    );
  }

  const packageName = install.command.match(/apt(?:-get)?\s+install(?:\s+-y)?\s+([^\s&|]+)/)?.[1] ?? null;
  if (!packageName) {
    return makeInstallCheck(
      install,
      "fail",
      "Could not parse apt package from install command",
      "verifier_parse_limitation",
      true,
      false
    );
  }

  const run = runCommand("apt-cache", ["policy", packageName], 20_000);
  if (run.success && !/Unable to locate package/i.test(run.output)) {
    return makeInstallCheck(install, "pass", run.output, "verified", false, false);
  }

  if (isLikelyPackageUnavailable(run.output)) {
    return makeInstallCheck(
      install,
      "fail",
      run.output,
      "listing_install_command_invalid",
      false,
      true
    );
  }

  return makeInstallCheck(
    install,
    "fail",
    run.output,
    isLikelyNetworkIssue(run.output) ? "install_url_unreachable" : "tool_missing_in_sandbox",
    true,
    false
  );
}

function validateCurlInstall(install: InstallInstruction): InstallCheck {
  if (!commandExists("curl")) {
    return makeInstallCheck(
      install,
      "fail",
      "curl is not installed in this sandbox",
      "tool_missing_in_sandbox",
      true,
      false
    );
  }

  const url = extractUrl(install.command);
  if (!url) {
    return makeInstallCheck(
      install,
      "fail",
      "Could not parse URL from curl install command",
      "verifier_parse_limitation",
      true,
      false
    );
  }

  const run = runCommand("curl", ["-fsSI", url], 20_000);
  if (run.success) {
    return makeInstallCheck(install, "pass", run.output, "verified", false, false);
  }

  return makeInstallCheck(
    install,
    "fail",
    run.output,
    isLikelyPackageUnavailable(run.output)
      ? "install_url_unreachable"
      : isLikelyNetworkIssue(run.output)
        ? "install_url_unreachable"
        : "tool_missing_in_sandbox",
    isLikelyNetworkIssue(run.output),
    !isLikelyNetworkIssue(run.output)
  );
}

function validateInstallInstruction(install: InstallInstruction): InstallCheck {
  const command = install.command.trim();
  const packageManager = install.package_manager.toLowerCase();

  if (command.toLowerCase().startsWith("requires manual install")) {
    return makeInstallCheck(
      install,
      "fail",
      command,
      "unsupported_install_command",
      true,
      false
    );
  }

  if (
    packageManager === "brew" ||
    command.includes(" brew install ") ||
    command.startsWith("brew install")
  ) {
    return validateBrewInstall(install);
  }

  if (packageManager === "npm" || command.includes("npm install")) {
    return validateNpmInstall(install);
  }

  if (packageManager === "pip" || command.includes("pip install")) {
    return validatePipInstall(install);
  }

  if (packageManager === "apt" || command.includes(" apt install ") || command.startsWith("apt install")) {
    return validateAptInstall(install);
  }

  if (command.includes("curl")) {
    return validateCurlInstall(install);
  }

  const firstToken = command.split(/\s+/)[0];
  if (!firstToken || firstToken.startsWith("-")) {
    return makeInstallCheck(
      install,
      "fail",
      "Unsupported install command format",
      "verifier_parse_limitation",
      true,
      false
    );
  }

  if (commandExists(firstToken)) {
    return makeInstallCheck(
      install,
      "pass",
      `Installer binary '${firstToken}' is available`,
      "verified",
      false,
      false
    );
  }

  return makeInstallCheck(
    install,
    "fail",
    `Unsupported installer '${firstToken}' in this sandbox`,
    "unsupported_install_command",
    true,
    false
  );
}

export function sanitizeBinaryCandidate(candidate: string) {
  const binary = candidate.trim();
  if (!binary || binary.startsWith("-")) {
    return null;
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(binary)) {
    return null;
  }
  return binary;
}

function inferBinary(cli: CliProfile) {
  const firstCommand = cli.commands[0]?.command ?? "";
  const firstToken = firstCommand.split(/\s+/)[0];
  const fromCommand = sanitizeBinaryCandidate(firstToken ?? "");
  if (fromCommand) {
    return fromCommand;
  }
  return sanitizeBinaryCandidate(cli.identity.slug.split("-").pop() ?? cli.identity.slug);
}

function collectNpmPackages(cli: CliProfile) {
  const packages = new Set<string>();
  for (const install of cli.install) {
    const packageName = parseNpmPackage(install.command);
    if (packageName) {
      packages.add(packageName);
    }
  }
  return [...packages];
}

function validateHelp(cli: CliProfile): HelpCheck {
  const binary = inferBinary(cli);
  if (!binary) {
    return makeHelpCheck(
      "unknown",
      "n/a",
      "fail",
      "Could not infer binary name from curated listing",
      "verifier_parse_limitation",
      true,
      false
    );
  }

  const tryCommands: Array<{ command: string; args: string[] }> = [
    { command: binary, args: ["--help"] },
    { command: binary, args: ["-h"] },
    { command: binary, args: ["help"] }
  ];

  if (commandExists(binary)) {
    for (const probe of tryCommands) {
      const run = runCommand(probe.command, probe.args, 20_000);
      if (run.success) {
        return makeHelpCheck(binary, `${probe.command} ${probe.args.join(" ")}`, "pass", run.output, "verified", false, false);
      }
    }

    return makeHelpCheck(
      binary,
      `${binary} --help`,
      "fail",
      "Binary exists but standard help probes failed",
      "non_standard_help_output",
      true,
      false
    );
  }

  if (commandExists("npx")) {
    for (const npmPackage of collectNpmPackages(cli)) {
      const npxHelp = runCommand("npx", ["-y", npmPackage, "--help"], 30_000);
      if (npxHelp.success) {
        return makeHelpCheck(
          binary,
          `npx -y ${npmPackage} --help`,
          "pass",
          npxHelp.output,
          "verified",
          false,
          false
        );
      }
    }
  }

  return makeHelpCheck(
    binary,
    `${binary} --help`,
    "fail",
    "Binary not installed in sandbox and npx fallback did not execute",
    "binary_not_installed_in_sandbox",
    true,
    false
  );
}

function summarizeRun(installChecks: InstallCheck[], helpCheck: HelpCheck) {
  const installPassCount = installChecks.filter((check) => check.status === "pass").length;

  const blockingFailures = [
    ...installChecks
      .filter((check) => check.status === "fail" && check.blocking)
      .map((check) => `${check.package_manager}:${check.root_cause}:${check.reason}`),
    ...(helpCheck.status === "fail" && helpCheck.blocking
      ? [`help:${helpCheck.root_cause}:${helpCheck.reason}`]
      : [])
  ];

  const manualReasons = [
    ...installChecks
      .filter((check) => check.status === "fail" && check.manual_required)
      .map((check) => `${check.package_manager}:${check.root_cause}:${check.reason}`),
    ...(helpCheck.status === "fail" && helpCheck.manual_required
      ? [`help:${helpCheck.root_cause}:${helpCheck.reason}`]
      : [])
  ];

  if (blockingFailures.length > 0) {
    return {
      status: "fail" as const,
      manual_required: manualReasons.length > 0,
      manual_reasons: manualReasons,
      blocking_failures: blockingFailures
    };
  }

  if (installPassCount === 0 && helpCheck.status !== "pass") {
    return {
      status: "fail" as const,
      manual_required: true,
      manual_reasons: [
        ...manualReasons,
        "run:no_automatable_signal:No install or help verification path succeeded in sandbox"
      ],
      blocking_failures: []
    };
  }

  return {
    status: "pass" as const,
    manual_required: manualReasons.length > 0,
    manual_reasons: manualReasons,
    blocking_failures: []
  };
}

function aggregateRootCauses(runs: VerificationRun[]) {
  const aggregate = new Map<RootCause, { pass: number; fail: number; manual_required: number }>();

  const upsert = (rootCause: RootCause, status: ValidationStatus, manualRequired: boolean) => {
    const row = aggregate.get(rootCause) ?? { pass: 0, fail: 0, manual_required: 0 };
    row[status] += 1;
    if (manualRequired) {
      row.manual_required += 1;
    }
    aggregate.set(rootCause, row);
  };

  for (const run of runs) {
    for (const check of run.install_checks) {
      upsert(check.root_cause, check.status, check.manual_required);
    }
    upsert(helpCheckRoot(run.help_check), run.help_check.status, run.help_check.manual_required);
  }

  return Object.fromEntries(
    [...aggregate.entries()].map(([rootCause, counts]) => [rootCause, counts])
  );
}

function helpCheckRoot(check: HelpCheck) {
  return check.root_cause;
}

export async function run() {
  const input = JSON.parse(readFileSync(INPUT_PATH, "utf-8")) as CuratedDataset;
  const selected = input.clis;

  const runs: VerificationRun[] = selected.map((cli) => {
    const installChecks = cli.install.map((install) => validateInstallInstruction(install));
    const helpCheck = validateHelp(cli);
    const summary = summarizeRun(installChecks, helpCheck);

    return {
      cli_slug: cli.identity.slug,
      binary: helpCheck.binary,
      status: summary.status,
      install_checks: installChecks,
      help_check: helpCheck,
      manual_required: summary.manual_required,
      manual_reasons: summary.manual_reasons,
      blocking_failures: summary.blocking_failures,
      verified_at: new Date().toISOString()
    };
  });

  const passCount = runs.filter((run) => run.status === "pass").length;
  const failCount = runs.filter((run) => run.status === "fail").length;
  const passRate = runs.length === 0 ? 0 : passCount / runs.length;
  const minimumPassRate = Number(process.env.CLIME_VERIFIER_MIN_PASS_RATE ?? "0.8");

  writeFileSync(
    OUTPUT_PATH,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        source: "curated-listings",
        run_count: runs.length,
        pass_count: passCount,
        fail_count: failCount,
        skipped_count: 0,
        manual_required_count: runs.filter((run) => run.manual_required).length,
        pass_rate: Number(passRate.toFixed(4)),
        min_pass_rate_gate: minimumPassRate,
        root_cause_breakdown: aggregateRootCauses(runs),
        runs
      },
      null,
      2
    )
  );

  console.log(`Wrote verification summary -> ${OUTPUT_PATH}`);
  if (passRate < minimumPassRate) {
    throw new Error(
      `Verifier pass-rate gate failed: ${(passRate * 100).toFixed(2)}% < ${(minimumPassRate * 100).toFixed(2)}%`
    );
  }
}

const isEntrypoint =
  typeof process.argv[1] === "string" &&
  process.argv[1].length > 0 &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isEntrypoint) {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
