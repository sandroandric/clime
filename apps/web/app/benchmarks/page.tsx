import fs from "node:fs/promises";
import path from "node:path";
import { CopyableCommand } from "../../components/copyable-command";
import { createPageMetadata } from "../../lib/metadata";
import { formatRelativeTime } from "../../lib/time";

export const revalidate = 3600;
export const metadata = createPageMetadata({
  title: "Context Benchmarks",
  description:
    "Reproducible O(1) vs O(n) context-efficiency benchmark for clime discovery versus per-tool wrapper contexts.",
  path: "/benchmarks"
});

type BenchmarkArtifact = {
  generated_at: string;
  api_base_url: string;
  cli_count: number;
  baseline_o_1: {
    context_bytes: number;
    estimated_tokens: number;
  };
  comparisons: Array<{
    tool_count: number;
    o_n_context_bytes: number;
    o_n_estimated_tokens: number;
    o_1_context_bytes: number;
    o_1_estimated_tokens: number;
    token_ratio_o_n_to_o_1: number;
    context_reduction_percent_using_o_1: number;
    o_n_linear_scan_ms: number;
  }>;
  o_1_live_discover_latency_ms: {
    average: number;
    p95: number;
  };
  methodology: {
    o_1_definition: string;
    o_n_definition: string;
    token_estimation: string;
    latency_notes: string;
  };
};

async function loadBenchmark(): Promise<BenchmarkArtifact | null> {
  const candidates = [
    path.join(process.cwd(), "data", "context-benchmark.json"),
    path.join(process.cwd(), "apps", "web", "data", "context-benchmark.json"),
    path.join(process.cwd(), "infra", "generated", "context-benchmark.json")
  ];

  try {
    const loaded: BenchmarkArtifact[] = [];
    for (const filePath of candidates) {
      try {
        const raw = await fs.readFile(filePath, "utf8");
        loaded.push(JSON.parse(raw) as BenchmarkArtifact);
      } catch {
        // try next candidate path
      }
    }
    if (loaded.length === 0) {
      return null;
    }

    return loaded.sort((a, b) => Date.parse(b.generated_at) - Date.parse(a.generated_at))[0] ?? null;
  } catch {
    return null;
  }
}

export default async function BenchmarksPage() {
  const benchmark = await loadBenchmark();
  const nowMs = Date.now();
  const generatedAtMs = benchmark ? Date.parse(benchmark.generated_at) : NaN;
  const isFresh = Number.isFinite(generatedAtMs) ? nowMs - generatedAtMs < 24 * 60 * 60 * 1000 : false;

  return (
    <div className="page grid">
      <section>
        <p className="kicker">Benchmarks</p>
        <h1 className="page-title">O(1) vs O(n) context efficiency.</h1>
        <p className="page-subtitle">
          Reproducible measurements comparing one registry tool context versus one wrapper per CLI.
        </p>
      </section>

      {!benchmark ? (
        <section className="card">
          <div className="section-label">Artifact Missing</div>
          <p className="page-subtitle" style={{ marginTop: 0 }}>
            Benchmark artifact not found. Generate it with:
          </p>
          <div className="command-copy-row">
            <CopyableCommand value="npm run benchmark:context" />
          </div>
        </section>
      ) : (
        <>
          <section className="grid grid-4">
            <article className="stat-card">
              <p className="stat-label">Catalog Size</p>
              <p className="stat-value">{benchmark.cli_count}</p>
              <p className="stat-meta">CLIs benchmarked</p>
            </article>
            <article className="stat-card">
              <p className="stat-label">O(1) Tokens</p>
              <p className="stat-value">{benchmark.baseline_o_1.estimated_tokens}</p>
              <p className="stat-meta">Per-query context floor</p>
            </article>
            <article className="stat-card">
              <p className="stat-label">Discover p95 (captured)</p>
              <p className="stat-value">{benchmark.o_1_live_discover_latency_ms.p95.toFixed(0)}ms</p>
              <p className="stat-meta">Observed during benchmark run</p>
            </article>
            <article className="stat-card">
              <p className="stat-label">Generated</p>
              <p className="stat-value">{formatRelativeTime(benchmark.generated_at, nowMs)}</p>
              <p className="stat-meta">
                API source: {benchmark.api_base_url}
                {!isFresh ? " · refresh recommended" : ""}
              </p>
            </article>
          </section>

          <section className="card">
            <div className="section-label">Methodology</div>
            <ul className="info-list">
              <li>{benchmark.methodology.o_1_definition}</li>
              <li>{benchmark.methodology.o_n_definition}</li>
              <li>{benchmark.methodology.token_estimation}</li>
              <li>{benchmark.methodology.latency_notes}</li>
            </ul>
          </section>

          <section className="card">
            <div className="section-label">Comparison Table</div>
            <div className="category-table-wrap">
              <table className="category-table">
                <thead>
                  <tr>
                    <th>Tool Wrappers</th>
                    <th>O(n) Tokens</th>
                    <th>O(1) Tokens</th>
                    <th>Ratio (O(n)/O(1))</th>
                    <th>Reduction with O(1)</th>
                    <th>O(n) Local scan ms</th>
                  </tr>
                </thead>
                <tbody>
                  {benchmark.comparisons.map((row) => (
                    <tr key={`bench-${row.tool_count}`}>
                      <td>{row.tool_count}</td>
                      <td>{row.o_n_estimated_tokens}</td>
                      <td>{row.o_1_estimated_tokens}</td>
                      <td>{row.token_ratio_o_n_to_o_1.toFixed(2)}x</td>
                      <td>{row.context_reduction_percent_using_o_1.toFixed(2)}%</td>
                      <td>{row.o_n_linear_scan_ms.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="stat-meta" style={{ marginTop: "8px" }}>
              Reproduce locally with `npm run benchmark:context`.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
