import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { CliProfile } from "@cli-me/shared-types";
import { CopyButton } from "../../../components/copy-button";
import { CopyableCommand } from "../../../components/copyable-command";
import { InstallTabs } from "../../../components/install-tabs";
import { FormSubmitButton } from "../../../components/form-submit-button";
import { createSubmission, getCliProfile, getWorkflows } from "../../../lib/api";
import { createPageMetadata } from "../../../lib/metadata";

export const revalidate = 60;

function sanitizeJsonLdValue(value: string): string {
  return value
    .replace(/<\/script>/gi, "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f]/g, "");
}

function sanitizeJsonLd(obj: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      cleaned[key] = sanitizeJsonLdValue(value);
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

function safeJsonLdStringify(obj: Record<string, unknown>): string {
  return JSON.stringify(obj).replace(/<\/script>/gi, "");
}

type Params = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ report?: string; message?: string }>;
};

const COMPATIBILITY_ORDER = [
  "claude-code",
  "codex-cli",
  "gemini-cli",
  "cline",
  "aider",
  "opencode"
] as const;

const GENERIC_ERROR_PATTERNS = [
  "authentication required",
  "project context not linked",
  "network/api timeout"
];

type CommandParameter = CliProfile["commands"][number]["optional_parameters"][number];

function verificationBadge(status: string) {
  if (status === "publisher-verified") {
    return <span className="badge verified">Claim-Verified Publisher</span>;
  }
  if (status === "community-curated") {
    return <span className="badge community">Community Curated</span>;
  }
  return <span className="badge neutral">Observed Listing</span>;
}

function toTitle(value: string) {
  return value
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function displayAgentName(value: string) {
  const normalized = value.toLowerCase();
  if (normalized === "claude-code") {
    return "Claude Code";
  }
  if (normalized === "codex-cli") {
    return "Codex CLI";
  }
  if (normalized === "gemini-cli") {
    return "Gemini CLI";
  }
  if (normalized === "cline") {
    return "Cline";
  }
  if (normalized === "aider") {
    return "Aider";
  }
  if (normalized === "opencode") {
    return "OpenCode";
  }
  return toTitle(value);
}

function authTypeLabel(value: CliProfile["auth"]["auth_type"]) {
  switch (value) {
    case "api_key":
      return "API Key";
    case "oauth":
      return "OAuth";
    case "login_command":
      return "Login Command";
    case "config_file":
      return "Config File";
    default:
      return "None";
  }
}

function outputLabel(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes("json")) {
    return "JSON";
  }
  if (normalized.includes("table")) {
    return "Table";
  }
  if (normalized.includes("stream")) {
    return "Stream";
  }
  if (normalized.includes("interactive")) {
    return "Interactive";
  }
  return "Plain text";
}

function findGlobalFlags(profile: CliProfile) {
  const counts = new Map<string, { parameter: CommandParameter; count: number }>();
  for (const command of profile.commands) {
    for (const parameter of command.optional_parameters) {
      if (!parameter.name.startsWith("--")) {
        continue;
      }
      const existing = counts.get(parameter.name);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(parameter.name, { parameter, count: 1 });
      }
    }
  }

  const threshold = Math.max(3, Math.ceil(profile.commands.length * 0.6));
  return [...counts.values()]
    .filter((entry) => entry.count >= threshold)
    .map((entry) => entry.parameter)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function cleanCommandErrors(errors: string[]) {
  const filtered = errors.filter(
    (error) =>
      !GENERIC_ERROR_PATTERNS.some((generic) => error.toLowerCase().includes(generic))
  );
  return [...new Set(filtered)];
}

