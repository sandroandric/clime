import type {
  AuthType,
  ChangeFeedEvent,
  CliProfile,
  CliSummary,
  CommunitySubmission,
  PublisherAnalytics,
  PublisherClaim,
  RankingSnapshot,
  RankingType,
  SearchResult,
  UnmetRequest,
  UsageEvent,
  WorkflowChain
} from "@cli-me/shared-types";

const baseUrl =
  process.env.CLIME_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000";
const apiKey = process.env.CLIME_WEB_API_KEY ?? process.env.API_SECRET_KEY ?? "dev-local-key";

export type ApiHealth = {
  ok: boolean;
  status: number | null;
};

function fallbackData<T>(path: string): T {
  if (path.startsWith("/v1/rankings")) {
    const typeParam = /type=([^&]+)/.exec(path)?.[1] ?? "used";
    return {
      type: decodeURIComponent(typeParam),
      generated_at: new Date(0).toISOString(),
      entries: []
    } as T;
  }

  if (path.startsWith("/v1/publishers/analytics/")) {
    const publisher = decodeURIComponent(path.split("/").at(-1) ?? "publisher");
    return {
      publisher,
      publisher_slug: publisher.toLowerCase().replace(/\s+/g, "-"),
      cli_count: 0,
      search_impressions: 0,
      install_attempts: 0,
      command_requests: 0,
      report_count: 0,
      report_failures: 0,
      success_reports: 0,
      top_queries: [],
      top_clis: []
    } as T;
  }

  if (path.startsWith("/v1/clis/")) {
    return {
      identity: {
        slug: "unknown",
        name: "Unavailable",
        publisher: "Unavailable",
        description: "API unavailable during build",
        category_tags: ["unavailable"],
        website: "https://clime.sh",
        repository: "https://github.com/clime-registry/clime",
        verification_status: "auto-indexed",
        latest_version: "n/a",
        last_updated: new Date(0).toISOString(),
        popularity_score: 0,
        trust_score: 0,
        permission_scope: [],
        compatibility: []
      },
      install: [],
      auth: {
        auth_type: "none",
        setup_steps: [],
        environment_variables: [],
        token_refresh: "n/a",
        scopes: []
      },
      commands: []
    } as T;
  }

  if (path.startsWith("/v1/unmet-requests")) {
    return [] as T;
  }

  return [] as T;
}

function normalizeCliSummary(entry: unknown): CliSummary | null {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const raw = entry as Record<string, unknown>;
  const asString = (value: unknown, fallback = ""): string => {
    if (typeof value === "string") {
      return value;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    return fallback;
  };
  const asStringArray = (value: unknown): string[] =>
    Array.isArray(value)
      ? value
          .filter((item) => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
      : [];
  const identity = raw.identity as Record<string, unknown> | undefined;
  if (identity && typeof identity === "object") {
    const install = Array.isArray(raw.install) ? (raw.install as Array<Record<string, unknown>>) : [];
    const auth = (raw.auth as Record<string, unknown> | undefined) ?? {};
    const compatibility = Array.isArray(identity.compatibility)
      ? (identity.compatibility as Array<Record<string, unknown>>)
      : [];
    const compatibilityScore =
      compatibility.length > 0
        ? compatibility.reduce((sum, item) => sum + Number(item.success_rate ?? 0), 0) / compatibility.length
        : 0;
    const commandSignals = Array.isArray(raw.commands)
      ? (raw.commands as Array<Record<string, unknown>>)
          .map((command) => asString(command.command).trim())
          .filter(Boolean)
          .slice(0, 12)
      : [];

    return {
      slug: asString(identity.slug),
      name: asString(identity.name),
      publisher: asString(identity.publisher),
      description: asString(identity.description),
      verification_status: asString(
        identity.verification_status,
        "auto-indexed"
      ) as CliSummary["verification_status"],
      latest_version: asString(identity.latest_version, "unknown"),
      last_updated: asString(identity.last_updated, new Date(0).toISOString()),
      popularity_score: Number(identity.popularity_score ?? 0),
      trust_score: Number(identity.trust_score ?? 0),
      category_tags: asStringArray(identity.category_tags),
      compatibility_score: compatibilityScore,
      auth_type: asString(auth.auth_type, "none") as AuthType,
      install_methods: [
        ...new Set(install.map((item) => asString(item.package_manager).trim()).filter(Boolean))
      ],
      command_signals: commandSignals
    };
  }

  const commandSignals = asStringArray(raw.command_signals);
  const categoryTags = asStringArray(raw.category_tags);
  const installMethods = asStringArray(raw.install_methods);

  return {
    slug: asString(raw.slug),
    name: asString(raw.name),
    publisher: asString(raw.publisher),
    description: asString(raw.description),
    verification_status: asString(
      raw.verification_status,
      "auto-indexed"
    ) as CliSummary["verification_status"],
    latest_version: asString(raw.latest_version, "unknown"),
    last_updated: asString(raw.last_updated, new Date(0).toISOString()),
    popularity_score: Number(raw.popularity_score ?? 0),
    trust_score: Number(raw.trust_score ?? 0),
    category_tags: categoryTags,
    compatibility_score: Number(raw.compatibility_score ?? 0),
    auth_type: asString(raw.auth_type, "none") as AuthType,
    install_methods: installMethods,
    command_signals: commandSignals
  };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        ...(init.headers ?? {})
      },
      next: {
        revalidate: 60
      }
    });

    const payload = (await response.json()) as {
      ok: boolean;
      data: T;
      error?: { code: string; message: string };
    };

    if (!response.ok || !payload.ok) {
      throw new Error(payload.error?.message ?? `API error (${response.status})`);
    }

    return payload.data;
  } catch (error) {
    console.error(`[api] request failed for ${path}:`, error);
    return fallbackData<T>(path);
  }
}

