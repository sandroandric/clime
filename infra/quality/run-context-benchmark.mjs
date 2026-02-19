import fs from "node:fs/promises";
import path from "node:path";

const apiBaseUrl = process.env.CLIME_BENCHMARK_API_BASE_URL ?? "https://api.clime.sh";
const apiKey = process.env.CLIME_BENCHMARK_API_KEY ?? "dev-local-key";

const querySet = [
  "deploy next.js app",
  "set up postgres database",
  "configure stripe payments",
  "add authentication to saas app",
  "set up monitoring and alerts",
  "deploy static site with cdn",
  "run kubernetes rollout",
  "trigger ci pipeline",
  "process background jobs",
  "provision terraform stack"
];

const benchmarkToolCounts = [10, 25, 50, 100, 200, 500, 1000];

function estimateTokens(value) {
  const bytes = Buffer.byteLength(value, "utf8");
  return Math.ceil(bytes / 4);
}

function tokenize(value) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2);
}

function lexicalScore(tool, query) {
  const queryTerms = tokenize(query);
  const haystack = `${tool.name} ${tool.description} ${tool.tags.join(" ")} ${tool.commands.join(" ")}`.toLowerCase();
  let score = 0;
  for (const term of queryTerms) {
    if (haystack.includes(term)) {
      score += 1;
    }
  }
  return score;
}

