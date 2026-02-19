#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_URL = process.env.CLIME_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "https://api.clime.sh";
const API_KEY = process.env.CLIME_API_KEY ?? process.env.API_SECRET_KEY ?? "dev-local-key";

interface ApiEnvelope<T> {
  ok: boolean;
  data: T;
  error?: {
    code: string;
    message: string;
  };
}

async function request<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-api-key": API_KEY,
      ...(init.headers ?? {})
    }
  });

  const payload = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error?.message ?? `Request failed (${response.status})`);
  }
  return payload.data;
}

function asToolOutput(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2)
      }
    ]
  };
}

const server = new McpServer({
  name: "clime-mcp",
  version: "0.1.0"
});

server.tool(
  "search_cli",
  {
    query: z.string().min(3),
    limit: z.number().int().positive().max(25).optional()
  },
  async ({ query, limit }) => {
    const data = await request("/v1/discover", {
      method: "POST",
      body: JSON.stringify({ query, limit: limit ?? 10 })
    });
    return asToolOutput(data);
  }
);

server.tool(
  "get_cli_info",
  {
    slug: z.string().min(1)
  },
  async ({ slug }) => {
    const data = await request(`/v1/clis/${encodeURIComponent(slug)}`);
    return asToolOutput(data);
  }
);

server.tool(
  "get_install_command",
  {
    slug: z.string().min(1),
    os: z.enum(["macos", "linux", "windows", "any"]).optional(),
    package_manager: z.string().optional()
  },
  async ({ slug, os, package_manager }) => {
    const params = new URLSearchParams();
    if (os) {
      params.set("os", os);
    }
    if (package_manager) {
      params.set("package_manager", package_manager);
    }
    const query = params.size > 0 ? `?${params.toString()}` : "";
    const data = await request(`/v1/clis/${encodeURIComponent(slug)}/install${query}`);
    return asToolOutput(data);
  }
);

server.tool(
  "get_auth_guide",
  {
    slug: z.string().min(1)
  },
  async ({ slug }) => {
    const data = await request(`/v1/clis/${encodeURIComponent(slug)}/auth`);
    return asToolOutput(data);
  }
);

server.tool(
  "get_commands",
  {
    slug: z.string().min(1),
    workflow: z.string().optional()
  },
  async ({ slug, workflow }) => {
    const query = workflow ? `?workflow=${encodeURIComponent(workflow)}` : "";
    const data = await request(`/v1/clis/${encodeURIComponent(slug)}/commands${query}`);
    return asToolOutput(data);
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown MCP server error";
  process.stderr.write(`[clime-mcp] ${message}\n`);
  process.exit(1);
});