export async function getSearch(query: string, limit = 10) {
  return request<SearchResult[]>("/v1/discover", {
    method: "POST",
    body: JSON.stringify({ query, limit })
  });
}

export async function getCliProfile(slug: string) {
  return request<CliProfile>(`/v1/clis/${slug}`);
}

export async function getCliProfiles() {
  return request<CliProfile[]>("/v1/clis");
}

export async function getCliSummaries() {
  const payload = await request<unknown[]>("/v1/clis?view=summary");
  return payload
    .map((entry) => normalizeCliSummary(entry))
    .filter((entry): entry is CliSummary => Boolean(entry?.slug));
}

export async function getWorkflows() {
  return request<WorkflowChain[]>("/v1/workflows");
}

export async function getWorkflowSearch(query: string, limit = 12) {
  return request<WorkflowChain[]>("/v1/workflows/search", {
    method: "POST",
    body: JSON.stringify({ query, limit })
  });
}

export async function getRanking(type: RankingType) {
  return request<RankingSnapshot>(`/v1/rankings?type=${type}`);
}

export async function getUnmetRequests(limit = 100) {
  return request<UnmetRequest[]>(`/v1/unmet-requests?limit=${limit}`);
}

export async function getChangesFeed() {
  return request<ChangeFeedEvent[]>("/v1/changes/feed");
}

export async function createSubmission(payload: {
  type: "new_cli" | "edit_listing";
  submitter: string;
  target_cli_slug?: string;
  content: Record<string, unknown>;
}) {
  return request<CommunitySubmission>("/v1/submissions", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function getSubmissions() {
  return request<CommunitySubmission[]>("/v1/submissions");
}

export async function getUsageEvents() {
  return request<UsageEvent[]>("/v1/usage");
}

export async function getPublisherClaims() {
  return request<PublisherClaim[]>("/v1/publishers/claims");
}

export async function createPublisherClaim(payload: {
  cli_slug: string;
  publisher_name: string;
  domain: string;
  evidence: string;
  verification_method?: "dns_txt" | "repo_file";
  repository_url?: string;
}) {
  return request<PublisherClaim>("/v1/publishers/claim", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function getPublisherAnalytics() {
  return request<PublisherAnalytics[]>("/v1/publishers/analytics");
}

export async function getPublisherAnalyticsById(id: string) {
  return request<PublisherAnalytics>(`/v1/publishers/analytics/${encodeURIComponent(id)}`);
}

export async function getApiHealth(): Promise<ApiHealth> {
  try {
    const response = await fetch(`${baseUrl}/health`, {
      headers: {
        "x-api-key": apiKey
      },
      next: {
        revalidate: 30
      }
    });
    return {
      ok: response.ok,
      status: response.status
    };
  } catch {
    return {
      ok: false,
      status: null
    };
  }
}
