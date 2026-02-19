import { AgentSplitDemo } from "../../components/agent-split-demo";
import { fetchHomeDemoSnapshot } from "../../lib/home-demo";
import { createPageMetadata } from "../../lib/metadata";

export const revalidate = 60;
export const metadata = createPageMetadata({
  title: "4-Agent Split-Screen Demo",
  description:
    "Watch the same clime task flow run across Claude Code, Codex CLI, Gemini CLI, and OpenCode in a split-screen terminal demo.",
  path: "/demo"
});

export default async function DemoPage() {
  const snapshot = await fetchHomeDemoSnapshot();

  return (
    <div className="page grid">
      <section>
        <p className="kicker">Demo</p>
        <h1 className="page-title">One command path across four agents.</h1>
        <p className="page-subtitle">
          This split-screen view shows the same `clime search` + `clime workflow` loop mirrored
          across agent interfaces to demonstrate cross-agent consistency.
        </p>
      </section>

      <section>
        <div className="section-label">4-Agent Split-Screen</div>
        <AgentSplitDemo initial={snapshot} />
      </section>
    </div>
  );
}
