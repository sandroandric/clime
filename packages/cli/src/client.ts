import type {
  CliProfile,
  ApiKeyCreateResponse,
  ApiKeyUsageSummary,
  RankingType,
  ReportPayload,
  SearchResult,
  WorkflowChain,
  CommunitySubmission,
  SubmissionRequest
} from "@cli-me/shared-types";
import { createHash } from "node:crypto";
import { CliError } from "./errors.js";
import { getCachedResponse, setCachedResponse } from "./cache.js";

export const DEFAULT_API_BASE_URL = "https://api.clime.sh";

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    request_id?: string;
  };
}

export class ClimeApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly options: { disableCache?: boolean; cacheTtlSeconds?: number } = {}
  ) {}

  private cacheKey(path: string, init: RequestInit) {
    const method = (init.method ?? "GET").toUpperCase();
    const body =
      typeof init.body === "string"
        ? init.body
        : init.body
          ? JSON.stringify(init.body)
          : "";
    const keyPrefix = this.apiKey
      ? createHash("sha256").update(this.apiKey).digest("hex").slice(0, 16)
      : "nokey";
    return `${keyPrefix}:${method}:${this.baseUrl}${path}:${body}`;
  }

  private shouldCache(path: string, init: RequestInit) {
    const method = (init.method ?? "GET").toUpperCase();
    if (method === "GET") {
      return (
        path.startsWith("/v1/clis/") ||
        path.startsWith("/v1/workflows") ||
        path.startsWith("/v1/rankings") ||
        path.startsWith("/v1/changes/feed")
      );
    }

    if (method === "POST") {
      return path === "/v1/search" || path === "/v1/discover" || path === "/v1/workflows/search";
    }

    return false;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const useCache = !this.options.disableCache && this.shouldCache(path, init);
    const cacheKey = useCache ? this.cacheKey(path, init) : undefined;

    if (useCache && cacheKey) {
      const cached = getCachedResponse<T>(cacheKey);
      if (cached !== undefined) {
        return cached;
      }
    }

    let response: Response;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        response = await fetch(`${this.baseUrl}${path}`, {
          ...init,
          headers: {
            "content-type": "application/json",
            "x-api-key": this.apiKey,
            ...(init.headers ?? {})
          },
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to reach clime API";
      throw new CliError("NETWORK_ERROR", message, 2, {
        base_url: this.baseUrl,
        retry_after_seconds: 3
      });
    }

    let payload: ApiEnvelope<T>;
    try {
      payload = (await response.json()) as ApiEnvelope<T>;
    } catch {
      throw new CliError("INVALID_RESPONSE", "API returned non-JSON payload", 2);
    }

    if (!response.ok || !payload.ok) {
      const code = payload.error?.code ?? "API_ERROR";
      const message = payload.error?.message ?? `API request failed (${response.status})`;
      if (response.status >= 500) {
        throw new CliError("API_UNAVAILABLE", message, 2, {
          status_code: response.status,
          retry_after_seconds: 3
        });
      }
      throw new CliError(code, message, response.status === 401 ? 4 : 2, payload.error?.details);
    }

    const data = payload.data as T;
    if (useCache && cacheKey) {
      setCachedResponse(cacheKey, data, this.options.cacheTtlSeconds ?? 180);
    }
    return data;
  }

  search(query: string, limit = 10) {
    return this.discover(query, limit);
  }

  async discover(query: string, limit = 10) {
    try {
      return await this.request<SearchResult[]>("/v1/discover", {
        method: "POST",
        body: JSON.stringify({ query, limit })
      });
    } catch (error) {
      if (
        error instanceof CliError &&
        (error.code === "API_ERROR" || error.code === "INTERNAL_ERROR" || error.code === "NOT_FOUND")
      ) {
        return this.request<SearchResult[]>("/v1/search", {
          method: "POST",
          body: JSON.stringify({ query, limit })
        });
      }
      throw error;
    }
  }

  info(slug: string) {
    return this.request(`/v1/clis/${slug}`);
  }

  list() {
    return this.request<CliProfile[]>("/v1/clis");
  }

  install(slug: string, options: { os?: string; packageManager?: string }) {
    const params = new URLSearchParams();
    if (options.os) {
      params.set("os", options.os);
    }
    if (options.packageManager) {
      params.set("package_manager", options.packageManager);
    }
    const query = params.size > 0 ? `?${params.toString()}` : "";
    return this.request(`/v1/clis/${slug}/install${query}`);
  }

  commands(slug: string, workflow?: string) {
    const query = workflow ? `?workflow=${encodeURIComponent(workflow)}` : "";
    return this.request(`/v1/clis/${slug}/commands${query}`);
  }

  auth(slug: string) {
    return this.request(`/v1/clis/${slug}/auth`);
  }

  report(slug: string, payload: ReportPayload) {
    return this.request(`/v1/clis/${slug}/report`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  workflowSearch(query: string, limit = 10) {
    return this.request<WorkflowChain[]>("/v1/workflows/search", {
      method: "POST",
      body: JSON.stringify({ query, limit })
    });
  }

  workflowById(id: string) {
    return this.request<WorkflowChain>(`/v1/workflows/${encodeURIComponent(id)}`);
  }

  rankings(type: RankingType) {
    return this.request(`/v1/rankings?type=${encodeURIComponent(type)}`);
  }

  changeFeed(since?: string) {
    const query = since ? `?since=${encodeURIComponent(since)}` : "";
    return this.request(`/v1/changes/feed${query}`);
  }

  submit(payload: SubmissionRequest) {
    return this.request<CommunitySubmission>("/v1/submissions", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  claim(payload: {
    cli_slug: string;
    publisher_name: string;
    domain: string;
    evidence: string;
    verification_method?: "dns_txt" | "repo_file";
    repository_url?: string;
  }) {
    return this.request("/v1/publishers/claim", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  createApiKey(payload: { owner_type?: "developer" | "agent" | "publisher"; owner_id?: string; label?: string }) {
    return this.request<ApiKeyCreateResponse>("/v1/api-keys/create", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  usageByKey(apiKey: string) {
    return this.request<ApiKeyUsageSummary>(`/v1/usage/by-key?api_key=${encodeURIComponent(apiKey)}`);
  }
}
