import Link from "next/link";
import {
  getApiHealth,
  getCliSummaries,
  getRanking,
  getWorkflows
} from "../lib/api";
import { HomeTerminalDemo } from "../components/home-terminal-demo";
import { fetchHomeDemoSnapshot } from "../lib/home-demo";
import { createPageMetadata } from "../lib/metadata";
import { CopyableCommand } from "../components/copyable-command";

export const revalidate = 60;
export const metadata = createPageMetadata({
  title: "clime | The CLI Registry for AI Agents",
  description:
    "Search, discover, and chain command-line tools for humans and AI agents with curated workflows and rankings.",
  path: "/",
  absoluteTitle: true
});

function compactNumber(value: number) {
  return new Intl.NumberFormat("en", { notation: "compact" }).format(value);
}

export default async function HomePage() {
  const [used, workflows, clis, demoSnapshot, apiHealth] = await Promise.all([
    getRanking("used"),
    getWorkflows(),
    getCliSummaries(),
    fetchHomeDemoSnapshot(),
    getApiHealth()
  ]);

  const cliCount = clis.length;
  const workflowCount = workflows.length;
  const queryVolume = used.entries.reduce((sum, entry) => sum + Math.max(entry.score, 0), 0);
  const verifiedPublisherCount = new Set(
    clis
      .filter((cli) => cli.verification_status === "publisher-verified")
      .map((cli) => cli.publisher)
  ).size;

  const trending = used.entries.slice(0, 8);
  const isStatsDegraded =
    !apiHealth.ok || demoSnapshot.source !== "live" || demoSnapshot.degraded;
  const workflowPriority = ["full-stack-saas", "infra-bootstrap", "developer-loop", "database-setup"];
  const featuredWorkflows = workflowPriority
    .map((slug) => workflows.find((workflow) => workflow.slug === slug))
    .filter((workflow): workflow is (typeof workflows)[number] => Boolean(workflow))
    .filter((workflow) => workflow.steps.length >= 3)
    .slice(0, 4);

  return (
    <div className="page grid">
      <section className="hero">
        <p className="hero-eyebrow">{`${cliCount} CLIs · ${workflowCount} Workflows · Built for Agents`}</p>
        <h1 className="hero-title">
          One CLI to find <strong>every</strong> CLI.
        </h1>
        <p className="hero-subtitle">
          Install clime once, then discover, install, and run the right CLI for any task.
          Built for <span className="hero-subtitle-emphasis">agents and humans</span> using the same shell-first workflow.
        </p>
        <p className="hero-proof">
          Fewer retries, fewer wrapper contexts, and lower token usage for agent workflows.{" "}
          <Link href="/benchmarks" className="inline-link">
            See O(1) vs O(n) benchmark
          </Link>
          .
        </p>
        {isStatsDegraded ? (
          <p className="hero-data-health">
            Data source degraded: showing partial/sample data until API recovers.
          </p>
        ) : null}

        <div className="hero-get-started">
          <p className="section-label">
            Get Started
          </p>
          <div className="grid">
            <div className="command-copy-row">
              <CopyableCommand value="npm i -g @cli-me/cli" />
            </div>
          </div>
          <div className="hero-paths grid grid-2">
            <article className="card hero-path-card">
              <p className="kicker">Agent Path</p>
              <p className="workflow-desc">
                Bootstrap once, keep all outputs machine-parseable, and follow deterministic next steps.
              </p>
              <div className="command-copy-row">
                <CopyableCommand value="clime init --agent --json" />
              </div>
            </article>
            <article className="card hero-path-card">
              <p className="kicker">Human Path</p>
              <p className="workflow-desc">
                Search by task, compare options, then open install/auth guidance before running commands.
              </p>
              <div className="command-copy-row">
                <CopyableCommand value={'clime search "deploy next.js app"'} />
              </div>
            </article>
          </div>
        </div>
      </section>

      <section>
        <div className="section-label">How It Works</div>
        <div className="grid grid-3">
          <article className="card">
            <div className="how-it-works-step">
              <span className="step-number">1</span>
              <h2 className="workflow-card-title">
                Install clime once
              </h2>
            </div>
            <p className="workflow-desc">
              Install <code className="mono">npm i -g @cli-me/cli</code>. For agents, run{" "}
              <code className="mono">clime init --agent --json</code> once to get a deterministic
              setup payload and next-step commands.
            </p>
          </article>
          <article className="card">
            <div className="how-it-works-step">
              <span className="step-number">2</span>
              <h2 className="workflow-card-title">
                Ask by intent
              </h2>
            </div>
            <p className="workflow-desc">
              Run <code className="mono">clime search "deploy next.js app"</code> to get ranked,
              structured results with install methods, auth flows, and command maps.
            </p>
          </article>
          <article className="card">
            <div className="how-it-works-step">
              <span className="step-number">3</span>
              <h2 className="workflow-card-title">
                Install, auth, execute
              </h2>
            </div>
            <p className="workflow-desc">
              Use <code className="mono">clime install</code>, <code className="mono">clime auth</code>,
              and <code className="mono">clime commands</code> to execute correctly, then report outcomes
              with <code className="mono">clime report</code>.
            </p>
          </article>
        </div>
        <p className="homepage-callout">
          {`clime is a CLI for finding CLIs. One install gives agents and developers access to ${cliCount} command-line tools in the current registry.`}
        </p>
      </section>

      <section>
        <div className="section-label">{isStatsDegraded ? "Registry Stats" : "Live Stats"}</div>
        <div className="grid grid-4">
          <article className="stat-card">
            <p className="stat-label">CLIs Indexed</p>
            <p className="stat-value">{compactNumber(cliCount)}</p>
            <p className="stat-meta">Curated for agent use</p>
          </article>
          <article className="stat-card">
            <p className="stat-label">Usage Signal</p>
            <p className="stat-value">{compactNumber(Math.round(queryVolume))}</p>
            <p className="stat-meta">Composite ranking score</p>
          </article>
          <article className="stat-card">
            <p className="stat-label">Workflows</p>
            <p className="stat-value">{compactNumber(workflowCount)}</p>
            <p className="stat-meta">Ordered multi-CLI chains</p>
          </article>
          <article className="stat-card">
            <p className="stat-label">Claim-Verified Publishers</p>
            <p className="stat-value">{verifiedPublisherCount}</p>
            <p className="stat-meta">Approved ownership claims</p>
          </article>
        </div>
      </section>

      <section>
        <div className="section-label">Demo</div>
        <HomeTerminalDemo initial={demoSnapshot} />
        <div className="badge-row" style={{ marginTop: "8px" }}>
          <Link href="/demo" className="badge verified">
            Open 4-agent split-screen
          </Link>
          <Link href="/benchmarks" className="badge neutral">
            View O(1) vs O(n) benchmark
          </Link>
        </div>
      </section>

      <section>
        <div className="section-label">Built For Agents and Developers</div>
        <div className="grid grid-2">
          <article className="card">
            <h2 className="workflow-card-title">
              For AI Agents
            </h2>
            <p className="workflow-desc">
              Any agent that runs shell commands can use clime with zero integration. Works with
              Claude Code, Codex CLI, Gemini CLI, OpenCode, Cline, and Aider out of the box.
              Works out of the box via shell commands. Optional MCP server included for tighter integration.
            </p>
          </article>
          <article className="card">
            <h2 className="workflow-card-title">
              For Developers
            </h2>
            <p className="workflow-desc">
              Browse the CLI landscape. Find the right tool for the job. Bookmark command
              references. Compare tools side by side. Contribute listings and workflows.
            </p>
          </article>
        </div>
      </section>

      <section>
        <div className="section-label">The Problem</div>
        <article className="card">
          <p className="page-subtitle" style={{ marginTop: 0, maxWidth: "900px" }}>
            AI agents can run shell commands, but they have no direct way to discover which CLI tools
            exist, how to install them, or how to use them correctly. Today each tool often requires
            a custom bridge. There are thousands of CLIs and thousands of agents, and one-off
            integrations do not scale. clime replaces that sprawl with a single CLI that agents already understand.
          </p>
        </article>
      </section>

      <section>
        <div className="section-label">Trending This Week</div>
        <div className="ranking-list">
          {trending.map((entry, index) => {
            const max = trending[0]?.score || 1;
            const width = Math.max((entry.score / max) * 100, 8);
            const trend = entry.delta ?? 0;
            const trendClass = Math.abs(trend) < 0.5 ? "flat" : trend > 0 ? "up" : "down";
            const trendPrefix = Math.abs(trend) < 0.5 ? "—" : trend > 0 ? "↑" : "↓";
            const trendValue = Math.abs(trend) < 0.5 ? "—" : `${Math.abs(trend).toFixed(1)}%`;
            const trendLabel = Math.abs(trend) < 0.5 ? "—" : `${trendPrefix} ${trendValue}`;
            const trendSource = entry.metadata?.delta_source === "measured" ? "Measured" : "Estimated";
            const trendSourceClass = entry.metadata?.delta_source === "measured" ? "measured" : "seeded";

            return (
              <Link key={entry.id} href={`/cli/${entry.id}`} className="ranking-row ranking-row-link">
                <div className="ranking-position">{index + 1}</div>
                <div className="ranking-name">{entry.label}</div>
                <div className="ranking-bar-wrap">
                  <div className="ranking-bar" style={{ width: `${width}%` }} aria-label={`Score: ${entry.score.toFixed(1)}`} />
                </div>
                <div className="ranking-stat">{entry.score.toFixed(1)}</div>
                <div className="ranking-trend-group">
                  <div className={`ranking-trend ${trendClass}`}>{trendLabel}</div>
                  <div
                    className={`ranking-source ${trendSourceClass}`}
                    title={
                      trendSourceClass === "measured"
                        ? "Calculated from recent report volume."
                        : "Seeded estimate due to low recent report volume."
                    }
                  >
                    {trendSource}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section>
        <div className="section-label">Popular Workflows</div>
        <div className="grid grid-2">
          {featuredWorkflows.map((workflow) => (
            <article key={workflow.id} className="card">
              <h3 className="workflow-card-title">{workflow.title}</h3>
              <p className="workflow-desc">{workflow.description}</p>
              <div className="workflow-chain">
                {workflow.steps.slice(0, 5).map((step, index) => (
                  <div key={`${workflow.id}-${step.step_number}`} style={{ display: "inline-flex", alignItems: "center" }}>
                    <div className="workflow-step">
                      <span className="step-number">{step.step_number}</span>
                      <span>{step.cli_slug}</span>
                    </div>
                    {index < Math.min(workflow.steps.length, 5) - 1 ? <span className="workflow-arrow">→</span> : null}
                  </div>
                ))}
              </div>
              <p className="stat-meta" style={{ marginTop: "8px" }}>
                <Link href={`/workflows/${workflow.slug}`}>Open workflow detail</Link>
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
