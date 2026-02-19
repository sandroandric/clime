import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

type CacheEnvelope = {
  version: 1;
  entries: Record<
    string,
    {
      expires_at: number;
      data: unknown;
    }
  >;
};

const CACHE_PATH = join(homedir(), ".clime", "cache.json");
const CACHE_VERSION = 1;

function readCache(): CacheEnvelope {
  try {
    const parsed = JSON.parse(readFileSync(CACHE_PATH, "utf-8")) as CacheEnvelope;
    if (parsed.version !== CACHE_VERSION || typeof parsed.entries !== "object" || !parsed.entries) {
      return { version: CACHE_VERSION, entries: {} };
    }
    return parsed;
  } catch {
    return { version: CACHE_VERSION, entries: {} };
  }
}

function writeCache(cache: CacheEnvelope) {
  mkdirSync(dirname(CACHE_PATH), { recursive: true });
  const tmpPath = `${CACHE_PATH}.${randomBytes(4).toString("hex")}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(cache, null, 2));
  renameSync(tmpPath, CACHE_PATH);
}

export function getCachedResponse<T>(key: string): T | undefined {
  const cache = readCache();
  const now = Date.now();
  const hit = cache.entries[key];
  if (!hit) {
    return undefined;
  }
  if (hit.expires_at <= now) {
    delete cache.entries[key];
    writeCache(cache);
    return undefined;
  }
  return hit.data as T;
}

export function setCachedResponse(key: string, data: unknown, ttlSeconds: number) {
  const ttlMs = Math.max(1, ttlSeconds) * 1000;
  const cache = readCache();
  cache.entries[key] = {
    expires_at: Date.now() + ttlMs,
    data
  };

  // Keep cache bounded to avoid unbounded growth in terminal environments.
  const entries = Object.entries(cache.entries).sort(
    (a, b) => b[1].expires_at - a[1].expires_at
  );
  if (entries.length > 300) {
    cache.entries = Object.fromEntries(entries.slice(0, 300));
  }

  writeCache(cache);
}

export function getCachePath() {
  return CACHE_PATH;
}
