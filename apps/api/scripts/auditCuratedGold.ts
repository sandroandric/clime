import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { hasCryptographicChecksum } from "@cli-me/shared-types";
import type { CliProfile, InstallInstruction } from "@cli-me/shared-types";

interface CuratedDataset {
  generated_at: string;
  clis: CliProfile[];
  workflows: unknown[];
}

type Severity = "blocking" | "manual_review" | "warning";

interface AuditIssue {
  slug: string;
  check: string;
  severity: Severity;
  message: string;
  install_command?: string;
}

interface ListingAudit {
  slug: string;
  status: "pass" | "fail";
  checks: {
    hasMac: boolean;
    hasLinux: boolean;
    commandCount: number;
    actionableCommandCount: number;
    hasAuth: boolean;
    hasAuthType: boolean;
    hasAuthEnvVars: boolean;
    hasWorkflow: boolean;
    hasParamDescriptions: boolean;
    hasExamples: boolean;
    hasFreshnessTimestamps: boolean;
    hasProvenanceLinks: boolean;
    noFakeChecksums: boolean;
    noMeasuredCompatibilityForAuto: boolean;
    allErrorsGeneric: boolean;
  };
  issues: AuditIssue[];
}

const THIS_DIR = resolve(fileURLToPath(import.meta.url), "..");
const ROOT = resolve(THIS_DIR, "../../..");
const INPUT = resolve(ROOT, "infra/generated/curated-listings.json");
const OUTPUT = resolve(ROOT, "infra/generated/gold-curation-audit.json");
const parsedMinimum = Number.parseInt(process.env.CLIME_CURATED_MIN_LISTINGS ?? "1000", 10);
const MIN_CURATED_LISTINGS = Number.isFinite(parsedMinimum) && parsedMinimum > 0 ? parsedMinimum : 1000;
const DEEP_BREW_VALIDATION = process.env.CLIME_AUDIT_DEEP_BREW === "true";
const FAST_AUDIT = process.env.CLIME_AUDIT_FAST !== "false";

const GENERIC_ERRORS = [
  "Authentication required",
  "Project context not linked",
  "Network/API timeout"
];
const PLACEHOLDER_HOSTS = new Set(["example.com", "www.example.com", "localhost", "127.0.0.1"]);

const NPM_REGISTRY = "https://registry.npmjs.org";
const PYPI_REGISTRY = "https://pypi.org/pypi";

const npmCache = new Map<string, { ok: boolean; latest?: string; bin?: unknown; error?: string }>();
const pypiCache = new Map<string, { ok: boolean; error?: string }>();

function readDataset() {
  if (!existsSync(INPUT)) {
    throw new Error(`Missing curated dataset at ${INPUT}. Run generate script first.`);
  }

  return JSON.parse(readFileSync(INPUT, "utf-8")) as CuratedDataset;
}

function parseNpmPackage(command: string) {
  return command.match(/npm\s+install(?:\s+--global|\s+-g)?(?:\s+--[a-zA-Z0-9-]+)*\s+([^\s&|]+)/)?.[1] ?? null;
}

function parsePipPackage(command: string) {
  return command.match(/pip(?:3)?\s+install(?:\s+--[a-zA-Z0-9-]+)*\s+([^\s&|]+)/)?.[1] ?? null;
}

function parseAptPackage(command: string) {
  return command.match(/apt(?:-get)?\s+install(?:\s+-y)?(?:\s+--[a-zA-Z0-9-]+)*\s+([^\s&|]+)/)?.[1] ?? null;
}

function parseBrewFormula(command: string) {
  const matches = [...command.matchAll(/brew\s+install(?:\s+--[a-zA-Z0-9-]+)*\s+([^\s&|]+)/g)];
  return matches.at(-1)?.[1] ?? null;
}

function parseBrewTaps(command: string) {
  return [...command.matchAll(/brew\s+tap\s+([^\s&|]+)/g)].map((match) => match[1]);
}

