export type CategoryDefinition = {
  slug: string;
  label: string;
  matchers: string[];
};

export const CATEGORY_TAXONOMY: CategoryDefinition[] = [
  { slug: "deploy", label: "Deploy", matchers: ["deploy", "deployment", "hosting", "paas", "hosting-infra"] },
  { slug: "database", label: "Database", matchers: ["database", "databases", "postgres", "mysql", "sql", "orm"] },
  { slug: "payments", label: "Payments", matchers: ["payments", "billing", "subscriptions", "commerce"] },
  { slug: "auth", label: "Auth", matchers: ["auth", "identity", "oauth"] },
  {
    slug: "email",
    label: "Email/Comms",
    matchers: ["email", "emailer", "mailer", "smtp", "notifications", "sms", "email-comms", "transactional"]
  },
  { slug: "monitoring", label: "Monitoring", matchers: ["monitoring", "observability", "metrics", "alerts"] },
  { slug: "analytics", label: "Analytics", matchers: ["analytics", "product-analytics"] },
  { slug: "ci-cd", label: "CI/CD", matchers: ["ci-cd", "ci", "cd", "pipelines", "automation"] },
  { slug: "testing", label: "Testing", matchers: ["testing", "test", "e2e", "unit"] },
  { slug: "containers", label: "Containers", matchers: ["containers", "docker", "kubernetes", "k8s", "helm"] },
  { slug: "serverless", label: "Serverless", matchers: ["serverless", "functions", "edge"] },
  { slug: "infra-cloud", label: "Infra/Cloud", matchers: ["cloud", "infra", "infrastructure", "iac", "terraform"] },
  { slug: "storage-cdn", label: "Storage/CDN", matchers: ["storage", "storage-cdn", "cdn", "object", "s3"] },
  { slug: "dns-domains", label: "DNS/Domains", matchers: ["dns", "domain", "domains"] },
  { slug: "queues", label: "Queues/Messaging", matchers: ["queues", "queue", "messaging", "events", "broker"] },
  { slug: "caching", label: "Caching", matchers: ["cache", "caching", "redis", "memcached"] },
  { slug: "search", label: "Search", matchers: ["search", "algolia", "meilisearch", "typesense"] },
  { slug: "cms-content", label: "CMS/Content", matchers: ["cms", "content", "headless"] },
  { slug: "dev-tooling", label: "Dev Tooling", matchers: ["dev-tooling", "developer", "git", "package-manager"] },
  { slug: "ai-ml", label: "AI/ML", matchers: ["ai", "ml", "ml-ai", "llm", "inference"] },
  { slug: "utilities", label: "Utilities", matchers: ["utility", "utilities", "shell", "cli"] }
];

export const CATEGORY_FILTER_ALIASES: Record<string, string[]> = CATEGORY_TAXONOMY.reduce(
  (acc, category) => {
    acc[category.slug] = category.matchers;
    return acc;
  },
  {} as Record<string, string[]>
);

CATEGORY_FILTER_ALIASES.cicd = CATEGORY_FILTER_ALIASES["ci-cd"];
CATEGORY_FILTER_ALIASES.storage = CATEGORY_FILTER_ALIASES["storage-cdn"];

export function titleCaseCategory(value: string) {
  return value
    .split(/[-_\s]+/g)
    .filter(Boolean)
    .map((chunk) => chunk[0]?.toUpperCase() + chunk.slice(1))
    .join(" ");
}
