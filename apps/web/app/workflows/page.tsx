import Link from "next/link";
import { getWorkflowSearch, getWorkflows } from "../../lib/api";
import { createPageMetadata } from "../../lib/metadata";

export const revalidate = 60;
export const metadata = createPageMetadata({
  title: "CLI Workflow Chains",
  description:
    "Multi-step CLI workflow chains for deployment, databases, auth, monitoring, and full-stack delivery.",
  path: "/workflows"
});

type Props = {
  searchParams: Promise<{ tag?: string; sort?: string }>;
};

export default async function WorkflowsPage({ searchParams }: Props) {
  const { tag, sort } = await searchParams;
  const [allWorkflows, stackSuggestions] = await Promise.all([
    getWorkflows(),
    getWorkflowSearch("full stack saas", 4)
  ]);

  const featured = stackSuggestions.find((workflow) => workflow.slug === "full-stack-saas") ?? stackSuggestions[0];
  const tags = [...new Set(allWorkflows.flatMap((workflow) => workflow.tags))].sort((a, b) =>
    a.localeCompare(b)
  );

  const filtered = allWorkflows.filter((workflow) => (tag ? workflow.tags.includes(tag) : true));
  const workflows = filtered.sort((a, b) => {
    if (sort === "time") {
      return a.estimated_minutes - b.estimated_minutes;
    }
    if (sort === "steps") {
      return b.steps.length - a.steps.length;
    }
    return b.steps.length - a.steps.length || a.title.localeCompare(b.title);
  });
  const mainWorkflows = workflows.filter((workflow) => workflow.steps.length >= 2);
  const quickActions = workflows.filter((workflow) => workflow.steps.length === 1);

  return (
    <div className="page grid">
      <section>
        <p className="kicker">Workflow Chains</p>
        <h1 className="page-title">Build a stack by intent.</h1>
        <p className="page-subtitle">
          Ordered multi-CLI chains for real tasks, with step-by-step intent mapping for agents and humans.
        </p>
      </section>

      {featured ? (
        <section>
          <div className="section-label">Recommended Chain</div>
          <article className="card">
            <h2 className="workflow-card-title">{featured.title}</h2>
            <p className="workflow-desc">{featured.description}</p>
            <div className="workflow-chain">
              {featured.steps.map((step, index) => (
                <div key={`${featured.id}-${step.step_number}`} style={{ display: "inline-flex", alignItems: "center" }}>
                  <div className="workflow-step">
                    <span className="step-number">{step.step_number}</span>
                    <span>{step.cli_slug}</span>
                  </div>
                  {index < featured.steps.length - 1 ? <span className="workflow-arrow">→</span> : null}
                </div>
              ))}
            </div>
          </article>
        </section>
      ) : null}

      <section className="card">
        <div className="section-label">Filters</div>
        <div className="badge-row">
          <Link href="/workflows" className={`badge neutral badge-interactive${!tag ? " active" : ""}`}>
            all
          </Link>
          {tags.map((item) => (
            <Link
              key={item}
              href={
                `/workflows?tag=${encodeURIComponent(item)}${
                  sort ? `&sort=${encodeURIComponent(sort)}` : ""
                }` as string
              }
              className={`badge neutral badge-interactive${tag === item ? " active" : ""}`}
            >
              {item}
            </Link>
          ))}
        </div>
        <div className="badge-row" style={{ marginTop: "8px" }}>
          <Link
            href={`/workflows${tag ? `?tag=${encodeURIComponent(tag)}` : ""}` as string}
            className={`badge neutral badge-interactive${!sort ? " active" : ""}`}
          >
            default
          </Link>
          <Link
            href={`/workflows?sort=steps${tag ? `&tag=${encodeURIComponent(tag)}` : ""}` as string}
            className={`badge neutral badge-interactive${sort === "steps" ? " active" : ""}`}
          >
            sort: steps
          </Link>
          <Link
            href={`/workflows?sort=time${tag ? `&tag=${encodeURIComponent(tag)}` : ""}` as string}
            className={`badge neutral badge-interactive${sort === "time" ? " active" : ""}`}
          >
            sort: time
          </Link>
        </div>
      </section>

      <section>
        <div className="section-label">All Workflows</div>
        <div className="grid grid-2">
          {mainWorkflows.map((workflow) => (
            <article className="card" key={workflow.id}>
              <h2 className="workflow-card-title">{workflow.title}</h2>
              <p className="workflow-desc">{workflow.description}</p>
              <div className="badge-row" style={{ marginTop: "8px" }}>
                <span className="badge neutral">
                  {workflow.steps.length} {workflow.steps.length === 1 ? "step" : "steps"}
                </span>
                <span className="badge neutral">~{workflow.estimated_minutes} min</span>
                {workflow.tags.slice(0, 3).map((item) => (
                  <span className="badge neutral" key={`${workflow.id}-${item}`}>
                    {item}
                  </span>
                ))}
              </div>
              <div className="workflow-chain" style={{ marginTop: "16px" }}>
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
                <Link href={`/workflows/${workflow.slug}` as string}>View workflow detail</Link>
              </p>
            </article>
          ))}
        </div>
      </section>

      {quickActions.length > 0 ? (
        <section>
          <div className="section-label">Quick Actions</div>
          <div className="grid grid-2">
            {quickActions.map((workflow) => (
              <article className="card" key={workflow.id}>
                <h2 className="workflow-card-title">{workflow.title}</h2>
                <p className="workflow-desc">{workflow.description}</p>
                <div className="badge-row" style={{ marginTop: "8px" }}>
                  <span className="badge neutral">1 step</span>
                  <span className="badge neutral">single-CLI shortcut</span>
                </div>
                <div className="workflow-chain" style={{ marginTop: "16px" }}>
                  <div className="workflow-step">
                    <span className="step-number">1</span>
                    <span>{workflow.steps[0]?.cli_slug}</span>
                  </div>
                </div>
                <p className="stat-meta" style={{ marginTop: "8px" }}>
                  <Link href={`/workflows/${workflow.slug}` as string}>View workflow detail</Link>
                </p>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
