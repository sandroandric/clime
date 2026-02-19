import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { GoldNpmCatalogEntry } from "./goldExpansionCatalog.js";

interface QueryPlan {
  text: string;
  category: string;
  tags: string[];
}

interface SearchObject {
  package?: {
    name?: string;
    description?: string;
    keywords?: string[];
    links?: {
      homepage?: string;
      repository?: string;
      npm?: string;
    };
  };
  score?: {
    final?: number;
    detail?: {
      quality?: number;
      popularity?: number;
      maintenance?: number;
    };
  };
}

interface Candidate {
  packageName: string;
  description: string;
  links: {
    homepage?: string;
    repository?: string;
    npm?: string;
  };
  score: number;
  quality: number;
  popularity: number;
  maintenance: number;
  categoryVotes: Map<string, number>;
  tagVotes: Map<string, number>;
}

interface RegistryMeta {
  latest?: string;
  description?: string;
  homepage?: string;
  repository?: string;
  bin?: unknown;
  keywords?: string[];
}

const THIS_FILE = fileURLToPath(import.meta.url);
const SCRIPTS_DIR = resolve(THIS_FILE, "..");
const ROOT = resolve(SCRIPTS_DIR, "../../..");
const OUTPUT_FILE = resolve(ROOT, "apps/api/scripts/goldExpansionCatalog.ts");
const GENERATOR_FILE = resolve(ROOT, "apps/api/scripts/generateCuratedListings.ts");

const SEARCH_SIZE = 250;
const TARGET_COUNT = Number.parseInt(process.env.CLIME_GOLD_NPM_TARGET ?? "900", 10);
const MAX_PAGES = Number.parseInt(process.env.CLIME_GOLD_NPM_MAX_PAGES ?? "8", 10);
const CANDIDATE_MULTIPLIER = Number.parseInt(process.env.CLIME_GOLD_NPM_CANDIDATE_MULTIPLIER ?? "5", 10);

const REGISTRY_SEARCH = "https://registry.npmjs.org/-/v1/search";
const REGISTRY_PACKAGE = "https://registry.npmjs.org";
const REQUEST_TIMEOUT_MS = Number.parseInt(process.env.CLIME_GOLD_NPM_TIMEOUT_MS ?? "12000", 10);
const REQUEST_RETRIES = Number.parseInt(process.env.CLIME_GOLD_NPM_RETRIES ?? "4", 10);

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  deployment: ["deploy", "hosting", "release", "ship", "rollout"],
  databases: ["database", "sql", "postgres", "mysql", "sqlite", "orm", "migration"],
  payments: ["payment", "billing", "invoice", "checkout", "subscription"],
  "email-comms": ["email", "smtp", "sms", "message", "notification", "mail"],
  auth: ["auth", "oauth", "identity", "sso", "jwt", "token", "login"],
  "hosting-infra": ["infra", "cloud", "aws", "gcp", "azure", "terraform", "iac"],
  "ci-cd": ["ci", "cd", "pipeline", "build", "release", "deploy"],
  testing: ["test", "testing", "assert", "coverage", "mock"],
  containers: ["docker", "container", "kubernetes", "k8s", "helm", "podman"],
  serverless: ["serverless", "lambda", "function", "edge"],
  "cms-content": ["cms", "content", "markdown", "blog", "headless"],
  analytics: ["analytics", "event", "metrics", "tracking", "telemetry"],
  "dns-domains": ["dns", "domain", "zone", "whois"],
  queues: ["queue", "job", "worker", "task", "broker"],
  caching: ["cache", "redis", "memcache", "ttl"],
  search: ["search", "index", "algolia", "query", "fulltext"],
  "ml-ai": ["ai", "ml", "model", "inference", "llm", "embedding"],
  utilities: ["cli", "tool", "utility", "shell", "terminal", "command"],
  "dev-tooling": ["dev", "lint", "format", "typescript", "bundler", "scaffold"],
  monitoring: ["monitor", "observability", "trace", "log", "alert", "sentry"],
  "storage-cdn": ["storage", "cdn", "bucket", "s3", "object", "upload"],
  additional: []
};

