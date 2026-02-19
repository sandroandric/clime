"use client";

import { useEffect, useMemo, useState } from "react";
import type { HomeDemoSnapshot } from "../lib/home-demo";
import { formatRelativeTime } from "../lib/time";

const AGENTS = [
  { id: "claude-code", label: "Claude Code" },
  { id: "codex-cli", label: "Codex CLI" },
  { id: "gemini-cli", label: "Gemini CLI" },
  { id: "opencode", label: "OpenCode" }
] as const;

type DemoLine =
  | { kind: "command"; value: string }
  | { kind: "text"; value: string }
  | { kind: "row"; value: string };

function normalizeWorkflowPurpose(purpose: string) {
  return purpose
    .trim()
    .replace(/^Execute\s+/i, "Use ")
    .replace(/\s+stage in\s+.+workflow\.?$/i, "")
    .trim();
}

function buildLines(snapshot: HomeDemoSnapshot): DemoLine[] {
  const lines: DemoLine[] = [];
  const searchCommand = `clime search "${snapshot.query}"`;
  lines.push({ kind: "command", value: searchCommand });
  lines.push({ kind: "text", value: "NAME | SCORE | VERIFIED | INSTALL" });
  for (const row of snapshot.rows) {
    lines.push({
      kind: "row",
      value: `${row.name} | ${row.score} | ${row.verified ? "✓" : "~"} | ${row.install}`
    });
  }
  lines.push({ kind: "text", value: `${snapshot.rows.length} ranked matches` });
  lines.push({ kind: "command", value: 'clime workflow "full-stack saas"' });
  if (snapshot.workflow) {
    lines.push({
      kind: "text",
      value: `${snapshot.workflow.title.toUpperCase()} (${snapshot.workflow.steps.length} steps, ~${snapshot.workflow.estimated_minutes} min)`
    });
    for (const step of snapshot.workflow.steps) {
      lines.push({
        kind: "row",
        value: `${step.step_number}. ${step.cli_slug} - ${normalizeWorkflowPurpose(step.purpose)}`
      });
    }
  } else {
    lines.push({ kind: "text", value: "No workflow chain found for current query." });
  }
  return lines;
}

export function AgentSplitDemo({ initial }: { initial: HomeDemoSnapshot }) {
  const [snapshot, setSnapshot] = useState<HomeDemoSnapshot>(initial);
  const [tick, setTick] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [spinnerFrame, setSpinnerFrame] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);
  const lines = useMemo(() => buildLines(snapshot), [snapshot]);

  const cycleLength = Math.max(18, lines.length + 10);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    let stopped = false;

    const poll = async () => {
      try {
        const response = await fetch(`/api/home-demo?ts=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) {
          if (!stopped) {
            setConsecutiveFailures((current) => current + 1);
          }
          return;
        }
        const payload = (await response.json()) as HomeDemoSnapshot;
        if (!stopped) {
          setSnapshot(payload);
          setConsecutiveFailures(0);
        }
      } catch {
        if (!stopped) {
          setConsecutiveFailures((current) => current + 1);
        }
      }
    };

    const pollInterval = window.setInterval(() => {
      void poll();
    }, 20_000);
    const tickInterval = reduceMotion
      ? undefined
      : window.setInterval(() => {
          setTick((value) => value + 1);
        }, 210);
    const clockInterval = window.setInterval(() => setNowMs(Date.now()), 1_000);
    const spinnerInterval = reduceMotion
      ? undefined
      : window.setInterval(
          () => setSpinnerFrame((value) => (value + 1) % 4),
          180
        );

    return () => {
      stopped = true;
      window.clearInterval(pollInterval);
      if (tickInterval) {
        window.clearInterval(tickInterval);
      }
      window.clearInterval(clockInterval);
      if (spinnerInterval) {
        window.clearInterval(spinnerInterval);
      }
    };
  }, [cycleLength, reduceMotion]);

  useEffect(() => {
    if (reduceMotion) {
      setTick(lines.length + AGENTS.length * 3);
      setSpinnerFrame(0);
    }
  }, [lines.length, reduceMotion]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    const panes = document.querySelectorAll(".split-terminal .terminal-body");
    for (const pane of panes) {
      if (pane instanceof HTMLElement) {
        pane.scrollTop = pane.scrollHeight;
      }
    }
  }, [tick, lines.length]);

  return (
    <div className="split-demo-grid">
      {AGENTS.map((agent, index) => {
        const offset = index * 3;
        const visibleCount = Math.max(0, Math.min(lines.length, tick - offset));
        const activeIndex =
          visibleCount > 0 ? Math.min(visibleCount - 1, lines.length - 1) : -1;
        const spinner = ["|", "/", "-", "\\"][(spinnerFrame + index) % 4] ?? "|";
        const isLiveMode = snapshot.source === "live" && consecutiveFailures < 3;
        const statusLabel =
          snapshot.source === "fallback"
            ? "sample · fallback data"
            : consecutiveFailures >= 3
              ? "connection lost · showing last snapshot"
              : snapshot.degraded
                ? `live (partial) · ${formatRelativeTime(snapshot.generated_at, nowMs)}`
                : `live · ${formatRelativeTime(snapshot.generated_at, nowMs)}`;

        return (
          <article className="card" key={agent.id}>
            <div className="split-demo-head">
              <span className="badge neutral">{agent.label}</span>
              <span className="split-demo-meta">
                <span className={`terminal-spinner${isLiveMode ? "" : " muted"}`} aria-hidden="true">
                  {isLiveMode ? spinner : "•"}
                </span>
                <span style={isLiveMode ? undefined : { opacity: 0.76 }}>{statusLabel}</span>
              </span>
            </div>
            <div className="terminal split-terminal">
              <div className="terminal-header">
                <span className="terminal-dot red" />
                <span className="terminal-dot yellow" />
                <span className="terminal-dot green" />
                <span className="terminal-title">{agent.label}</span>
              </div>
              <div className="terminal-body grid" style={{ gap: "5px" }}>
                {lines.slice(0, visibleCount).map((line, lineIndex) => {
                  const className = `terminal-line terminal-note ${
                    lineIndex === activeIndex ? "terminal-highlight" : ""
                  }`;

                  if (line.kind === "command") {
                    return (
                      <p className="terminal-line command-line" key={`${agent.id}-line-${lineIndex}`}>
                        <span className="prompt">$ </span>
                        {line.value}
                      </p>
                    );
                  }

                  return (
                    <p className={className} key={`${agent.id}-line-${lineIndex}`}>
                      {line.value}
                    </p>
                  );
                })}
                {visibleCount < lines.length ? (
                  <p className="terminal-line terminal-note">
                    <span className="terminal-cursor" aria-hidden="true">
                      |
                    </span>
                  </p>
                ) : null}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
