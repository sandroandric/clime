"use client";

import { useMemo, useState } from "react";
import {
  checksumDigest,
  type InstallInstruction
} from "@cli-me/shared-types";
import { CopyButton } from "./copy-button";
import { CopyableCommand } from "./copyable-command";

const OS_ORDER = ["macos", "linux", "windows"] as const;
const OS_LABEL: Record<(typeof OS_ORDER)[number], string> = {
  macos: "macOS",
  linux: "Linux",
  windows: "Windows"
};

function normalizeManager(value: string) {
  const lower = value.trim().toLowerCase();
  if (lower.includes("brew")) {
    return "brew";
  }
  if (lower.includes("apt")) {
    return "apt";
  }
  if (lower.includes("dnf")) {
    return "dnf";
  }
  if (lower.includes("pacman")) {
    return "pacman";
  }
  if (lower.includes("winget")) {
    return "winget";
  }
  if (lower.includes("scoop")) {
    return "scoop";
  }
  if (lower.includes("choco")) {
    return "choco";
  }
  if (lower.includes("pnpm")) {
    return "pnpm";
  }
  if (lower.includes("yarn")) {
    return "yarn";
  }
  if (lower.includes("bun")) {
    return "bun";
  }
  if (lower.includes("npm")) {
    return "npm";
  }
  if (lower.includes("curl")) {
    return "curl";
  }
  return lower;
}

function normalizeChecksumDisplay(value: string | undefined) {
  return checksumDigest(value) ?? "unavailable";
}

export function InstallTabs({ install }: { install: InstallInstruction[] }) {
  const osGroups = useMemo(() => {
    return OS_ORDER.map((os) => {
      const explicit = install.filter((item) => item.os === os);
      const fallbackAny = install.filter((item) => item.os === "any");
      const selected = explicit.length > 0 ? explicit : fallbackAny;

      const map = new Map<string, InstallInstruction[]>();
      for (const item of selected) {
        const key = normalizeManager(item.package_manager);
        map.set(key, [...(map.get(key) ?? []), item]);
      }

      const preferred = [
        "brew",
        "apt",
        "dnf",
        "pacman",
        "npm",
        "pnpm",
        "yarn",
        "bun",
        "curl",
        "winget",
        "scoop",
        "choco"
      ];

      const managerGroups = [...map.entries()]
        .sort((a, b) => {
          const ai = preferred.indexOf(a[0]);
          const bi = preferred.indexOf(b[0]);
          if (ai === -1 && bi === -1) {
            return a[0].localeCompare(b[0]);
          }
          if (ai === -1) {
            return 1;
          }
          if (bi === -1) {
            return -1;
          }
          return ai - bi;
        })
        .map(([key, items]) => ({ key, items }));

      return {
        os,
        label: OS_LABEL[os],
        inheritedFromAny: explicit.length === 0 && fallbackAny.length > 0,
        managerGroups
      };
    }).filter((group) => group.managerGroups.length > 0);
  }, [install]);

  const [activeOs, setActiveOs] = useState<(typeof OS_ORDER)[number] | undefined>(
    osGroups[0]?.os
  );
  const activeGroup = osGroups.find((group) => group.os === activeOs) ?? osGroups[0];
  const currentIndex = osGroups.findIndex((group) => group.os === activeGroup?.os);

  if (!activeGroup) {
    return <p className="page-subtitle">No install instructions are available for this listing.</p>;
  }

  return (
    <div className="grid">
      <div
        className="install-tabs"
        role="tablist"
        aria-label="Operating systems"
        onKeyDown={(event) => {
          if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
            return;
          }
          event.preventDefault();
          const direction = event.key === "ArrowRight" ? 1 : -1;
          const nextIndex = (currentIndex + direction + osGroups.length) % osGroups.length;
          setActiveOs(osGroups[nextIndex]?.os ?? activeGroup.os);
        }}
      >
        {osGroups.map((group) => (
          <button
            key={group.os}
            type="button"
            role="tab"
            aria-selected={activeGroup.os === group.os}
            aria-controls={`install-panel-${group.os}`}
            className={`install-tab${activeGroup.os === group.os ? " active" : ""}`}
            onClick={() => setActiveOs(group.os)}
          >
            {group.label}
          </button>
        ))}
      </div>

      {activeGroup.inheritedFromAny ? (
        <p className="stat-meta">Using cross-platform install guidance for {activeGroup.label}.</p>
      ) : null}

      <div id={`install-panel-${activeGroup.os}`} role="tabpanel" className="grid">
        {activeGroup.managerGroups.map((group) => (
          <div key={`${activeGroup.os}-${group.key}`} className="grid">
            <p className="kicker" style={{ color: "var(--text-tertiary)", marginBottom: 0 }}>
              {group.key}
            </p>
            {group.items.map((instruction, index) => {
              const checksum = normalizeChecksumDisplay(instruction.checksum);
              return (
                <div
                  key={`${instruction.os}-${instruction.package_manager}-${index}`}
                  className="card"
                  style={{ padding: "var(--space-md)" }}
                >
                  <div className="command-copy-row">
                    <CopyableCommand value={instruction.command} />
                    <CopyButton value={instruction.command} />
                  </div>
                  <p className="stat-meta">
                    {checksum === "unavailable"
                      ? "hash: unavailable"
                      : `sha256: ${checksum}`}
                  </p>
                  {instruction.dependencies.length > 0 ? (
                    <p className="stat-meta">Depends on: {instruction.dependencies.join(", ")}</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