function extractUrl(command: string) {
  return command.match(/https?:\/\/[^\s"')]+/)?.[0] ?? null;
}

function isLikelyPlaceholderUrl(value: string) {
  try {
    const parsed = new URL(value);
    return PLACEHOLDER_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return true;
  }
}

function run(command: string, args: string[], timeout = 20000) {
  return spawnSync(command, args, {
    encoding: "utf-8",
    timeout,
    maxBuffer: 2 * 1024 * 1024
  });
}

async function fetchJson(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "clime-gold-audit"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return (await response.json()) as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
  }
}

function detectPrimaryBinary(listing: CliProfile) {
  const counts = new Map<string, number>();
  for (const command of listing.commands) {
    const head = command.command.trim().split(/\s+/)[0] ?? "";
    if (!head || head.startsWith("-") || ["npm", "npx", "node", "python", "python3"].includes(head)) {
      continue;
    }
    counts.set(head, (counts.get(head) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? listing.identity.slug;
}

async function validateNpmInstall(listing: CliProfile, install: InstallInstruction, issues: AuditIssue[]) {
  const pkg = parseNpmPackage(install.command);
  if (!pkg) {
    issues.push({
      slug: listing.identity.slug,
      check: "npm_install",
      severity: "blocking",
      message: "Cannot parse npm package from install command.",
      install_command: install.command
    });
    return;
  }

  if (FAST_AUDIT) {
    issues.push({
      slug: listing.identity.slug,
      check: "npm_install",
      severity: "manual_review",
      message: `Deep npm registry validation skipped in fast audit mode for package ${pkg}.`,
      install_command: install.command
    });
    return;
  }

  if (!npmCache.has(pkg)) {
    try {
      const metadata = await fetchJson(`${NPM_REGISTRY}/${encodeURIComponent(pkg)}`);
      const latest = String((metadata["dist-tags"] as { latest?: string } | undefined)?.latest ?? "");
      const versions = (metadata.versions as Record<string, { bin?: unknown }> | undefined) ?? {};
      npmCache.set(pkg, { ok: true, latest, bin: versions[latest]?.bin });
    } catch (error) {
      npmCache.set(pkg, { ok: false, error: String(error) });
    }
  }

  const meta = npmCache.get(pkg);
  if (!meta?.ok) {
    issues.push({
      slug: listing.identity.slug,
      check: "npm_install",
      severity: "blocking",
      message: `npm package not resolvable: ${pkg} (${meta?.error ?? "unknown error"})`,
      install_command: install.command
    });
    return;
  }

  if (!meta.bin) {
    issues.push({
      slug: listing.identity.slug,
      check: "npm_install",
      severity: "blocking",
      message: `npm package ${pkg} has no executable bin mapping in latest version ${meta.latest}.`,
      install_command: install.command
    });
    return;
  }

  const primaryBinary = detectPrimaryBinary(listing);
  const candidateBinNames: string[] = typeof meta.bin === "string" ? [pkg.split("/").pop() ?? pkg] : Object.keys(meta.bin as Record<string, string>);

  if (!candidateBinNames.includes(primaryBinary)) {
    issues.push({
      slug: listing.identity.slug,
      check: "npm_binary",
      severity: "blocking",
      message: `Primary command binary \"${primaryBinary}\" does not match npm bin names [${candidateBinNames.join(", ")}].`,
      install_command: install.command
    });
  }
}

async function validatePipInstall(listing: CliProfile, install: InstallInstruction, issues: AuditIssue[]) {
  const pkg = parsePipPackage(install.command);
  if (!pkg) {
    issues.push({
      slug: listing.identity.slug,
      check: "pip_install",
      severity: "blocking",
      message: "Cannot parse pip package from install command.",
      install_command: install.command
    });
    return;
  }

  if (FAST_AUDIT) {
    issues.push({
      slug: listing.identity.slug,
      check: "pip_install",
      severity: "manual_review",
      message: `Deep PyPI validation skipped in fast audit mode for package ${pkg}.`,
      install_command: install.command
    });
    return;
  }

  if (!pypiCache.has(pkg)) {
    try {
      await fetchJson(`${PYPI_REGISTRY}/${encodeURIComponent(pkg)}/json`);
      pypiCache.set(pkg, { ok: true });
    } catch (error) {
      pypiCache.set(pkg, { ok: false, error: String(error) });
    }
  }

  const meta = pypiCache.get(pkg);
  if (!meta?.ok) {
    issues.push({
      slug: listing.identity.slug,
      check: "pip_install",
      severity: "blocking",
      message: `PyPI package not resolvable: ${pkg} (${meta?.error ?? "unknown error"})`,
      install_command: install.command
    });
  }
}

function validateBrewInstall(listing: CliProfile, install: InstallInstruction, issues: AuditIssue[]) {
  if (!DEEP_BREW_VALIDATION) {
    issues.push({
      slug: listing.identity.slug,
      check: "brew_install",
      severity: "manual_review",
      message: "Brew deep validation disabled for large-batch audit; mark as manual review or rerun with CLIME_AUDIT_DEEP_BREW=true.",
      install_command: install.command
    });
    return;
  }

  if (run("which", ["brew"]).status !== 0) {
    issues.push({
      slug: listing.identity.slug,
      check: "brew_install",
      severity: "manual_review",
      message: "brew unavailable in current environment; cannot verify automatically.",
      install_command: install.command
    });
    return;
  }

  for (const tap of parseBrewTaps(install.command)) {
    run("brew", ["tap", tap], 30000);
  }

  const formula = parseBrewFormula(install.command);
  if (!formula) {
    issues.push({
      slug: listing.identity.slug,
      check: "brew_install",
      severity: "blocking",
      message: "Cannot parse brew formula/cask from install command.",
      install_command: install.command
    });
    return;
  }

  const info = run("brew", ["info", "--json=v2", formula], 30000);
  if (info.status !== 0) {
    issues.push({
      slug: listing.identity.slug,
      check: "brew_install",
      severity: "blocking",
      message: `brew info failed for ${formula}: ${(info.stderr || info.stdout || "unknown").trim().slice(0, 220)}`,
      install_command: install.command
    });
  }
}

function validateAptInstall(listing: CliProfile, install: InstallInstruction, issues: AuditIssue[]) {
  const pkg = parseAptPackage(install.command);
  if (!pkg) {
    issues.push({
      slug: listing.identity.slug,
      check: "apt_install",
      severity: "blocking",
      message: "Cannot parse apt package from install command.",
      install_command: install.command
    });
    return;
  }

  if (process.platform !== "linux") {
    issues.push({
      slug: listing.identity.slug,
      check: "apt_install",
      severity: "manual_review",
      message: `Host platform is ${process.platform}; apt verification requires Linux host.`,
      install_command: install.command
    });
    return;
  }

  const cache = run("apt-cache", ["show", pkg], 10000);
  if (cache.status !== 0 || !(cache.stdout ?? "").trim()) {
    issues.push({
      slug: listing.identity.slug,
      check: "apt_install",
      severity: "blocking",
      message: `apt package not available: ${pkg}`,
      install_command: install.command
    });
  }
}

async function validateUrlInstall(listing: CliProfile, install: InstallInstruction, issues: AuditIssue[]) {
  const url = extractUrl(install.command);
  if (!url) {
    issues.push({
      slug: listing.identity.slug,
      check: "url_install",
      severity: "blocking",
      message: "No downloadable URL found in install command.",
      install_command: install.command
    });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal
    });
    if (!response.ok) {
      issues.push({
        slug: listing.identity.slug,
        check: "url_install",
        severity: "blocking",
        message: `Install URL responded with HTTP ${response.status}: ${url}`,
        install_command: install.command
      });
    }
  } catch (error) {
    issues.push({
      slug: listing.identity.slug,
      check: "url_install",
      severity: "blocking",
      message: `Install URL request failed: ${String(error)}`,
      install_command: install.command
    });
  } finally {
    clearTimeout(timer);
  }
}

async function validateInstall(listing: CliProfile, install: InstallInstruction, issues: AuditIssue[]) {
  switch (install.package_manager) {
    case "npm":
      await validateNpmInstall(listing, install, issues);
      return;
    case "pip":
      await validatePipInstall(listing, install, issues);
      return;
    case "brew":
      validateBrewInstall(listing, install, issues);
      return;
    case "apt":
      validateAptInstall(listing, install, issues);
      return;
    case "curl":
    case "shell":
      await validateUrlInstall(listing, install, issues);
      return;
    default:
      issues.push({
        slug: listing.identity.slug,
        check: "install_package_manager",
        severity: "manual_review",
        message: `Unsupported install package manager for audit: ${install.package_manager}`,
        install_command: install.command
      });
  }
}

function evaluateListingQuality(listing: CliProfile, issues: AuditIssue[]) {
  const hasMac = listing.install.some((item) => item.os === "macos");
  const hasLinux = listing.install.some((item) => item.os === "linux");
  const commandCount = listing.commands.length;
  const actionableCommandCount = listing.commands.filter((command) => {
    const parts = command.command.trim().split(/\s+/);
    const hasSubcommand = parts.length >= 2;
    const hasNonHelpParameter = [...command.required_parameters, ...command.optional_parameters].some(
      (parameter) => parameter.name !== "--help"
    );
    return command.description.trim().length > 4 && (hasSubcommand || hasNonHelpParameter);
  }).length;
  const hasAuth = listing.auth.setup_steps.length > 0;
  const hasAuthType = Boolean(listing.auth.auth_type);
  const hasAuthEnvVars =
    listing.auth.auth_type === "none" || listing.auth.environment_variables.length > 0;
  const hasWorkflow = listing.commands.some((command) => command.workflow_context.length > 0);
  const hasParamDescriptions = listing.commands.every((command) =>
    [...command.required_parameters, ...command.optional_parameters].every((parameter) =>
      Boolean(parameter.description && parameter.description.trim().length > 4)
    )
  );
  const hasExamples = listing.commands.every((command) =>
    command.examples.length > 0 && command.examples.every((example) => example.trim().length > 4)
  );
  const hasFreshnessTimestamps =
    !Number.isNaN(Date.parse(listing.identity.last_updated)) &&
    !Number.isNaN(Date.parse(listing.identity.last_verified ?? listing.identity.last_updated));
  const hasProvenanceLinks =
    !isLikelyPlaceholderUrl(listing.identity.website) &&
    !isLikelyPlaceholderUrl(listing.identity.repository);
  const noFakeChecksums = listing.install.every(
    (item) => !item.checksum || hasCryptographicChecksum(item.checksum)
  );
  const noMeasuredCompatibilityForAuto =
    listing.identity.verification_status !== "auto-indexed" ||
    listing.identity.compatibility.every((entry) => entry.status === "untested");

  const allErrorsGeneric =
    listing.commands.length > 0 &&
    listing.commands.every(
      (command) => JSON.stringify(command.common_errors ?? []) === JSON.stringify(GENERIC_ERRORS)
    );

  if (!hasMac || !hasLinux) {
    issues.push({
      slug: listing.identity.slug,
      check: "quality_install_os_coverage",
      severity: "blocking",
      message: "Listing must include both macOS and Linux install instructions."
    });
  }

  if (commandCount < 5) {
    issues.push({
      slug: listing.identity.slug,
      check: "quality_command_count",
      severity: "blocking",
      message: `Listing has ${commandCount} commands; minimum is 5.`
    });
  }

  if (actionableCommandCount < 5) {
    issues.push({
      slug: listing.identity.slug,
      check: "quality_actionable_commands",
      severity: "blocking",
      message: `Listing has ${actionableCommandCount} actionable commands; minimum is 5.`
    });
  }

  if (!hasAuth) {
    issues.push({
      slug: listing.identity.slug,
      check: "quality_auth_guide",
      severity: "blocking",
      message: "Listing has no auth setup steps."
    });
  }

  if (!hasAuthType) {
    issues.push({
      slug: listing.identity.slug,
      check: "quality_auth_type",
      severity: "blocking",
      message: "Listing is missing explicit auth_type classification."
    });
  }

  if (!hasAuthEnvVars) {
    issues.push({
      slug: listing.identity.slug,
      check: "quality_auth_env_vars",
      severity: "blocking",
      message: "Listing auth requires explicit environment variables for non-none auth types."
    });
  }

  if (!hasWorkflow) {
    issues.push({
      slug: listing.identity.slug,
      check: "quality_workflow_context",
      severity: "blocking",
      message: "Listing has no workflow context references."
    });
  }

  if (!hasParamDescriptions) {
    issues.push({
      slug: listing.identity.slug,
      check: "quality_param_descriptions",
      severity: "blocking",
      message: "One or more command parameters have missing/short descriptions."
    });
  }

  if (!hasExamples) {
    issues.push({
      slug: listing.identity.slug,
      check: "quality_command_examples",
      severity: "blocking",
      message: "Each command must include at least one example invocation."
    });
  }

  if (!hasFreshnessTimestamps) {
    issues.push({
      slug: listing.identity.slug,
      check: "quality_freshness_timestamps",
      severity: "blocking",
      message: "Listing is missing valid last_updated/last_verified timestamps."
    });
  }

  if (!hasProvenanceLinks) {
    issues.push({
      slug: listing.identity.slug,
      check: "quality_provenance_links",
      severity: "blocking",
      message: "Listing requires non-placeholder website and repository provenance links."
    });
  }

  if (!noFakeChecksums) {
    issues.push({
      slug: listing.identity.slug,
      check: "quality_checksum_integrity",
      severity: "blocking",
      message: "Listing contains non-cryptographic checksum values."
    });
  }

  if (!noMeasuredCompatibilityForAuto) {
    issues.push({
      slug: listing.identity.slug,
      check: "quality_compatibility_integrity",
      severity: "blocking",
      message:
        "Auto-indexed listings cannot present measured compatibility; keep compatibility untested until reports exist."
    });
  }

  if (allErrorsGeneric) {
    issues.push({
      slug: listing.identity.slug,
      check: "quality_common_errors",
      severity: "warning",
      message: "All commands use generic common-errors block; command-specific errors recommended."
    });
  }

  return {
    hasMac,
    hasLinux,
    commandCount,
    actionableCommandCount,
    hasAuth,
    hasAuthType,
    hasAuthEnvVars,
    hasWorkflow,
    hasParamDescriptions,
    hasExamples,
    hasFreshnessTimestamps,
    hasProvenanceLinks,
    noFakeChecksums,
    noMeasuredCompatibilityForAuto,
    allErrorsGeneric
  };
}

async function auditListing(listing: CliProfile): Promise<ListingAudit> {
  const issues: AuditIssue[] = [];
  const checks = evaluateListingQuality(listing, issues);

  for (const install of listing.install) {
    await validateInstall(listing, install, issues);
  }

  const hasBlocking = issues.some((issue) => issue.severity === "blocking");
  return {
    slug: listing.identity.slug,
    status: hasBlocking ? "fail" : "pass",
    checks,
    issues
  };
}

async function runAudit() {
  const dataset = readDataset();

  const listingAudits: ListingAudit[] = [];
  for (const listing of dataset.clis) {
    listingAudits.push(await auditListing(listing));
  }

  const allIssues = listingAudits.flatMap((audit) => audit.issues);
  const blocking = allIssues.filter((issue) => issue.severity === "blocking");
  const manual = allIssues.filter((issue) => issue.severity === "manual_review");
  const warnings = allIssues.filter((issue) => issue.severity === "warning");

  const report = {
    generated_at: new Date().toISOString(),
    source_generated_at: dataset.generated_at,
    listing_count: dataset.clis.length,
    workflow_count: dataset.workflows.length,
    pass_count: listingAudits.filter((audit) => audit.status === "pass").length,
    fail_count: listingAudits.filter((audit) => audit.status === "fail").length,
    blocking_issue_count: blocking.length,
    manual_review_issue_count: manual.length,
    warning_issue_count: warnings.length,
    listings_with_manual_review: [...new Set(manual.map((issue) => issue.slug))].sort(),
    listings_with_warnings: [...new Set(warnings.map((issue) => issue.slug))].sort(),
    blocking_issues: blocking,
    manual_review_issues: manual,
    warning_issues: warnings,
    listings: listingAudits
  };

  writeFileSync(OUTPUT, JSON.stringify(report, null, 2));

  console.log(`Gold audit report written -> ${OUTPUT}`);
  console.log(
    `listings=${report.listing_count} pass=${report.pass_count} fail=${report.fail_count} blocking=${report.blocking_issue_count} manual=${report.manual_review_issue_count} warnings=${report.warning_issue_count}`
  );

  if (report.listing_count < MIN_CURATED_LISTINGS) {
    throw new Error(`Expected at least ${MIN_CURATED_LISTINGS} curated listings, got ${report.listing_count}`);
  }

  if (report.blocking_issue_count > 0) {
    throw new Error(`Gold audit failed with ${report.blocking_issue_count} blocking issues.`);
  }
}

runAudit().catch((error) => {
  console.error(error);
  process.exit(1);
});