const QUERY_PLANS: QueryPlan[] = [
  { text: "keywords:cli deployment", category: "deployment", tags: ["deploy", "hosting"] },
  { text: "keywords:cli database", category: "databases", tags: ["database", "sql"] },
  { text: "keywords:cli payments", category: "payments", tags: ["payments", "billing"] },
  { text: "keywords:cli email", category: "email-comms", tags: ["email", "notifications"] },
  { text: "keywords:cli auth", category: "auth", tags: ["auth", "identity"] },
  { text: "keywords:cli cloud", category: "hosting-infra", tags: ["cloud", "infra"] },
  { text: "keywords:cli ci", category: "ci-cd", tags: ["ci", "cd"] },
  { text: "keywords:cli test", category: "testing", tags: ["testing", "qa"] },
  { text: "keywords:cli docker", category: "containers", tags: ["containers", "docker"] },
  { text: "keywords:cli kubernetes", category: "containers", tags: ["kubernetes", "containers"] },
  { text: "keywords:cli serverless", category: "serverless", tags: ["serverless", "functions"] },
  { text: "keywords:cli cms", category: "cms-content", tags: ["cms", "content"] },
  { text: "keywords:cli analytics", category: "analytics", tags: ["analytics", "events"] },
  { text: "keywords:cli dns", category: "dns-domains", tags: ["dns", "domain"] },
  { text: "keywords:cli queue", category: "queues", tags: ["queue", "workers"] },
  { text: "keywords:cli cache", category: "caching", tags: ["cache", "redis"] },
  { text: "keywords:cli search", category: "search", tags: ["search", "index"] },
  { text: "keywords:cli ai", category: "ml-ai", tags: ["ai", "ml"] },
  { text: "keywords:cli utility", category: "utilities", tags: ["utility", "shell"] },
  { text: "keywords:cli typescript", category: "dev-tooling", tags: ["typescript", "dev-tooling"] },
  { text: "keywords:cli monitoring", category: "monitoring", tags: ["monitoring", "logs"] },
  { text: "keywords:cli storage", category: "storage-cdn", tags: ["storage", "cdn"] }
];

const BLOCKED_SLUGS = new Set([
  "lemonsqueezy",
  "sendgrid",
  "clerk",
  "paddle",
  "resend",
  "plausible",
  "bull",
  "typesense",
  "aws"
]);

const BLOCKED_PACKAGES = new Set([
  "@types/node",
  "@types/react",
  "@types/express",
  "@types/yargs"
]);

function sleep(ms: number) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function normalizeWhitespace(value: string | undefined | null) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
}

