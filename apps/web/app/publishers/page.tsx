import Link from "next/link";
import { redirect } from "next/navigation";
import {
  createPublisherClaim,
  getCliSummaries,
  getPublisherAnalytics,
  getPublisherClaims
} from "../../lib/api";
import { FormSubmitButton } from "../../components/form-submit-button";
import { createPageMetadata } from "../../lib/metadata";

export const revalidate = 60;
export const metadata = createPageMetadata({
  title: "CLI Publishers Directory",
  description:
    "Claim-verified and community-curated CLI publishers with listing coverage, trust scores, and dashboard links.",
  path: "/publishers"
});

const PUBLISHER_DESCRIPTIONS: Record<string, string> = {
  Algolia: "Search and discovery API platform.",
  Ansible: "IT automation and configuration management.",
  Architect: "Serverless infrastructure as code framework.",
  Argo: "Kubernetes-native workflow and GitOps tooling.",
  Astral: "Python toolchain including Ruff and uv.",
  "Amazon Web Services": "Cloud platform for compute, storage, databases, and serverless workloads.",
  Bull: "Redis-based job queue for Node.js.",
  Bun: "All-in-one JavaScript runtime and toolkit.",
  Celery: "Distributed task queue for Python.",
  CircleCI: "Continuous integration and delivery platform.",
  "containers/image": "Container image manipulation library and tools.",
  Contentful: "Headless content management platform.",
  Cloudflare: "Cloud platform for web performance, security, and edge computing.",
  curl: "Command-line data transfer with URL syntax.",
  Cypress: "End-to-end testing framework for web apps.",
  Docker: "Container platform for building and shipping apps.",
  Datadog: "Cloud monitoring and security platform.",
  FFmpeg: "Multimedia processing and conversion toolkit.",
  Flux: "GitOps toolkit for Kubernetes.",
  fx: "Terminal JSON viewer and processor.",
  Git: "Distributed version control system.",
  GNU: "GNU core utilities and system tools.",
  "Google Firebase": "Google app development platform with hosting and functions.",
  "Google Cloud": "Cloud computing services by Google.",
  HashiCorp: "Infrastructure automation with Terraform, Vault, and Consul.",
  Helm: "Kubernetes package manager.",
  Heroku: "Cloud platform for deploying and managing apps.",
  Homebrew: "Package manager for macOS and Linux.",
  HTTPie: "Human-friendly HTTP client for the terminal.",
  "Hugging Face": "Machine learning model hub and tools.",
  ImageMagick: "Image creation, editing, and conversion toolkit.",
  ISC: "Internet Systems Consortium tools including BIND.",
  Jenkins: "Open source automation server for CI/CD.",
  Jest: "JavaScript testing framework by Meta.",
  jq: "Lightweight command-line JSON processor.",
  k9s: "Terminal-based Kubernetes cluster manager.",
  kubectx: "Kubernetes context and namespace switcher.",
  Kubernetes: "Container orchestration platform and operational ecosystem.",
  Meilisearch: "Lightning-fast open source search engine.",
  Memcached: "Distributed memory caching system.",
  MinIO: "High-performance S3-compatible object storage.",
  Mixpanel: "Product analytics and user behavior tracking.",
  "Microsoft Azure": "Cloud computing platform by Microsoft.",
  MySQL: "Open source relational database system.",
  "Namecheap Community": "Domain registration and DNS management.",
  NATS: "Cloud-native messaging and streaming system.",
  Neon: "Serverless Postgres with branching.",
  Netlify: "Web development platform for modern sites.",
  "Node.js": "JavaScript runtime built on V8.",
  npm: "Node.js package manager and registry.",
  Ollama: "Run large language models locally.",
  OpenFaaS: "Serverless functions on Kubernetes.",
  PlanetScale: "MySQL-compatible serverless database platform.",
  Plausible: "Privacy-friendly web analytics.",
  pnpm: "Fast, disk-efficient package manager for Node.js.",
  Podman: "Daemonless container engine for Linux.",
  PostgreSQL: "Advanced open source relational database.",
  PostHog: "Open source product analytics suite.",
  Postman: "API development and testing platform.",
  Postmark: "Transactional email delivery infrastructure.",
  Prisma: "Type-safe database ORM for Node.js and TypeScript.",
  Python: "Python programming language interpreter and tools.",
  Railway: "Deploy and scale applications instantly.",
  Render: "Unified cloud to build and run applications.",
  Redis: "In-memory data store and cache platform.",
  Replicate: "Run machine learning models in the cloud.",
  Resend: "Modern email API for developers.",
  rsync: "Fast incremental file transfer utility.",
  Rust: "Rust programming language toolchain (cargo, rustc).",
  Sanity: "Structured content platform and headless CMS.",
  Serverless: "Serverless framework for cloud functions.",
  Sentry: "Application monitoring and error tracking.",
  SQLite: "Self-contained embedded SQL database engine.",
  SST: "Full-stack serverless framework for AWS.",
  Stern: "Multi-pod log tailing for Kubernetes.",
  Strapi: "Open source headless CMS for Node.js.",
  Stripe: "Payment processing infrastructure for the internet.",
  Supabase: "Open source Firebase alternative with Postgres.",
  Tekton: "Cloud-native CI/CD pipelines for Kubernetes.",
  Turso: "SQLite for production at the edge.",
  Twilio: "Cloud communications platform for voice, SMS, and video.",
  Typesense: "Open source search engine optimized for speed.",
  Vercel: "Frontend cloud platform for Next.js and modern web frameworks.",
  Vitest: "Fast Vite-native unit testing framework.",
  Yarn: "Fast, reliable dependency management for JavaScript.",
  yq: "Lightweight command-line YAML/JSON/XML processor.",
  "Fly.io": "Run applications close to users worldwide.",
  Auth0: "Identity platform for developers.",
  "GitHub": "Developer platform for source control and collaborative software delivery.",
  "GitLab Community": "DevOps platform for the software lifecycle."
};

