"use client";

import { useEffect, useMemo, useState } from "react";
import { emitCopyToast } from "./copy-toast";
import type { HomeDemoSnapshot } from "../lib/home-demo";
import { formatRelativeTime } from "../lib/time";

const QUERY_TYPING_MS = 34;
const RESULT_REVEAL_MS = 420;
const POST_LINE_REVEAL_MS = 380;
const MAX_VISIBLE_RESULTS = 3;

export function HomeTerminalDemo({ initial }: { initial: HomeDemoSnapshot }) {
  const [snapshot, setSnapshot] = useState<HomeDemoSnapshot>(initial);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [visibleRows, setVisibleRows] = useState(0);
  const [typedQueryChars, setTypedQueryChars] = useState(0);
  const [visiblePostLines, setVisiblePostLines] = useState(0);
  const [copiedCommand, setCopiedCommand] = useState<"search" | null>(null);
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  async function onCopy(value: string, key: "search") {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedCommand(key);
      emitCopyToast("Copied!");
      window.setTimeout(() => {
        setCopiedCommand((current) => (current === key ? null : current));
      }, 1200);
    } catch {
      // no-op on clipboard failure
    }
  }

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
    const clockInterval = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => {
      stopped = true;
      window.clearInterval(pollInterval);
      window.clearInterval(clockInterval);
    };
  }, []);

  useEffect(() => {
    const queryCommandValue = `clime search "${snapshot.query}"`;
    const maxRows = Math.min(snapshot.rows.length, MAX_VISIBLE_RESULTS);
    const postLineCount = [
      true,
      Boolean(snapshot.workflow?.steps.length),
      Boolean(snapshot.workflow?.steps?.length && snapshot.workflow.steps.length > 0),
      true
    ].filter(Boolean).length;
    let rowTimer: number | undefined;
    let postLineTimer: number | undefined;

    setVisibleRows(0);
    setTypedQueryChars(0);
    setVisiblePostLines(0);

    if (reduceMotion) {
      setVisibleRows(maxRows);
      setTypedQueryChars(queryCommandValue.length);
      setVisiblePostLines(postLineCount);
      return;
    }

    const startPostLineReveal = () => {
      if (postLineCount === 0) {
        return;
      }
      postLineTimer = window.setInterval(() => {
        setVisiblePostLines((current) => {
          if (current >= postLineCount) {
            if (postLineTimer) {
              window.clearInterval(postLineTimer);
            }
            return current;
          }
          return current + 1;
        });
      }, POST_LINE_REVEAL_MS);
    };

    const queryTimer = window.setInterval(() => {
      setTypedQueryChars((current) => {
        if (current >= queryCommandValue.length) {
          window.clearInterval(queryTimer);
          if (maxRows === 0) {
            startPostLineReveal();
            return current;
          }
          rowTimer = window.setInterval(() => {
            setVisibleRows((existing) => {
              if (existing >= maxRows) {
                if (rowTimer) {
                  window.clearInterval(rowTimer);
                }
                startPostLineReveal();
                return existing;
              }
              const next = existing + 1;
              return next;
            });
          }, RESULT_REVEAL_MS);
          return current;
        }
        return current + 1;
      });
    }, QUERY_TYPING_MS);

    return () => {
      window.clearInterval(queryTimer);
      if (rowTimer) {
        window.clearInterval(rowTimer);
      }
      if (postLineTimer) {
        window.clearInterval(postLineTimer);
      }
    };
  }, [
    snapshot.generated_at,
    snapshot.query,
    snapshot.rows.length,
    snapshot.workflow?.steps.length,
    reduceMotion
  ]);

  const queryCommand = useMemo(() => `clime search "${snapshot.query}"`, [snapshot.query]);
  const queryTypingDone = typedQueryChars >= queryCommand.length;
  const topRows = snapshot.rows.slice(0, MAX_VISIBLE_RESULTS);
  const rowsComplete = visibleRows >= topRows.length;
  const updatedLabel = useMemo(
    () => formatRelativeTime(snapshot.generated_at, nowMs),
    [snapshot.generated_at, nowMs]
  );
  const capturedAtLabel = useMemo(() => {
    const parsed = Date.parse(snapshot.generated_at);
    if (Number.isNaN(parsed)) {
      return "--:--:--";
    }
    return new Date(parsed).toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  }, [snapshot.generated_at]);
  const workflowName = snapshot.workflow?.title ?? "Full-Stack SaaS";
  const workflowQuery = snapshot.workflow
    ? snapshot.workflow.title.toLowerCase()
    : "full-stack saas";
  const workflowEstimate = snapshot.workflow?.estimated_minutes ?? 45;
  const workflowStepCount = snapshot.workflow?.steps.length ?? 0;
  const workflowChain =
    snapshot.workflow?.steps.slice(0, 5).map((step) => step.cli_slug).join(" -> ") ?? "";
  let postLineCursor = 0;
  const showTopMatches = queryTypingDone && rowsComplete && visiblePostLines > postLineCursor++;
  const showBestWorkflow =
    queryTypingDone &&
    rowsComplete &&
    workflowStepCount > 0 &&
    visiblePostLines > postLineCursor++;
  const showChain = queryTypingDone && rowsComplete && workflowChain && visiblePostLines > postLineCursor++;
  const showNextStep = queryTypingDone && rowsComplete && visiblePostLines > postLineCursor++;
  const terminalStatus = useMemo(() => {
    if (snapshot.source === "fallback") {
      return `SAMPLE SNAPSHOT · static fallback data (${updatedLabel})`;
    }
    if (consecutiveFailures >= 3) {
      return `CONNECTION LOST · last snapshot ${capturedAtLabel} (${updatedLabel}) · retrying...`;
    }
    if (snapshot.degraded) {
      return `LIVE SNAPSHOT (PARTIAL) · captured ${capturedAtLabel} (${updatedLabel}) · ${snapshot.fallback_reason ?? "usage stream unavailable"}`;
    }
    return `LIVE SNAPSHOT · captured ${capturedAtLabel} (${updatedLabel})`;
  }, [
    capturedAtLabel,
    consecutiveFailures,
    snapshot.degraded,
    snapshot.fallback_reason,
    snapshot.source,
    updatedLabel
  ]);
  const isLiveMode = snapshot.source === "live" && consecutiveFailures < 3;

  return (
    <div className="terminal">
      <div className="terminal-header">
        <span className="terminal-dot red" />
        <span className="terminal-dot yellow" />
        <span className="terminal-dot green" />
        <span className="terminal-title">Terminal</span>
      </div>
      <div className="terminal-body home-terminal-body grid">
        <p className="terminal-line terminal-note terminal-live">
          <span className={`live-dot${isLiveMode ? "" : " muted"}`} aria-hidden="true" />
          <span style={isLiveMode ? undefined : { opacity: 0.78 }}>{terminalStatus}</span>
        </p>
        <p className="terminal-line command-line">
          <span className="prompt">$ </span>
          {queryTypingDone ? (
            <button
              type="button"
              className="terminal-copy-command"
              onClick={() => {
                void onCopy(queryCommand, "search");
              }}
              title="Copy command"
            >
              <span className="terminal-copy-value">{queryCommand}</span>
              <span className="terminal-copy-hint">
                {copiedCommand === "search" ? "copied" : "copy"}
              </span>
            </button>
          ) : (
            <span className="terminal-typed">
              {queryCommand.slice(0, typedQueryChars)}
              <span className="terminal-cursor" aria-hidden="true">
                |
              </span>
            </span>
          )}
        </p>
        {queryTypingDone ? (
          <p className="terminal-line terminal-note terminal-fade-in">NAME | SCORE | VERIFIED | INSTALL</p>
        ) : null}
        {topRows.slice(0, visibleRows).map((row) => (
          <p
            className="terminal-line terminal-note terminal-fade-in"
            key={`demo-row-${row.slug}`}
          >
            {`> ${row.name} | ${row.score} | ${
              row.verified ? "✓" : "~"
            } | ${row.install}`}
          </p>
        ))}
        {showTopMatches ? (
          <p className="terminal-line terminal-note terminal-fade-in">{`${topRows.length} top matches`}</p>
        ) : null}
        {showBestWorkflow ? (
          <p className="terminal-line terminal-note terminal-fade-in">{`best workflow: ${workflowName} (${workflowStepCount} steps, ~${workflowEstimate} min)`}</p>
        ) : null}
        {showChain ? (
          <p className="terminal-line terminal-note terminal-fade-in">{`chain: ${workflowChain}`}</p>
        ) : null}
        {showNextStep ? (
          <p className="terminal-line terminal-note terminal-fade-in">{`next: clime workflow "${workflowQuery}"`}</p>
        ) : null}
      </div>
    </div>
  );
}
