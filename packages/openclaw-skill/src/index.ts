#!/usr/bin/env node

import { platform } from "node:os";
import type { CliProfile, SearchResult, InstallInstruction, AuthGuide, CommandEntry } from "@cli-me/shared-types";

const DEFAULT_API_URL = process.env.CLIME_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "https://api.clime.sh";
const DEFAULT_API_KEY = process.env.CLIME_API_KEY ?? process.env.API_SECRET_KEY ?? "dev-local-key";

interface ApiEnvelope<T> {
  ok: boolean;
  data: T;
  error?: {
    code: string;
    message: string;
  };
}

function normalizeOs(value: string) {
  if (value === "darwin") {
    return "macos";
  }
  if (value === "win32") {
    return "windows";
  }
  if (value === "linux") {
    return "linux";
  }
  return "any";
}

async function apiRequest<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${DEFAULT_API_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-api-key": DEFAULT_API_KEY,
      ...(init.headers ?? {})
    }
  });

  const payload = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error?.message ?? `Request failed (${response.status})`);
  }

  return payload.data;
}

async function discoverTask(task: string, limit: number) {
  const results = await apiRequest<SearchResult[]>("/v1/discover", {
    method: "POST",
    body: JSON.stringify({ query: task, limit })
  });

  const recommendations = await Promise.all(
    results.slice(0, limit).map(async (entry) => {
      const slug = entry.cli.slug;
      const os = normalizeOs(platform());
      const [profile, install, auth, commands] = await Promise.all([
        apiRequest<CliProfile>(`/v1/clis/${slug}`),
        apiRequest<InstallInstruction[]>(
          `/v1/clis/${slug}/install?os=${encodeURIComponent(os)}`
        ),
        apiRequest<AuthGuide>(
          `/v1/clis/${slug}/auth`
        ),
        apiRequest<CommandEntry[]>(`/v1/clis/${slug}/commands`)
      ]);

      return {
        slug,
        name: entry.cli.name,
        score: Number(entry.score.toFixed(3)),
        reason: entry.reason,
        install: install[0] ?? null,
        auth: {
          type: auth.auth_type,
          steps: auth.setup_steps.slice(0, 4)
        },
        top_commands: commands
          .filter((command: CommandEntry) =>
            entry.top_matching_commands.length > 0
              ? entry.top_matching_commands.includes(command.command)
              : true
          )
          .slice(0, 6)
          .map((command: CommandEntry) => ({
            command: command.command,
            description: command.description,
            workflow_context: command.workflow_context
          })),
        trust_score: profile.identity.trust_score,
        compatibility: profile.identity.compatibility
      };
    })
  );

  return {
    task,
    api_url: DEFAULT_API_URL,
    recommendations
  };
}

function parseArguments(argv: string[]) {
  const args = argv.slice(2);
  let task = "";
  let limit = 5;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--task" && args[i + 1]) {
      task = args[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (arg === "--limit" && args[i + 1]) {
      limit = Number(args[i + 1] ?? "5");
      i += 1;
      continue;
    }
    if (!arg.startsWith("-") && !task) {
      task = arg;
    }
  }

  return {
    task: task.trim(),
    limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 10) : 5
  };
}

async function run() {
  const { task, limit } = parseArguments(process.argv);
  if (!task) {
    throw new Error("Usage: clime-openclaw-skill --task \"deploy next.js app\" [--limit 5]");
  }

  const payload = await discoverTask(task, limit);
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  process.stderr.write(
    `${JSON.stringify(
      {
        ok: false,
        error: {
          code: "OPENCLAW_SKILL_ERROR",
          message
        }
      },
      null,
      2
    )}\n`
  );
  process.exit(1);
});
