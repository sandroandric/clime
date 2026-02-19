import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { ApiError } from "./errors.js";

declare module "fastify" {
  interface FastifyRequest {
    apiKey?: string;
    isAdmin?: boolean;
  }
}

interface RateWindow {
  count: number;
  windowStart: number;
}

function pruneRateWindows(
  windows: Map<string, RateWindow>,
  now: number,
  windowMs: number,
  maxKeys: number
) {
  for (const [key, value] of windows.entries()) {
    if (now - value.windowStart >= windowMs) {
      windows.delete(key);
    }
  }

  if (windows.size <= maxKeys) {
    return;
  }

  const overflow = windows.size - maxKeys;
  const oldest = [...windows.entries()]
    .sort((a, b) => a[1].windowStart - b[1].windowStart)
    .slice(0, overflow);
  for (const [key] of oldest) {
    windows.delete(key);
  }
}

export function registerAuthHooks(app: FastifyInstance) {
  const fallbackKey = process.env.NODE_ENV === "production" ? "" : "dev-local-key";
  const configuredKeys = process.env.CLIME_API_KEYS ?? process.env.API_SECRET_KEY ?? fallbackKey;
  const configuredAdminKeys =
    process.env.CLIME_ADMIN_KEYS ??
    (process.env.NODE_ENV === "production" ? "" : configuredKeys);
  const requireRegisteredKeys = process.env.CLIME_REQUIRE_REGISTERED_API_KEYS === "true";
  const validKeys = new Set(
    configuredKeys
      .split(",")
      .map((key) => key.trim())
      .filter(Boolean)
  );
  const adminKeys = new Set(
    configuredAdminKeys
      .split(",")
      .map((key) => key.trim())
      .filter(Boolean)
  );
  const validKeyDigests = [...validKeys].map((key) => createHash("sha256").update(key).digest());
  const adminKeyDigests = [...adminKeys].map((key) => createHash("sha256").update(key).digest());
  const limitPerMinute = Number(process.env.CLIME_RATE_LIMIT_PER_MINUTE ?? 240);
  const searchLimitPerMinute = Number(process.env.CLIME_SEARCH_RATE_LIMIT_PER_MINUTE ?? 60);
  const reportLimitPerHour = Number(process.env.CLIME_REPORT_LIMIT_PER_HOUR ?? 10);
  const maxRateKeys = Math.max(
    100,
    Number(process.env.CLIME_RATE_LIMIT_MAX_KEYS ?? 20000)
  );
  const pruneIntervalMs = Math.max(
    30_000,
    Number(process.env.CLIME_RATE_LIMIT_PRUNE_INTERVAL_MS ?? 60_000)
  );
  const windows = new Map<string, RateWindow>();
  const searchWindows = new Map<string, RateWindow>();
  const reportWindows = new Map<string, RateWindow>();
  let lastPrunedAt = 0;

  app.addHook("preHandler", async (request) => {
    const path = request.url.split("?")[0];
    if (!path.startsWith("/v1")) {
      return;
    }

    if (validKeys.size === 0 && requireRegisteredKeys) {
      throw new ApiError(
        "API_AUTH_NOT_CONFIGURED",
        "No API keys are configured. Set CLIME_API_KEYS or API_SECRET_KEY.",
        500
      );
    }

    const apiKey = request.headers["x-api-key"];
    const normalized = Array.isArray(apiKey) ? apiKey[0] : apiKey;

    if (!normalized) {
      throw new ApiError("API_KEY_REQUIRED", "API key is required", 401);
    }

    let isRegistered = false;
    const normalizedDigest = createHash("sha256").update(normalized).digest();
    for (const keyDigest of validKeyDigests) {
      const matches = timingSafeEqual(normalizedDigest, keyDigest);
      isRegistered = isRegistered || matches;
    }
    if (!isRegistered && requireRegisteredKeys) {
      throw new ApiError("API_KEY_INVALID", "Invalid API key", 403);
    }
    let isAdmin = false;
    for (const keyDigest of adminKeyDigests) {
      const matches = timingSafeEqual(normalizedDigest, keyDigest);
      isAdmin = isAdmin || matches;
    }

    const now = Date.now();
    if (now - lastPrunedAt >= pruneIntervalMs) {
      pruneRateWindows(windows, now, 60_000, maxRateKeys);
      pruneRateWindows(searchWindows, now, 60_000, maxRateKeys);
      pruneRateWindows(reportWindows, now, 3_600_000, maxRateKeys);
      lastPrunedAt = now;
    }

    const existing = windows.get(normalized);
    if (!existing || now - existing.windowStart >= 60_000) {
      windows.set(normalized, { count: 1, windowStart: now });
    } else {
      existing.count += 1;
      if (limitPerMinute > 0 && existing.count > limitPerMinute) {
        throw new ApiError("RATE_LIMITED", "Too many requests for this API key", 429, {
          retry_after_seconds: 60
        });
      }
    }

    const isSearchEndpoint =
      request.method === "POST" &&
      (path === "/v1/search" || path === "/v1/discover");
    if (isSearchEndpoint) {
      const searchWindow = searchWindows.get(normalized);
      if (!searchWindow || now - searchWindow.windowStart >= 60_000) {
        searchWindows.set(normalized, { count: 1, windowStart: now });
      } else {
        searchWindow.count += 1;
        if (searchLimitPerMinute > 0 && searchWindow.count > searchLimitPerMinute) {
          throw new ApiError("SEARCH_RATE_LIMITED", "Too many search requests for this API key", 429, {
            retry_after_seconds: 60
          });
        }
      }
    }

    if (request.method === "POST" && /^\/v1\/clis\/[^/]+\/report$/.test(path)) {
      const reportWindow = reportWindows.get(normalized);
      if (!reportWindow || now - reportWindow.windowStart >= 3_600_000) {
        reportWindows.set(normalized, { count: 1, windowStart: now });
      } else {
        reportWindow.count += 1;
        if (reportLimitPerHour > 0 && reportWindow.count > reportLimitPerHour) {
          throw new ApiError("REPORT_RATE_LIMITED", "Too many report events for this API key", 429, {
            retry_after_seconds: 3600
          });
        }
      }
    }

    request.apiKey = normalized;
    request.isAdmin = isAdmin;
  });
}
