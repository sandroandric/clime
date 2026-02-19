import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CopyableCommand } from "../../../components/copyable-command";
import { getCliProfiles, getWorkflows } from "../../../lib/api";
import { createPageMetadata } from "../../../lib/metadata";

type Props = {
  params: Promise<{ slug: string }>;
};

export const revalidate = 60;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const workflows = await getWorkflows();
  const workflow = workflows.find((item) => item.slug === slug);
  if (!workflow) {
    return { title: "Workflow Not Found" };
  }

  return createPageMetadata({
    title: workflow.title,
    description: workflow.description,
    path: `/workflows/${workflow.slug}`
  });
}

export default async function WorkflowDetailPage({ params }: Props) {
  const { slug } = await params;
  const [workflows, clis] = await Promise.all([getWorkflows(), getCliProfiles()]);
  const workflow = workflows.find((item) => item.slug === slug);
  if (!workflow) {
    notFound();
  }

  const cliMap = new Map(clis.map((cli) => [cli.identity.slug, cli] as const));
  const requiredEnvs = new Set<string>();
  const authRequiredBy = new Set<string>();

  for (const step of workflow.steps) {
    const profile = cliMap.get(step.cli_slug);
    for (const envVar of profile?.auth.environment_variables ?? []) {
      requiredEnvs.add(envVar);
    }
    if (step.auth_prerequisite && profile) {
      authRequiredBy.add(profile.identity.name);
    }
  }

  return (
    <div className="page grid">
      <section>
        <p className="kicker">Workflow Detail</p>
        <h1 className="page-title">{workflow.title}</h1>
        <p className="page-subtitle">{workflow.description}</p>
      </section>

      <section className="card">
        <div className="section-label">Overview</div>
        <div className="badge-row">
          <span className="badge neutral">
            {workflow.steps.length} {workflow.steps.length === 1 ? "step" : "steps"}
          </span>
          <span className="badge neutral">~{workflow.estimated_minutes} min</span>
          {workflow.tags.map((tag) => (
            <span key={tag} className="badge neutral">
              {tag}
            </span>
          ))}
        </div>
        {requiredEnvs.size > 0 ? (
          <p className="stat-meta" style={{ marginTop: "8px" }}>
            Required env vars: {Array.from(requiredEnvs).join(", ")}
          </p>
        ) : null}
        {authRequiredBy.size > 0 ? (
          <p className="stat-meta" style={{ marginTop: "4px" }}>
            Auth needed for: {Array.from(authRequiredBy).join(", ")}
          </p>
        ) : null}
      </section>

      <section className="grid" style={{ gap: "8px" }}>
        <div className="section-label">Step By Step</div>
        {workflow.steps.map((step) => {
          const profile = cliMap.get(step.cli_slug);
          if (!profile) {
            return null;
          }
          const mappedCommands = profile.commands.filter((command) => step.command_ids.includes(command.id));
          const commands = mappedCommands.length > 0 ? mappedCommands : profile.commands.slice(0, 2);
          return (
            <article key={`${workflow.id}-${step.step_number}`} className="card">
              <div className="badge-row">
                <span className="badge verified">Step {step.step_number}</span>
                <Link className="badge neutral" href={`/cli/${profile.identity.slug}`}>
                  {profile.identity.name}
                </Link>
                {step.auth_prerequisite ? <span className="badge community">Auth required</span> : null}
              </div>
              <p className="command-desc" style={{ marginTop: "8px" }}>
                {step.purpose}
              </p>
              {step.auth_prerequisite ? (
                <div className="command-row" style={{ marginTop: "8px" }}>
                  <p className="command-title">Authentication</p>
                  <ul className="param-list">
                    {profile.auth.setup_steps.slice(0, 2).map((authStep) => (
                      <li className="param-item" key={`${step.step_number}-auth-${authStep.order}`}>
                        <span className="param-name">Step {authStep.order}</span> {authStep.instruction}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="grid" style={{ gap: "8px", marginTop: "8px" }}>
                {commands.map((command) => (
                  <div key={command.id} className="command-row">
                    <p className="command-title">{command.command}</p>
                    <p className="command-desc">{command.description}</p>
                    {command.examples.slice(0, 1).map((example) => (
                      <CopyableCommand key={example} value={example} compact />
                    ))}
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