function simulateLinearScan(tools, query, limit = 5) {
  return tools
    .map((tool) => ({
      tool,
      score: lexicalScore(tool, query)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

async function apiRequest(pathname, init = {}) {
  const response = await fetch(`${apiBaseUrl}${pathname}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      ...(init.headers ?? {})
    }
  });
  if (!response.ok) {
    throw new Error(`API request failed (${response.status}) for ${pathname}`);
  }
  const payload = await response.json();
  if (!payload.ok) {
    throw new Error(`API payload failed for ${pathname}`);
  }
  return payload.data;
}

function toMcpTool(cli) {
  return {
    name: cli.identity.slug,
    description: cli.identity.description,
    tags: cli.identity.category_tags,
    auth_type: cli.auth.auth_type,
    install: cli.install[0]?.command ?? "",
    commands: cli.commands.slice(0, 6).map((command) => command.command)
  };
}

function buildOnPayload(tools, query) {
  return JSON.stringify({
    system:
      "Agent has one custom tool wrapper per CLI. Select relevant wrappers and execute task safely.",
    tools,
    task: query
  });
}

function buildO1Payload(query) {
  return JSON.stringify({
    system: "Agent uses one registry tool (`clime`) for CLI discovery and execution planning.",
    tools: [
      {
        name: "clime.search",
        input: {
          query: "natural language task",
          limit: 5
        },
        output: ["slug", "name", "score", "install_command", "auth_guide", "top_matching_commands"]
      }
    ],
    task: query
  });
}

function average(values) {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function main() {
  const clis = await apiRequest("/v1/clis");
  if (!Array.isArray(clis) || clis.length === 0) {
    throw new Error("No CLIs returned from API");
  }

  const toolUniverse = clis.map(toMcpTool);
  const distinctToolCounts = [...new Set([...benchmarkToolCounts, toolUniverse.length])]
    .filter((count) => count <= toolUniverse.length)
    .sort((a, b) => a - b);

  const o1Payload = buildO1Payload(querySet[0]);
  const o1ContextBytes = Buffer.byteLength(o1Payload, "utf8");
  const o1EstimatedTokens = estimateTokens(o1Payload);

  const rows = distinctToolCounts.map((toolCount) => {
    const onPayload = buildOnPayload(toolUniverse.slice(0, toolCount), querySet[0]);
    const onContextBytes = Buffer.byteLength(onPayload, "utf8");
    const onEstimatedTokens = estimateTokens(onPayload);

    return {
      tool_count: toolCount,
      o_n_context_bytes: onContextBytes,
      o_n_estimated_tokens: onEstimatedTokens,
      o_1_context_bytes: o1ContextBytes,
      o_1_estimated_tokens: o1EstimatedTokens,
      token_ratio_o_n_to_o_1: Number((onEstimatedTokens / o1EstimatedTokens).toFixed(2)),
      context_reduction_percent_using_o_1: Number(
        (((onEstimatedTokens - o1EstimatedTokens) / onEstimatedTokens) * 100).toFixed(2)
      )
    };
  });

  const scanLatencyByCount = {};
  for (const toolCount of distinctToolCounts) {
    const candidateTools = toolUniverse.slice(0, toolCount);
    const iterationsPerQuery = 40;
    const samples = [];
    for (const query of querySet) {
      const started = process.hrtime.bigint();
      for (let index = 0; index < iterationsPerQuery; index += 1) {
        simulateLinearScan(candidateTools, query, 5);
      }
      const elapsedNs = process.hrtime.bigint() - started;
      samples.push(Number(elapsedNs) / 1_000_000 / iterationsPerQuery);
    }
    scanLatencyByCount[toolCount] = Number(average(samples).toFixed(4));
  }

  const discoverLatencies = [];
  for (const query of querySet) {
    const started = process.hrtime.bigint();
    await apiRequest("/v1/discover", {
      method: "POST",
      body: JSON.stringify({ query, limit: 5 })
    });
    const elapsedNs = process.hrtime.bigint() - started;
    discoverLatencies.push(Number(elapsedNs) / 1_000_000);
  }

  const artifact = {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    cli_count: toolUniverse.length,
    query_set: querySet,
    methodology: {
      o_1_definition: "Single registry tool context (`clime.search`) regardless of catalog size.",
      o_n_definition: "One wrapper tool per CLI provided directly to the agent context.",
      token_estimation: "Estimated tokens = UTF-8 bytes / 4 (rounded up).",
      latency_notes:
        "O(1) latency measured from live /v1/discover API calls. O(n) latency measured as local linear scan over in-context tool wrappers."
    },
    baseline_o_1: {
      context_bytes: o1ContextBytes,
      estimated_tokens: o1EstimatedTokens
    },
    comparisons: rows.map((row) => ({
      ...row,
      o_n_linear_scan_ms: scanLatencyByCount[row.tool_count] ?? null
    })),
    o_1_live_discover_latency_ms: {
      average: Number(average(discoverLatencies).toFixed(2)),
      p95: Number(
        [...discoverLatencies]
          .sort((a, b) => a - b)
          [Math.max(0, Math.floor(discoverLatencies.length * 0.95) - 1)]?.toFixed(2) ?? "0"
      )
    }
  };

  const outDir = path.join(process.cwd(), "infra", "generated");
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "context-benchmark.json");
  await fs.writeFile(outPath, JSON.stringify(artifact, null, 2));
  const webDataDir = path.join(process.cwd(), "apps", "web", "data");
  await fs.mkdir(webDataDir, { recursive: true });
  await fs.writeFile(path.join(webDataDir, "context-benchmark.json"), JSON.stringify(artifact, null, 2));

  const csvHeader = [
    "tool_count",
    "o_n_estimated_tokens",
    "o_1_estimated_tokens",
    "token_ratio_o_n_to_o_1",
    "context_reduction_percent_using_o_1",
    "o_n_linear_scan_ms"
  ];
  const csvRows = artifact.comparisons.map((row) =>
    [
      row.tool_count,
      row.o_n_estimated_tokens,
      row.o_1_estimated_tokens,
      row.token_ratio_o_n_to_o_1,
      row.context_reduction_percent_using_o_1,
      row.o_n_linear_scan_ms
    ].join(",")
  );
  await fs.writeFile(path.join(outDir, "context-benchmark.csv"), [csvHeader.join(","), ...csvRows].join("\n"));

  console.log(`Benchmark artifact written: ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
