"use client";

import { useMemo, useState } from "react";
import type { RankingSnapshot, RankingType } from "@cli-me/shared-types";
import Link from "next/link";
import { formatRelativeTime } from "../lib/time";

type RankingGroup = {
  key: RankingType;
  title: string;
  snapshot: RankingSnapshot;
};

function formatDelta(entry: RankingSnapshot["entries"][number]) {
  const delta = entry.delta;
  if (delta === undefined) {
    return { label: "--", className: "flat" as const };
  }
  if (Math.abs(delta) < 0.5) {
    return { label: "—", className: "flat" as const };
  }
  if (delta > 0) {
    return { label: `↑ +${delta.toFixed(1)}%`, className: "up" as const };
  }
  return { label: `↓ ${delta.toFixed(1)}%`, className: "down" as const };
}

function trendSource(entry: RankingSnapshot["entries"][number]) {
  const source = entry.metadata?.delta_source;
  if (source === "measured") {
    return { label: "Measured", className: "measured" as const };
  }
  return { label: "Estimated", className: "seeded" as const };
}

function maxScore(snapshot: RankingSnapshot) {
  const max = snapshot.entries.reduce((best, entry) => Math.max(best, entry.score), 0);
  return max > 0 ? max : 1;
}

export function RankingsTabs({ groups }: { groups: RankingGroup[] }) {
  const [activeKey, setActiveKey] = useState<RankingType>(groups[0]?.key ?? "used");

  const activeGroup = useMemo(() => {
    return groups.find((group) => group.key === activeKey) ?? groups[0];
  }, [activeKey, groups]);

  if (!activeGroup) {
    return null;
  }

  const max = maxScore(activeGroup.snapshot);
  const currentIndex = groups.findIndex((group) => group.key === activeKey);

  return (
    <div className="grid">
      <div
        className="tabs"
        role="tablist"
        aria-label="Ranking types"
        onKeyDown={(event) => {
          if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
            return;
          }
          event.preventDefault();
          const direction = event.key === "ArrowRight" ? 1 : -1;
          const nextIndex = (currentIndex + direction + groups.length) % groups.length;
          setActiveKey(groups[nextIndex]?.key ?? groups[0]?.key ?? activeKey);
        }}
      >
        {groups.map((group) => (
          <button
            key={group.key}
            type="button"
            role="tab"
            aria-selected={group.key === activeKey}
            aria-controls={`ranking-panel-${group.key}`}
            className={`tab-btn${group.key === activeKey ? " active" : ""}`}
            onClick={() => setActiveKey(group.key)}
          >
            {group.title}
          </button>
        ))}
      </div>

      <div id={`ranking-panel-${activeGroup.key}`} role="tabpanel" className="ranking-list">
        <div className="ranking-header">
          <div className="ranking-position">#</div>
          <div className="ranking-name">CLI</div>
          <div className="ranking-bar-wrap" aria-hidden="true">
            <div className="ranking-header-bar" />
          </div>
          <div className="ranking-stat">Score</div>
          <div className="ranking-trend">Trend</div>
        </div>

        {activeGroup.snapshot.entries.length === 0 && activeGroup.key === "requested" ? (
          <div className="ranking-row">
            <div className="ranking-name" style={{ flex: 1 }}>
              No unmet-demand signals yet. Know a missing CLI?
            </div>
            <Link href="/submissions" className="copy-button">
              Submit a CLI
            </Link>
          </div>
        ) : null}

        {activeGroup.snapshot.entries.slice(0, 25).map((entry) => {
          const width = Math.max((entry.score / max) * 100, 8);
          const trend = formatDelta(entry);
          const source = trendSource(entry);
          const isRequested = activeGroup.key === "requested";

          if (isRequested) {
            const lastSeen =
              typeof entry.metadata.last_seen === "string"
                ? formatRelativeTime(entry.metadata.last_seen)
                : "--";

            return (
              <div
                key={`${activeGroup.key}-${entry.id}`}
                className="ranking-row"
              >
                <div className="ranking-position">{entry.rank}</div>
                <div className="ranking-name">{entry.label}</div>
                <div className="ranking-bar-wrap">
                  <div className="ranking-bar" style={{ width: `${width}%` }} aria-label={`Score: ${entry.score.toFixed(1)}`} />
                </div>
                <div className="ranking-stat">{entry.score.toFixed(1)}</div>
                <div className="ranking-trend flat">{lastSeen}</div>
              </div>
            );
          }

          return (
            <Link
              key={`${activeGroup.key}-${entry.id}`}
              href={`/cli/${entry.id}`}
              className="ranking-row ranking-row-link"
            >
              <div className="ranking-position">{entry.rank}</div>
              <div className="ranking-name">{entry.label}</div>
              <div className="ranking-bar-wrap">
                <div className="ranking-bar" style={{ width: `${width}%` }} aria-label={`Score: ${entry.score.toFixed(1)}`} />
              </div>
              <div className="ranking-stat">{entry.score.toFixed(1)}</div>
              <div className="ranking-trend-group">
                <div className={`ranking-trend ${trend.className}`}>{trend.label}</div>
                <div
                  className={`ranking-source ${source.className}`}
                  title={
                    source.className === "measured"
                      ? "Calculated from recent report volume."
                      : "Seeded estimate due to low recent report volume."
                  }
                >
                  {source.label}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
