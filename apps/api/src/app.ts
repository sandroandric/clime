import Fastify from "fastify";
import cors from "@fastify/cors";
import { ApiError, errorEnvelope } from "./lib/errors.js";
import { registerAuthHooks } from "./lib/auth.js";
import { registerV1Routes } from "./routes/v1.js";
import { createSeedData } from "./data/seed.js";
import { RegistryStore } from "./lib/store.js";
import { PostgresPersistence } from "./lib/persistence.js";
import { InstallChecksumResolver } from "./lib/install-checksum-resolver.js";

function resolveCorsOrigins() {
  const configured = process.env.CLIME_CORS_ORIGINS;
  if (configured && configured.trim().length > 0) {
    return configured
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (process.env.NODE_ENV === "production") {
    return ["https://clime.sh", "https://www.clime.sh"];
  }

  return [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:4000",
    "http://127.0.0.1:4000"
  ];
}

export async function buildApp() {
  const app = Fastify({
    logger:
      process.env.CLIME_API_LOGGER === "true" ||
      process.env.NODE_ENV === "production"
  });
  const persistence = process.env.DATABASE_URL
    ? new PostgresPersistence(process.env.DATABASE_URL)
    : undefined;
  const store = await RegistryStore.create(createSeedData(), persistence);
  const checksumResolutionEnabled =
    process.env.CLIME_INSTALL_CHECKSUM_RESOLUTION !== "false" &&
    process.env.NODE_ENV !== "test";
  const checksumResolver = checksumResolutionEnabled
    ? new InstallChecksumResolver({
        cacheTtlSeconds: Number(process.env.CLIME_CHECKSUM_CACHE_TTL_SECONDS ?? 43_200),
        maxCacheEntries: Number(process.env.CLIME_CHECKSUM_MAX_CACHE_ENTRIES ?? 2000),
        requestTimeoutMs: Number(process.env.CLIME_CHECKSUM_REQUEST_TIMEOUT_MS ?? 10_000),
        maxDownloadBytes: Number(process.env.CLIME_CHECKSUM_MAX_DOWNLOAD_BYTES ?? 80 * 1024 * 1024)
      })
    : undefined;
  const allowedOrigins = new Set(resolveCorsOrigins());

  await app.register(cors, {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    }
  });

  app.addHook("onRequest", async (request) => {
    (request as { startTime?: number }).startTime = Date.now();
  });

  app.addHook("onResponse", async (request, reply) => {
    if (!request.url.startsWith("/v1")) {
      return;
    }

    const startTime = (request as { startTime?: number }).startTime ?? Date.now();
    const latency = Math.max(0, Date.now() - startTime);

    try {
      await store.recordUsage({
        api_key: request.apiKey ?? "anonymous",
        endpoint: request.url.split("?")[0],
        method: request.method,
        status_code: reply.statusCode,
        latency_ms: latency,
        cli_slug: (request as { usageCliSlug?: string }).usageCliSlug,
        query: (request as { usageQuery?: string }).usageQuery,
        metadata: (request as { usageMetadata?: Record<string, string | number | boolean | string[]> }).usageMetadata
      });
    } catch (error) {
      request.log.error({ error }, "failed to persist usage event");
    }
  });

  registerAuthHooks(app);
  registerV1Routes(app, store, checksumResolver);

  app.get("/health", async () => ({ ok: true, status: "healthy" }));

  app.addHook("onClose", async () => {
    if (persistence) {
      await persistence.close();
    }
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      return reply.status(error.statusCode).send(
        errorEnvelope(request, error.code, error.message, error.details)
      );
    }

    request.log.error(error);
    return reply.status(500).send(
      errorEnvelope(request, "INTERNAL_ERROR", "Unexpected error")
    );
  });

  return app;
}