function canonicalPublisherName(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "amazon web services" || normalized === "aws" || normalized === "aws amplify") {
    return "Amazon Web Services";
  }
  if (normalized === "redis labs" || normalized === "redis") {
    return "Redis";
  }
  if (normalized === "microsoft" || normalized === "microsoft azure") {
    return "Microsoft Azure";
  }
  return value.trim();
}

function toSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

type Props = {
  searchParams: Promise<{ status?: string; message?: string }>;
};

export default async function PublishersPage({ searchParams }: Props) {
  const params = await searchParams;
  const [clis, claims, analyticsRows] = await Promise.all([
    getCliSummaries(),
    getPublisherClaims(),
    getPublisherAnalytics()
  ]);

  const statusType = params.status === "success" ? "success" : params.status === "error" ? "error" : null;
  const statusMessage = params.message ? decodeURIComponent(params.message) : null;

  async function submitClaim(formData: FormData) {
    "use server";
    const cliSlug = String(formData.get("cli_slug") ?? "").trim();
    const publisherName = String(formData.get("publisher_name") ?? "").trim();
    const domain = String(formData.get("domain") ?? "").trim();
    const evidence = String(formData.get("evidence") ?? "").trim();
    const verificationMethod = String(formData.get("verification_method") ?? "dns_txt");
    const repositoryUrl = String(formData.get("repository_url") ?? "").trim();

    if (!cliSlug || !publisherName || !domain || !evidence) {
      console.error("[publishers] Rejected: CLI slug, publisher name, domain, and evidence are required.");
      redirect("/publishers?status=error&message=CLI%20slug%2C%20publisher%20name%2C%20domain%2C%20and%20evidence%20are%20required.");
    }

    if (cliSlug.length > 100) {
      console.error("[publishers] Rejected: CLI slug exceeds 100 characters.");
      redirect("/publishers?status=error&message=CLI%20slug%20must%20be%20100%20characters%20or%20less.");
    }

    if (publisherName.length > 200) {
      console.error("[publishers] Rejected: publisher name exceeds 200 characters.");
      redirect("/publishers?status=error&message=Publisher%20name%20must%20be%20200%20characters%20or%20less.");
    }

    if (evidence.length > 2000) {
      console.error("[publishers] Rejected: evidence exceeds 2000 characters.");
      redirect("/publishers?status=error&message=Evidence%20must%20be%202000%20characters%20or%20less.");
    }

    const urlPattern = /^https?:\/\//;
    if (repositoryUrl && !urlPattern.test(repositoryUrl)) {
      console.error("[publishers] Rejected: repository URL is not a valid URL.");
      redirect("/publishers?status=error&message=Repository%20URL%20must%20start%20with%20http%3A%2F%2F%20or%20https%3A%2F%2F.");
    }

    try {
      await createPublisherClaim({
        cli_slug: cliSlug.slice(0, 100),
        publisher_name: publisherName.slice(0, 200),
        domain: domain.slice(0, 253),
        evidence: evidence.slice(0, 2000),
        verification_method:
          verificationMethod === "repo_file" ? "repo_file" : "dns_txt",
        repository_url: repositoryUrl || undefined
      });
      redirect("/publishers?status=success&message=Claim%20submitted.%20Verification%20instructions%20have%20been%20queued.");
    } catch (error) {
      console.error("[publishers] Claim submission failed:", error);
      redirect("/publishers?status=error&message=Claim%20submission%20failed.%20Please%20try%20again.");
    }
  }

  const publishers = new Map<
    string,
    {
      name: string;
      clis: Set<string>;
      verified: boolean;
      community: boolean;
      claimCount: number;
      trustTotal: number;
      telemetry: {
        search_impressions: number;
        install_attempts: number;
        report_count: number;
      };
    }
  >();

  const analyticsByPublisher = new Map(
    analyticsRows.map((entry) => [canonicalPublisherName(entry.publisher), entry] as const)
  );

  for (const cli of clis) {
    const name = canonicalPublisherName(cli.publisher);
    const existing = publishers.get(name) ?? {
      name,
      clis: new Set<string>(),
      verified: false,
      community: false,
      claimCount: 0,
      trustTotal: 0,
      telemetry: {
        search_impressions: 0,
        install_attempts: 0,
        report_count: 0
      }
    };

    existing.clis.add(cli.slug);
    existing.verified = existing.verified || cli.verification_status === "publisher-verified";
    existing.community = existing.community || cli.verification_status === "community-curated";
    existing.trustTotal += cli.trust_score;
    const telemetry = analyticsByPublisher.get(name);
    if (telemetry) {
      existing.telemetry = {
        search_impressions: telemetry.search_impressions,
        install_attempts: telemetry.install_attempts,
        report_count: telemetry.report_count
      };
    }
    publishers.set(name, existing);
  }

  for (const claim of claims) {
    const name = canonicalPublisherName(claim.publisher_name);
    const existing = publishers.get(name) ?? {
      name,
      clis: new Set<string>(),
      verified: false,
      community: false,
      claimCount: 0,
      trustTotal: 0,
      telemetry: {
        search_impressions: 0,
        install_attempts: 0,
        report_count: 0
      }
    };

    existing.claimCount += 1;
    existing.clis.add(claim.cli_slug);
    if (claim.status === "approved") {
      existing.verified = true;
    }
    publishers.set(name, existing);
  }

  const rows = [...publishers.values()].sort((a, b) => {
    if (b.clis.size !== a.clis.size) {
      return b.clis.size - a.clis.size;
    }
    const tierA = a.verified ? 2 : a.community ? 1 : 0;
    const tierB = b.verified ? 2 : b.community ? 1 : 0;
    if (tierB !== tierA) {
      return tierB - tierA;
    }
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="page grid">
      <section>
        <p className="kicker">Publishers</p>
        <h1 className="page-title">Publisher network and ownership signals.</h1>
        <p className="page-subtitle">
          Claim-verified and community-curated publishers with listing coverage, claims, and dashboard links.
        </p>
      </section>

      <section className="card">
        <div className="section-label">Claim Listing</div>
        <p className="page-subtitle" style={{ marginTop: 0 }}>
          Submit ownership proof to claim your CLI listing. Verification supports DNS TXT or repository-file challenge.
        </p>
        {statusType && statusMessage ? (
          <p className={`form-alert ${statusType}`}>{statusMessage}</p>
        ) : null}
        <form action={submitClaim} className="form-grid">
          <div className="form-field">
            <label className="form-label" htmlFor="claim-cli-slug">
              CLI Slug <span className="required">*</span>
            </label>
            <input id="claim-cli-slug" className="form-input" name="cli_slug" placeholder="vercel" required />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="claim-publisher-name">
              Publisher Name <span className="required">*</span>
            </label>
            <input id="claim-publisher-name" className="form-input" name="publisher_name" placeholder="Vercel" required />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="claim-domain">
              Domain <span className="required">*</span>
            </label>
            <input id="claim-domain" className="form-input" name="domain" placeholder="vercel.com" required />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="claim-verification-method">
              Verification Method
            </label>
            <select id="claim-verification-method" className="form-select" name="verification_method" defaultValue="dns_txt">
              <option value="dns_txt">DNS TXT verification</option>
              <option value="repo_file">Repository file verification</option>
            </select>
          </div>
          <div className="form-field full">
            <label className="form-label" htmlFor="claim-repository-url">
              Repository URL
            </label>
            <input id="claim-repository-url" className="form-input" name="repository_url" placeholder="https://github.com/org/repo" />
          </div>
          <div className="form-field full">
            <label className="form-label" htmlFor="claim-evidence">
              Evidence <span className="required">*</span>
            </label>
            <input id="claim-evidence" className="form-input" name="evidence" placeholder="TXT record value or repo proof path" required />
          </div>
          <div className="form-actions">
            <FormSubmitButton idleLabel="Submit Claim" pendingLabel="Submitting Claim..." />
          </div>
        </form>
      </section>

      <section>
        <div className="section-label">Publisher Directory</div>
        <div className="grid grid-3">
          {rows.map((publisher) => {
            const badgeClass = publisher.verified ? "verified" : publisher.community ? "community" : "neutral";
            const badgeLabel = publisher.verified
              ? "Claim Verified"
              : publisher.community
                ? "Community Curated"
                : "Observed";
            const avgTrust =
              publisher.clis.size > 0 ? (publisher.trustTotal / publisher.clis.size).toFixed(1) : "--";

            return (
              <article className="card" key={publisher.name}>
                  <h2 className="workflow-card-title">
                    {publisher.name}
                  </h2>
                  <div className="badge-row" style={{ marginTop: "8px" }}>
                  <span className={`badge ${badgeClass}`}>{badgeLabel}</span>
                  <span className="badge neutral">{publisher.clis.size} CLIs</span>
                  {publisher.claimCount > 0 ? (
                    <span className="badge neutral">{publisher.claimCount} claims</span>
                  ) : null}
                </div>
                  <p className="page-subtitle" style={{ marginTop: "8px" }}>
                  {PUBLISHER_DESCRIPTIONS[publisher.name] ??
                    `${publisher.name} command-line tooling and developer platform.`}
                </p>
                <p className="stat-meta" style={{ marginTop: "8px" }}>
                  Avg trust: {avgTrust} · Impressions: {publisher.telemetry.search_impressions}
                </p>
                <p className="stat-meta" style={{ marginTop: "4px" }}>
                  Installs: {publisher.telemetry.install_attempts} · Reports: {publisher.telemetry.report_count}
                </p>
                <p className="stat-meta" style={{ marginTop: "8px" }}>
                  <Link href={`/publisher/${toSlug(publisher.name)}`}>Open publisher dashboard</Link>
                </p>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