function workflowContextLabel(value: string) {
  const normalized = value
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  if (!normalized) {
    return "General";
  }
  return normalized
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function groupCommandsByWorkflow(commands: CliProfile["commands"]) {
  const groups = new Map<string, { key: string; label: string; commands: CliProfile["commands"] }>();
  for (const command of commands) {
    const key = command.workflow_context[0] ?? "general";
    const normalizedKey = key.trim().toLowerCase() || "general";
    const existing = groups.get(normalizedKey) ?? {
      key: normalizedKey,
      label: workflowContextLabel(normalizedKey),
      commands: []
    };
    existing.commands.push(command);
    groups.set(normalizedKey, existing);
  }

  return [...groups.values()].sort((a, b) => {
    if (b.commands.length !== a.commands.length) {
      return b.commands.length - a.commands.length;
    }
    return a.label.localeCompare(b.label);
  });
}

function inferRuntime(profile: CliProfile) {
  const dependencyText = profile.install
    .flatMap((entry) => entry.dependencies)
    .join(" ")
    .toLowerCase();
  if (dependencyText.includes("node")) {
    return "Requires Node.js runtime";
  }
  if (dependencyText.includes("python")) {
    return "Requires Python runtime";
  }
  if (dependencyText.includes("java")) {
    return "Requires Java runtime";
  }
  return "Standalone binary / package-managed CLI";
}

function inferPlatforms(profile: CliProfile) {
  const platforms = new Set<string>();
  for (const instruction of profile.install) {
    if (instruction.os === "any") {
      platforms.add("macOS");
      platforms.add("Linux");
      platforms.add("Windows");
    } else if (instruction.os === "macos") {
      platforms.add("macOS");
    } else if (instruction.os === "linux") {
      platforms.add("Linux");
    } else if (instruction.os === "windows") {
      platforms.add("Windows");
    }
  }
  return [...platforms];
}

function estimateInstallSizeMb(profile: CliProfile) {
  const complexity = profile.commands.length * 1.6;
  const dependencyWeight = profile.install.flatMap((entry) => entry.dependencies).length * 3.2;
  const infraWeight = profile.identity.permission_scope.length * 1.4;
  const value = 18 + complexity + dependencyWeight + infraWeight;
  return Math.round(value);
}

function inferPorts(profile: CliProfile) {
  const ports = new Set<string>();
  const text = profile.commands
    .flatMap((command) => [command.command, ...command.examples])
    .join(" ");
  for (const match of text.matchAll(/(?:localhost:|127\.0\.0\.1:|--port\s+|--listen\s+|-p\s+)(\d{2,5})/g)) {
    if (match[1]) {
      ports.add(match[1]);
    }
  }
  return [...ports];
}

function sandboxRecommendation(profile: CliProfile) {
  const scope = new Set(profile.identity.permission_scope);
  const isHighAccess =
    scope.has("docker-socket") ||
    scope.has("kubeconfig") ||
    (scope.has("filesystem") && scope.has("network") && profile.auth.environment_variables.length > 0);
  if (!isHighAccess) {
    return null;
  }

  const install = profile.install[0]?.command ?? "npm i -g <cli>";
  return `docker run --rm -it node:20 sh -c "${install} && ${profile.identity.slug} --help"`;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  try {
    const profile = await getCliProfile(slug);
    const commandCount = profile.commands.length;
    const baseName = profile.identity.name.replace(/\s+CLI$/i, "");
    return createPageMetadata({
      title: `${baseName} CLI Commands`,
      description: `${profile.identity.description}. Install, authenticate, and use ${profile.identity.name}. Command reference with ${commandCount} commands, workflow recipes, and agent compatibility data.`,
      path: `/cli/${slug}`,
      imagePath: `/cli/${slug}/opengraph-image`
    });
  } catch {
    return {
      title: "CLI Profile"
    };
  }
}

export default async function CliProfilePage({ params, searchParams }: Params) {
  const { slug } = await params;
  const query = (await searchParams) ?? {};
  const [profile, workflows] = await Promise.all([getCliProfile(slug), getWorkflows()]);
  const workflowRecipes = workflows
    .filter((workflow) => workflow.steps.some((step) => step.cli_slug === slug))
    .slice(0, 6);

  const globalFlags = findGlobalFlags(profile);
  const commandGroups = groupCommandsByWorkflow(profile.commands);
  const runtime = inferRuntime(profile);
  const platforms = inferPlatforms(profile);
  const installSize = estimateInstallSizeMb(profile);
  const ports = inferPorts(profile);
  const sandbox = sandboxRecommendation(profile);

  const compatibilityMap = new Map(
    profile.identity.compatibility.map((entry) => [entry.agent_name.toLowerCase(), entry] as const)
  );
  const compatibilityRows = COMPATIBILITY_ORDER.map((agentName) => {
    const existing = compatibilityMap.get(agentName);
    return (
      existing ?? {
        agent_name: agentName,
        status: "untested" as const,
        success_rate: 0,
        last_verified: profile.identity.last_verified ?? profile.identity.last_updated
      }
    );
  });

  const reportStatus = query.report === "success" ? "success" : query.report === "error" ? "error" : null;
  const reportMessage = query.message ? decodeURIComponent(query.message) : null;

  async function submitIssue(formData: FormData) {
    "use server";
    const reason = String(formData.get("reason") ?? "incorrect_data");
    const detail = String(formData.get("detail") ?? "").trim();
    try {
      await createSubmission({
        type: "edit_listing",
        submitter: "web-flag",
        target_cli_slug: slug,
        content: {
          kind: "flag",
          reason,
          detail
        }
      });
      redirect(`/cli/${slug}?report=success&message=Issue%20report%20submitted.%20Thank%20you%20for%20improving%20the%20registry.`);
    } catch (error) {
      console.error("[cli-profile] Failed to submit issue report:", error);
      redirect(`/cli/${slug}?report=error&message=Issue%20report%20failed.%20Please%20try%20again.`);
    }
  }

  const jsonLd = sanitizeJsonLd({
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: profile.identity.name,
    description: profile.identity.description,
    applicationCategory: "DeveloperApplication",
    softwareVersion: profile.identity.latest_version,
    url: profile.identity.website,
    keywords: profile.identity.category_tags.join(", ")
  });

  return (
    <div className="page grid">
      <section className="card">
        <p className="kicker">CLI Profile</p>
        <h1 className="page-title profile-title">
          {profile.identity.name}
        </h1>
        <div className="badge-row" style={{ marginTop: "8px" }}>
          {verificationBadge(profile.identity.verification_status)}
          <span className="badge neutral">{profile.identity.publisher}</span>
          <span className="badge neutral">v{profile.identity.latest_version}</span>
        </div>
        <p className="page-subtitle" style={{ marginTop: "8px", maxWidth: "920px" }}>
          {profile.identity.description}
        </p>
      </section>

      <div className="profile-layout">
        <div className="grid">
          <section className="card">
            <div className="section-label">Install Matrix</div>
            <InstallTabs install={profile.install} />
          </section>

          <section className="card">
            <div className="section-label">Auth Guide</div>
            <div className="badge-row" style={{ marginBottom: "8px" }}>
              <span className="badge neutral">{authTypeLabel(profile.auth.auth_type)}</span>
              {profile.auth.scopes.slice(0, 2).map((scope) => (
                <span key={scope} className="badge neutral">
                  {scope}
                </span>
              ))}
            </div>
            <p className="stat-meta" style={{ marginTop: 0 }}>
              Token refresh: {profile.auth.token_refresh}
            </p>
            <div className="grid" style={{ marginTop: "8px" }}>
              {profile.auth.setup_steps.map((step) => (
                <article key={step.order} className="command-row">
                  <p className="command-title">Step {step.order}</p>
                  <p className="command-desc">{step.instruction}</p>
                  {step.command ? (
                    <CopyableCommand value={step.command} compact />
                  ) : null}
                </article>
              ))}
            </div>
          </section>

          <section className="card">
            <div className="section-label">Command Map</div>
            {globalFlags.length > 0 ? (
                <div className="command-row" style={{ marginBottom: "8px" }}>
                <p className="command-title">Global Flags</p>
                <ul className="param-list">
                  {globalFlags.map((flag) => (
                    <li className="param-item" key={`global-${flag.name}`}>
                      <span className="param-name">{flag.name}</span>
                      {` (${flag.type}) - ${flag.description}`}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="command-list">
              {commandGroups.map((group) => (
                <div key={group.key} className="grid" style={{ gap: "8px" }}>
                  <p className="kicker" style={{ marginBottom: 0 }}>
                    {group.label}
                  </p>
                  {group.commands.map((command) => {
                    const filteredOptional = command.optional_parameters.filter(
                      (parameter) => !globalFlags.some((globalFlag) => globalFlag.name === parameter.name)
                    );
                    const cleanedErrors = cleanCommandErrors(command.common_errors);
                    const output = outputLabel(command.expected_output);

                    return (
                      <article key={command.id} className="command-row">
                        <div
                          style={{ display: "flex", gap: "8px", alignItems: "center", justifyContent: "space-between" }}
                        >
                          <p className="command-title">{command.command}</p>
                          <CopyButton value={command.command} />
                        </div>
                        <p className="command-desc">{command.description}</p>

                        <div className="badge-row" style={{ marginTop: "8px" }}>
                          <span className="badge neutral">Output: {output}</span>
                          {command.workflow_context.slice(0, 2).map((context) => (
                            <span className="badge neutral" key={`${command.id}-${context}`}>
                              {context}
                            </span>
                          ))}
                        </div>

                        {command.required_parameters.length > 0 ? (
                          <ul className="param-list">
                            {command.required_parameters.map((param) => (
                              <li className="param-item" key={`${command.id}-required-${param.name}`}>
                                <span className="param-name">{param.name}</span>
                                <span className="required-tag">required</span>
                                {` (${param.type}) - ${param.description}`}
                              </li>
                            ))}
                          </ul>
                        ) : null}

                        {filteredOptional.length > 0 ? (
                          <ul className="param-list">
                            {filteredOptional.map((param) => (
                              <li className="param-item" key={`${command.id}-optional-${param.name}`}>
                                <span className="param-name">{param.name}</span>
                                <span className="optional-tag">optional</span>
                                {` (${param.type}) - ${param.description}`}
                              </li>
                            ))}
                          </ul>
                        ) : null}

                        {command.examples.length > 0 ? (
                          <div className="grid" style={{ marginTop: "8px" }}>
                            {command.examples.slice(0, 2).map((example, index) => (
                              <div
                                key={`${command.id}-example-${index}`}
                                className="grid"
                                style={{ gap: "8px" }}
                              >
                                <p className="stat-meta" style={{ marginTop: 0 }}>
                                  Example {index + 1}
                                </p>
                                <CopyableCommand value={example} compact />
                              </div>
                            ))}
                          </div>
                        ) : null}

                        {cleanedErrors.length > 0 ? (
                          <p className="stat-meta">Known errors: {cleanedErrors.join("; ")}</p>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              ))}
            </div>
          </section>

          <section className="card">
            <div className="section-label">Workflow Recipes</div>
            {workflowRecipes.length === 0 ? (
              <p className="page-subtitle">No workflow chains currently reference this CLI.</p>
            ) : (
              <div className="grid">
                {workflowRecipes.map((workflow) => (
                  <article key={workflow.id} className="card" style={{ padding: "16px" }}>
                    <h3 className="workflow-card-title">
                      {workflow.title}
                    </h3>
                    <p className="workflow-desc">{workflow.description}</p>
                    <div className="workflow-chain" style={{ marginTop: "16px" }}>
                      {workflow.steps.slice(0, 5).map((step, index) => (
                        <div
                          key={`${workflow.id}-${step.step_number}`}
                          style={{ display: "inline-flex", alignItems: "center" }}
                        >
                          <div className="workflow-step">
                            <span className="step-number">{step.step_number}</span>
                            <span>{step.cli_slug}</span>
                          </div>
                          {index < Math.min(workflow.steps.length, 5) - 1 ? (
                            <span className="workflow-arrow">→</span>
                          ) : null}
                        </div>
                      ))}
                    </div>
                    <p className="stat-meta" style={{ marginTop: "8px" }}>
                      <Link href={`/workflows/${workflow.slug}` as string}>Open workflow detail</Link>
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="grid" style={{ alignContent: "start" }}>
          <section className="card">
            <div className="section-label">Compatibility</div>
            <div className="agent-badges">
              {compatibilityRows.map((compatibility) => {
                const className =
                  compatibility.status === "untested"
                    ? "untested"
                    : compatibility.status === "verified"
                      ? "good"
                      : compatibility.status === "partial"
                        ? "warn"
                        : "bad";
                const isEstimated = compatibility.status === "untested";
                const scoreLabel =
                  compatibility.status === "untested"
                    ? "Untested"
                    : `${Math.round(compatibility.success_rate * 100)}%`;
                return (
                  <span className="agent-badge" key={compatibility.agent_name}>
                    <span className={`status-dot ${className}`} aria-hidden="true" />
                    <span>{displayAgentName(compatibility.agent_name)}</span>
                    <span>{scoreLabel}</span>
                    {isEstimated ? (
                      <span
                        className="badge neutral"
                        title="Estimated compatibility. This score has not yet been agent-verified."
                      >
                        Estimated
                      </span>
                    ) : null}
                  </span>
                );
              })}
            </div>
          </section>

          <section className="card">
            <div className="section-label">Requirements</div>
            <ul className="info-list">
              <li>Runtime: {runtime}</li>
              <li>
                Platforms: {platforms.length > 0 ? platforms.join(", ") : "Unknown"} (arm64, x86_64)
              </li>
              <li>Approx. Size (estimated): ~{installSize} MB</li>
            </ul>
          </section>

          <section className="card">
            <div className="section-label">Permissions</div>
            <ul className="info-list">
              <li>
                Network: {profile.identity.permission_scope.includes("network") ? "Yes" : "No"}
              </li>
              <li>
                Filesystem:{" "}
                {profile.identity.permission_scope.includes("filesystem") ? "Read/Write" : "None"}
              </li>
              <li>
                Credentials:{" "}
                {profile.auth.environment_variables.length > 0
                  ? profile.auth.environment_variables.join(", ")
                  : "None"}
              </li>
              <li>Ports: {ports.length > 0 ? ports.join(", ") : "Not declared"}</li>
            </ul>
          </section>

          {sandbox ? (
            <section className="card">
              <div className="section-label">Safe Execution</div>
              <p className="page-subtitle" style={{ marginTop: 0 }}>
                This CLI has broad system access. Recommended: run inside a container/sandbox.
              </p>
              <div className="command-copy-row" style={{ marginTop: "8px" }}>
                <CopyableCommand value={sandbox} compact />
              </div>
            </section>
          ) : null}

          <section className="card">
            <div className="section-label">Listing Stats</div>
            <ul className="info-list">
              <li>Queries/Week: {profile.identity.popularity_score.toFixed(1)}</li>
              <li>Trust Score: {profile.identity.trust_score.toFixed(1)}</li>
              <li>
                Last Verified:{" "}
                {profile.identity.last_verified
                  ? new Date(profile.identity.last_verified).toLocaleString()
                  : "Unknown"}
              </li>
              <li>Last Updated: {new Date(profile.identity.last_updated).toLocaleString()}</li>
              <li>Website: {profile.identity.website}</li>
            </ul>
          </section>

          <section className="card">
            <div className="section-label">Version Feed</div>
            {profile.listing_version ? (
              <ul className="info-list">
                <li>Version: #{profile.listing_version.version_number}</li>
                <li>ID: {profile.listing_version.id}</li>
                <li>Updated: {new Date(profile.listing_version.updated_at).toLocaleString()}</li>
                <li>Changes: {profile.listing_version.changed_fields.join(", ")}</li>
              </ul>
            ) : (
              <p className="page-subtitle">No explicit listing version metadata yet.</p>
            )}
          </section>

          <section className="card">
            <div className="section-label">Report Issue</div>
            {reportStatus && reportMessage ? (
              <p className={`form-alert ${reportStatus}`}>{reportMessage}</p>
            ) : null}
            <form action={submitIssue} className="grid">
              <div className="form-field">
                <label className="form-label" htmlFor="report-reason">
                  Reason <span className="required">*</span>
                </label>
                <select
                  id="report-reason"
                  name="reason"
                  className="form-select"
                  defaultValue="incorrect_data"
                >
                  <option value="incorrect_data">Incorrect data</option>
                  <option value="suspicious">Suspicious or malicious</option>
                  <option value="outdated">Outdated listing</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="form-field">
                <label className="form-label" htmlFor="report-detail">
                  Additional Detail
                </label>
                <textarea
                  id="report-detail"
                  name="detail"
                  className="form-textarea"
                  rows={3}
                  placeholder="Optional details"
                />
              </div>
              <div className="form-actions">
                <FormSubmitButton idleLabel="Submit Flag" pendingLabel="Submitting Flag..." />
              </div>
            </form>
          </section>
        </aside>
      </div>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(jsonLd) }} />
    </div>
  );
}