function titleCaseFromToken(value: string) {
  return value
    .split(/[-_.\s/]+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function sanitizeUrl(value: string | undefined | null) {
  if (!value) {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const normalized = trimmed
    .replace(/^git\+/, "")
    .replace(/^git:\/\//, "https://")
    .replace(/\.git(#.*)?$/, "");

  if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
    return "";
  }
  return normalized;
}

function topVote(map: Map<string, number>) {
  return [...map.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
}

function incrementVote(map: Map<string, number>, key: string, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function ensureStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }
  return value.map((entry) => String(entry)).filter(Boolean);
}

function normalizePublisher(packageName: string, repositoryUrl: string) {
  if (packageName.startsWith("@")) {
    return titleCaseFromToken(packageName.slice(1).split("/")[0] ?? "community");
  }

  const githubMatch = repositoryUrl.match(/github\.com\/([^/]+)/i);
  if (githubMatch?.[1]) {
    return titleCaseFromToken(githubMatch[1]);
  }

  return titleCaseFromToken(packageName.split("-")[0] ?? "community");
}

function inferCategory(
  fallbackCategory: string,
  packageName: string,
  description: string,
  keywords: string[]
) {
  const corpus = `${packageName} ${description} ${keywords.join(" ")}`.toLowerCase();

  let bestCategory = fallbackCategory;
  let bestScore = 0;

  for (const [category, terms] of Object.entries(CATEGORY_KEYWORDS)) {
    if (terms.length === 0) {
      continue;
    }
    const score = terms.reduce((sum, term) => sum + (corpus.includes(term) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  return bestCategory;
}

function selectPrimaryBinary(pkgName: string, binField: unknown) {
  const packageBase = pkgName.split("/").pop() ?? pkgName;
  if (typeof binField === "string") {
    return slugify(packageBase);
  }
  if (!binField || typeof binField !== "object") {
    return "";
  }

  const candidates = Object.keys(binField as Record<string, string>).filter((name) => /^[a-z0-9][a-z0-9._-]{1,48}$/i.test(name));
  if (candidates.length === 0) {
    return "";
  }
  const normalizedBase = slugify(packageBase);
  const exact = candidates.find((name) => slugify(name) === normalizedBase);
  if (exact) {
    return slugify(exact);
  }
  const short = candidates.sort((left, right) => left.length - right.length)[0];
  return slugify(short);
}

function extractReservedSlugs() {
  const source = readFileSync(GENERATOR_FILE, "utf-8");
  const reserved = new Set<string>();
  for (const blockName of ["TARGETS", "EXPANSION_BLUEPRINTS"]) {
    const marker = `const ${blockName}`;
    const markerIndex = source.indexOf(marker);
    if (markerIndex < 0) {
      continue;
    }
    const start = source.indexOf("[", markerIndex);
    const end = source.indexOf("\n];", start);
    if (start < 0 || end < 0) {
      continue;
    }
    const block = source.slice(start, end);
    for (const match of block.matchAll(/slug:\s*"([^"]+)"/g)) {
      reserved.add(match[1]);
    }
  }
  return reserved;
}

async function fetchSearch(plan: QueryPlan, page: number) {
  const from = page * SEARCH_SIZE;
  const url = `${REGISTRY_SEARCH}?text=${encodeURIComponent(plan.text)}&size=${SEARCH_SIZE}&from=${from}&quality=0.35&popularity=0.45&maintenance=0.2`;
  const json = (await fetchJsonWithRetry(url)) as { objects?: SearchObject[] };
  return json.objects ?? [];
}

async function fetchRegistryMetadata(packageName: string) {
  const payload = (await fetchJsonWithRetry(`${REGISTRY_PACKAGE}/${encodeURIComponent(packageName)}`)) as Record<string, unknown>;
  const latest = String((payload["dist-tags"] as { latest?: string } | undefined)?.latest ?? "");
  if (!latest) {
    return {} as RegistryMeta;
  }
  const versions = (payload.versions as Record<string, Record<string, unknown>> | undefined) ?? {};
  const latestVersion = versions[latest] ?? {};

  const repository = latestVersion.repository;
  const repositoryUrl =
    typeof repository === "string"
      ? repository
      : typeof repository === "object" && repository && "url" in repository
        ? String((repository as { url?: string }).url ?? "")
        : "";

  return {
    latest,
    description: normalizeWhitespace(String(latestVersion.description ?? payload.description ?? "")),
    homepage: sanitizeUrl(String(latestVersion.homepage ?? payload.homepage ?? "")),
    repository: sanitizeUrl(repositoryUrl),
    bin: latestVersion.bin,
    keywords: ensureStringArray(latestVersion.keywords ?? payload.keywords)
  } as RegistryMeta;
}

async function fetchJsonWithRetry(url: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= Math.max(0, REQUEST_RETRIES); attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1000, REQUEST_TIMEOUT_MS));
    try {
      const response = await fetch(url, {
        headers: {
          accept: "application/json",
          "user-agent": "clime-catalog-refresh"
        },
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return (await response.json()) as unknown;
    } catch (error) {
      lastError = error;
      if (attempt < REQUEST_RETRIES) {
        const message = String(error);
        const waitMs = message.includes("HTTP 429") ? 2500 * (attempt + 1) : 500 * (attempt + 1);
        await sleep(waitMs);
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

async function main() {
  const wantedCount = Math.max(200, TARGET_COUNT);
  const maxCandidates = wantedCount * Math.max(2, CANDIDATE_MULTIPLIER);
  const reservedSlugs = extractReservedSlugs();
  const candidates = new Map<string, Candidate>();

  for (let page = 0; page < Math.max(1, MAX_PAGES); page += 1) {
    console.log(`search page ${page + 1}/${Math.max(1, MAX_PAGES)}...`);
    for (const plan of QUERY_PLANS) {
      const results = await fetchSearch(plan, page);
      for (const item of results) {
        const packageName = normalizeWhitespace(item.package?.name);
        if (!packageName || BLOCKED_PACKAGES.has(packageName) || packageName.startsWith("@types/")) {
          continue;
        }
        const description = normalizeWhitespace(item.package?.description);
        if (!description || description.length < 12) {
          continue;
        }

        const existing = candidates.get(packageName);
        if (existing) {
          existing.score = Math.max(existing.score, item.score?.final ?? 0);
          existing.quality = Math.max(existing.quality, item.score?.detail?.quality ?? 0);
          existing.popularity = Math.max(existing.popularity, item.score?.detail?.popularity ?? 0);
          existing.maintenance = Math.max(existing.maintenance, item.score?.detail?.maintenance ?? 0);
          incrementVote(existing.categoryVotes, plan.category);
          for (const tag of plan.tags) {
            incrementVote(existing.tagVotes, tag);
          }
          continue;
        }

        const categoryVotes = new Map<string, number>();
        incrementVote(categoryVotes, plan.category);
        const tagVotes = new Map<string, number>();
        for (const tag of plan.tags) {
          incrementVote(tagVotes, tag);
        }

        candidates.set(packageName, {
          packageName,
          description,
          links: {
            homepage: sanitizeUrl(item.package?.links?.homepage),
            repository: sanitizeUrl(item.package?.links?.repository),
            npm: sanitizeUrl(item.package?.links?.npm)
          },
          score: item.score?.final ?? 0,
          quality: item.score?.detail?.quality ?? 0,
          popularity: item.score?.detail?.popularity ?? 0,
          maintenance: item.score?.detail?.maintenance ?? 0,
          categoryVotes,
          tagVotes
        });
      }
      if (candidates.size >= maxCandidates) {
        break;
      }
      await sleep(300);
    }
    if (candidates.size >= maxCandidates) {
      break;
    }
  }

  const rankedCandidates = [...candidates.values()].sort((left, right) => {
    const leftScore = left.score * 4 + left.popularity * 2 + left.quality + left.maintenance;
    const rightScore = right.score * 4 + right.popularity * 2 + right.quality + right.maintenance;
    return rightScore - leftScore;
  });

  const usedSlugs = new Set<string>(reservedSlugs);
  const entries: GoldNpmCatalogEntry[] = [];
  const packageSeen = new Set<string>();
  let examined = 0;

  for (const candidate of rankedCandidates) {
    if (entries.length >= wantedCount) {
      break;
    }
    if (packageSeen.has(candidate.packageName)) {
      continue;
    }

    let registryMeta: RegistryMeta;
    examined += 1;
    if (examined % 100 === 0) {
      console.log(`metadata checked: ${examined}, accepted: ${entries.length}`);
    }
    try {
      registryMeta = await fetchRegistryMetadata(candidate.packageName);
    } catch {
      continue;
    }

    const primaryBinary = selectPrimaryBinary(candidate.packageName, registryMeta.bin);
    if (!primaryBinary) {
      continue;
    }

    const packageBase = slugify(candidate.packageName.split("/").pop() ?? candidate.packageName);
    let slug = slugify(primaryBinary);
    if (!slug) {
      slug = packageBase;
    }
    if (!slug || BLOCKED_SLUGS.has(slug)) {
      continue;
    }
    if (usedSlugs.has(slug)) {
      const suffixCandidate = slugify(`${slug}-${packageBase}`);
      slug = suffixCandidate && !usedSlugs.has(suffixCandidate) ? suffixCandidate : `${slug}-${Math.abs(candidate.packageName.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0)).toString(36)}`;
    }
    if (!slug || usedSlugs.has(slug) || BLOCKED_SLUGS.has(slug)) {
      continue;
    }

    const baseCategory = topVote(candidate.categoryVotes) ?? "additional";
    const keywords = registryMeta.keywords ?? [];
    const category = inferCategory(baseCategory, candidate.packageName, registryMeta.description ?? candidate.description, keywords);
    const repository = registryMeta.repository || candidate.links.repository || `https://www.npmjs.com/package/${candidate.packageName}`;
    const website = registryMeta.homepage || candidate.links.homepage || repository;
    if (!website || !repository) {
      continue;
    }

    const description = normalizeWhitespace(registryMeta.description ?? candidate.description);
    if (description.length < 16) {
      continue;
    }

    const publisher = normalizePublisher(candidate.packageName, repository);
    const tagSet = new Set<string>([category, ...keywords.slice(0, 4).map((tag) => slugify(tag)).filter(Boolean)]);
    for (const [tag] of [...candidate.tagVotes.entries()].sort((left, right) => right[1] - left[1]).slice(0, 3)) {
      tagSet.add(slugify(tag));
    }
    tagSet.add(packageBase);
    tagSet.delete("");

    entries.push({
      slug,
      packageName: candidate.packageName,
      binary: primaryBinary,
      name: `${titleCaseFromToken(primaryBinary)} CLI`,
      publisher,
      description,
      category,
      tags: [...tagSet].slice(0, 8),
      docs: website
    });

    packageSeen.add(candidate.packageName);
    usedSlugs.add(slug);
    await sleep(70);
  }

  if (entries.length < wantedCount) {
    throw new Error(`Unable to build requested catalog size. Wanted ${wantedCount}, got ${entries.length}. Increase query pages or loosen filters.`);
  }

  const sortedEntries = entries.slice().sort((left, right) => {
    const categoryCompare = left.category.localeCompare(right.category);
    if (categoryCompare !== 0) {
      return categoryCompare;
    }
    return left.slug.localeCompare(right.slug);
  });

  const output =
    `export interface GoldNpmCatalogEntry {\n` +
    `  slug: string;\n` +
    `  packageName: string;\n` +
    `  binary: string;\n` +
    `  name: string;\n` +
    `  publisher: string;\n` +
    `  description: string;\n` +
    `  category: string;\n` +
    `  tags: string[];\n` +
    `  docs: string;\n` +
    `}\n\n` +
    `export const goldNpmCatalog: GoldNpmCatalogEntry[] = ${JSON.stringify(sortedEntries, null, 2)};\n`;

  writeFileSync(OUTPUT_FILE, output);
  console.log(`Wrote ${sortedEntries.length} gold npm entries -> ${OUTPUT_FILE}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
