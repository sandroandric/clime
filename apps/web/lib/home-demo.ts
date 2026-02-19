import type { SearchResult, UsageEvent, WorkflowChain } from "@cli-me/shared-types";

const baseUrl =
  process.env.CLIME_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000";
const apiKey = process.env.CLIME_WEB_API_KEY ?? process.env.API_SECRET_KEY ?? "dev-local-key";

const FALLBACK_DEMO_QUERIES = [
  "deploy next.js app",
  "set up postgres database",
  "configure stripe payments",
  "ship static site with cdn",
  "monitor production errors",
  "set up auth for a saas app",
  "deploy a node api with postgres",
  "add transactional email to backend"
];

export type HomeDemoSource = "live" | "fallback";
export type HomeDemoUsageSource = "live" | "fallback";

export type HomeDemoSnapshot = {
  query: string;
  rows: Array<{
    slug: string;
    name: string;
    score: string;
    verified: boolean;
    install: string;
  }>;
  workflow: {
    title: string;
    estimated_minutes: number;
    steps: Array<{
      step_number: number;
      cli_slug: string;
      purpose: string;
    }>;
  } | null;
  generated_at: string;
  source: HomeDemoSource;
  usage_source: HomeDemoUsageSource;
  degraded: boolean;
  fallback_reason?: string;
};

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      ...(init.headers ?? {})
    },
    cache: "no-store"
  });

  const payload = (await response.json()) as {
    ok: boolean;
    data?: T;
    error?: { message?: string };
  };

  if (!response.ok || !payload.ok || payload.data === undefined) {
    throw new Error(payload.error?.message ?? `API error (${response.status})`);
  }
  return payload.data;
}

function pickDemoQuery(events: UsageEvent[], nowMs: number) {
  const candidateQueries: string[] = [];
  for (const event of events) {
    const isDiscovery =
      event.endpoint.includes("/search") || event.endpoint.includes("/discover");
    const query = event.query?.trim();
    if (isDiscovery && query && query.length >= 3) {
      candidateQueries.push(query);
    }
  }

  const deduped = [...new Set(candidateQueries)];
  const merged = [...deduped];
  for (const fallback of FALLBACK_DEMO_QUERIES) {
    if (!merged.includes(fallback)) {
      merged.push(fallback);
    }
  }

  if (deduped.length > 0 && merged.length > 0) {
    const index = Math.floor(nowMs / 8_000) % merged.length;
    return merged[index];
  }

  return FALLBACK_DEMO_QUERIES[0];
}

function chooseWorkflow(
  candidates: WorkflowChain[],
  fallback: WorkflowChain[]
): WorkflowChain | null {
  const primary = candidates.find((workflow) => workflow.steps.length >= 3);
  if (primary) {
    return primary;
  }
  const fallbackPrimary =
    fallback.find((workflow) => workflow.slug === "full-stack-saas") ??
    fallback.find((workflow) => workflow.steps.length >= 3);
  return fallbackPrimary ?? null;
}

export async function fetchHomeDemoSnapshot(): Promise<HomeDemoSnapshot> {
  const nowMs = Date.now();
  let usageEvents: UsageEvent[] = [];
  let usageSource: HomeDemoUsageSource = "live";
  let usageFallbackReason: string | undefined;
  try {
    usageEvents = await apiRequest<UsageEvent[]>("/v1/usage");
  } catch {
    usageEvents = [];
    usageSource = "fallback";
    usageFallbackReason = "usage endpoint unavailable";
  }

  const query = pickDemoQuery(usageEvents, nowMs);

  let searchRows: SearchResult[] = [];
  let workflowCandidates: WorkflowChain[] = [];
  let fallbackWorkflow: WorkflowChain[] = [];
  try {
    [searchRows, workflowCandidates, fallbackWorkflow] = await Promise.all([
      apiRequest<SearchResult[]>("/v1/discover", {
        method: "POST",
        body: JSON.stringify({ query, limit: 3 })
      }),
      apiRequest<WorkflowChain[]>("/v1/workflows/search", {
        method: "POST",
        body: JSON.stringify({ query, limit: 3 })
      }),
      apiRequest<WorkflowChain[]>("/v1/workflows/search", {
        method: "POST",
        body: JSON.stringify({ query: "full-stack saas", limit: 1 })
      })
    ]);
  } catch {
    return {
      query,
      rows: [
        {
          slug: "vercel",
          name: "Vercel CLI",
          score: "0.94",
          verified: true,
          install: "npm i -g vercel"
        },
        {
          slug: "supabase",
          name: "Supabase CLI",
          score: "0.89",
          verified: true,
          install: "npm i -g supabase"
        },
        {
          slug: "stripe",
          name: "Stripe CLI",
          score: "0.84",
          verified: true,
          install: "brew install stripe-cli"
        }
      ],
      workflow: {
        title: "Full-Stack SaaS",
        estimated_minutes: 45,
        steps: [
          { step_number: 1, cli_slug: "vercel", purpose: "Deploy frontend and API" },
          { step_number: 2, cli_slug: "supabase", purpose: "Provision database" },
          { step_number: 3, cli_slug: "stripe", purpose: "Configure payments" },
          { step_number: 4, cli_slug: "resend", purpose: "Setup transactional email" },
          { step_number: 5, cli_slug: "auth0", purpose: "Add authentication" }
        ]
      },
      generated_at: new Date().toISOString(),
      source: "fallback",
      usage_source: usageSource,
      degraded: true,
      fallback_reason: usageFallbackReason ?? "discover/workflow endpoints unavailable"
    };
  }

  const workflow = chooseWorkflow(workflowCandidates, fallbackWorkflow);

  return {
    query,
    rows: searchRows.slice(0, 3).map((result) => ({
      slug: result.cli.slug,
      name: result.cli.name,
      score: result.score.toFixed(2),
      verified: result.cli.verification_status === "publisher-verified",
      install: result.install_command ?? "install unavailable"
    })),
    workflow: workflow
      ? {
          title: workflow.title,
          estimated_minutes: workflow.estimated_minutes,
          steps: workflow.steps.slice(0, 5).map((step) => ({
            step_number: step.step_number,
            cli_slug: step.cli_slug,
            purpose: step.purpose
          }))
        }
      : null,
    generated_at: new Date().toISOString(),
    source: "live",
    usage_source: usageSource,
    degraded: usageSource !== "live",
    fallback_reason: usageSource !== "live" ? usageFallbackReason : undefined
  };
}
