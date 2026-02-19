import { afterEach, describe, expect, it, vi } from "vitest";
import { ClimeApiClient } from "../src/client.js";

const originalFetch = global.fetch;

describe("api client", () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("classifies network failures as NETWORK_ERROR", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:4000")) as typeof fetch;
    const client = new ClimeApiClient("http://127.0.0.1:4000", "test-key", {
      disableCache: true
    });

    await expect(client.info("vercel")).rejects.toMatchObject({
      code: "NETWORK_ERROR"
    });
  });

  it("classifies server 5xx failures as API_UNAVAILABLE", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "server busy"
          }
        }),
        {
          status: 503,
          headers: {
            "content-type": "application/json"
          }
        }
      )
    ) as typeof fetch;

    const client = new ClimeApiClient("http://127.0.0.1:4000", "test-key", {
      disableCache: true
    });

    await expect(client.info("vercel")).rejects.toMatchObject({
      code: "API_UNAVAILABLE"
    });
  });
});
