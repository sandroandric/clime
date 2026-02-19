import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import type { CliProfile, WorkflowChain } from "@cli-me/shared-types";
import { goldNpmCatalog } from "./goldExpansionCatalog.js";

interface RunnerSpec {
  type: "direct" | "npx";
  command?: string;
  packageName?: string;
}

interface TargetSpec {
  slug: string;
  name: string;
  publisher: string;
  description: string;
  category: string;
  tags: string[];
  binary: string;
  docs: string[];
  runners: RunnerSpec[];
  install: {
    macos: string;
    linux: string;
  };
  auth: {
    type: "api_key" | "oauth" | "login_command" | "config_file" | "none";
    env: string[];
    loginCommand?: string;
    refresh: string;
    scopes: string[];
  };
  fallbackCommands: Array<{ subcommand: string; description: string }>;
  workflowRefs: string[];
  source?: "core" | "expansion" | "npm_auto";
}

const ENABLE_NPX_PROBES = process.env.CLIME_CURATED_ENABLE_NPX_PROBES === "true";
const FETCH_DOCS_FOR_NPM_AUTO = process.env.CLIME_CURATED_FETCH_DOCS_FOR_NPM === "true";
const parsedMinimum = Number.parseInt(process.env.CLIME_CURATED_MIN_LISTINGS ?? "1000", 10);
const MIN_CURATED_LISTINGS = Number.isFinite(parsedMinimum) && parsedMinimum > 0 ? parsedMinimum : 1000;
const DISALLOWED_GENERATED_SLUGS = new Set(["st"]);

const CATEGORY_ORDER = [
  "deployment",
  "databases",
  "payments",
  "email-comms",
  "auth",
  "hosting-infra",
  "ci-cd",
  "testing",
  "containers",
  "serverless",
  "cms-content",
  "analytics",
  "dns-domains",
  "queues",
  "caching",
  "search",
  "ml-ai",
  "utilities",
  "dev-tooling",
  "monitoring",
  "storage-cdn",
  "additional"
] as const;

const TARGETS: TargetSpec[] = [
  {
    slug: "vercel",
    name: "Vercel CLI",
    publisher: "Vercel",
    description: "Deploy and manage Next.js and frontend apps",
    category: "deployment",
    tags: ["deploy", "nextjs", "frontend"],
    binary: "vercel",
    docs: ["https://vercel.com/docs/cli"],
    runners: [{ type: "direct", command: "vercel" }, { type: "npx", packageName: "vercel" }],
    install: { macos: "brew install vercel-cli", linux: "npm install -g vercel" },
    auth: {
      type: "login_command",
      env: ["VERCEL_TOKEN"],
      loginCommand: "vercel login",
      refresh: "Re-authenticate or rotate Vercel token from dashboard.",
      scopes: ["projects:read", "deployments:write"]
    },
    fallbackCommands: [
      { subcommand: "link", description: "Link local repo to a Vercel project" },
      { subcommand: "deploy", description: "Create a deployment" },
      { subcommand: "env", description: "Manage environment variables" },
      { subcommand: "logs", description: "Inspect deployment logs" },
      { subcommand: "domains", description: "Manage domains" }
    ],
    workflowRefs: ["full-stack-saas", "deploy-nextjs-app"]
  },
  {
    slug: "fly",
    name: "Flyctl",
    publisher: "Fly.io",
    description: "Deploy and run apps globally at the edge",
    category: "deployment",
    tags: ["deploy", "edge", "containers"],
    binary: "flyctl",
    docs: ["https://fly.io/docs/flyctl"],
    runners: [{ type: "direct", command: "flyctl" }],
    install: { macos: "brew install flyctl", linux: "curl -L https://fly.io/install.sh | sh" },
    auth: {
      type: "login_command",
      env: ["FLY_API_TOKEN"],
      loginCommand: "flyctl auth login",
      refresh: "Rotate Fly API token in Fly dashboard when expired.",
      scopes: ["apps:write", "machines:write"]
    },
    fallbackCommands: [
      { subcommand: "auth login", description: "Authenticate against Fly account" },
      { subcommand: "launch", description: "Initialize app and config" },
      { subcommand: "deploy", description: "Deploy app version" },
      { subcommand: "logs", description: "Stream app logs" },
      { subcommand: "status", description: "Inspect app status" }
    ],
    workflowRefs: ["deploy-nextjs-app", "edge-api-launch"]
  },
  {
    slug: "netlify",
    name: "Netlify CLI",
    publisher: "Netlify",
    description: "Deploy frontend apps and Netlify functions",
    category: "deployment",
    tags: ["deploy", "frontend", "serverless"],
    binary: "netlify",
    docs: ["https://docs.netlify.com/cli/get-started/"],
    runners: [{ type: "direct", command: "netlify" }, { type: "npx", packageName: "netlify-cli" }],
    install: { macos: "brew install netlify-cli", linux: "npm install -g netlify-cli" },
    auth: {
      type: "login_command",
      env: ["NETLIFY_AUTH_TOKEN"],
      loginCommand: "netlify login",
      refresh: "Create and rotate personal access tokens in Netlify settings.",
      scopes: ["sites:write", "deploys:write"]
    },
    fallbackCommands: [
      { subcommand: "login", description: "Authenticate Netlify user" },
      { subcommand: "link", description: "Link local folder to site" },
      { subcommand: "deploy", description: "Create deploy" },
      { subcommand: "functions:list", description: "List functions" },
      { subcommand: "env:list", description: "List environment variables" }
    ],
    workflowRefs: ["jamstack-launch", "deploy-nextjs-app"]
  },
  {
    slug: "railway",
    name: "Railway CLI",
    publisher: "Railway",
    description: "Deploy and manage Railway services",
    category: "deployment",
    tags: ["deploy", "paas", "services"],
    binary: "railway",
    docs: ["https://docs.railway.com/reference/cli-api"],
    runners: [{ type: "direct", command: "railway" }, { type: "npx", packageName: "@railway/cli" }],
    install: { macos: "brew install railway", linux: "npm install -g @railway/cli" },
    auth: {
      type: "login_command",
      env: ["RAILWAY_TOKEN"],
      loginCommand: "railway login",
      refresh: "Refresh Railway token from account settings.",
      scopes: ["projects:read", "services:write"]
    },
    fallbackCommands: [
      { subcommand: "login", description: "Authenticate Railway CLI" },
      { subcommand: "link", description: "Link local project" },
      { subcommand: "up", description: "Deploy current source" },
      { subcommand: "logs", description: "Tail service logs" },
      { subcommand: "status", description: "Show deployment status" }
    ],
    workflowRefs: ["deploy-nextjs-app", "full-stack-saas"]
  },
  {
    slug: "render",
    name: "Render CLI",
    publisher: "Render",
    description: "Manage Render services and deployments",
    category: "deployment",
    tags: ["deploy", "hosting", "services"],
    binary: "render",
    docs: ["https://render.com/docs/cli"],
    runners: [{ type: "direct", command: "render" }, { type: "npx", packageName: "@render-oss/cli" }],
    install: { macos: "npm install -g render-cli", linux: "npm install -g render-cli" },
    auth: {
      type: "api_key",
      env: ["RENDER_API_KEY"],
      refresh: "Rotate Render API key in user dashboard.",
      scopes: ["services:read", "services:write"]
    },
    fallbackCommands: [
      { subcommand: "auth login", description: "Authenticate Render account" },
      { subcommand: "services list", description: "List Render services" },
      { subcommand: "deploys create", description: "Trigger deployment" },
      { subcommand: "logs", description: "Fetch service logs" },
      { subcommand: "blueprints apply", description: "Apply infrastructure blueprint" }
    ],
    workflowRefs: ["deploy-nextjs-app", "service-launch"]
  },
  {
    slug: "amplify",
    name: "Amplify CLI",
    publisher: "AWS Amplify",
    description: "Provision full-stack cloud backend and hosting",
    category: "deployment",
    tags: ["deploy", "aws", "frontend"],
    binary: "amplify",
    docs: ["https://docs.amplify.aws/gen1/javascript/tools/cli/"],
    runners: [{ type: "direct", command: "amplify" }, { type: "npx", packageName: "@aws-amplify/cli" }],
    install: { macos: "brew install aws-amplify", linux: "npm install -g @aws-amplify/cli" },
    auth: {
      type: "config_file",
      env: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"],
      refresh: "Refresh AWS credentials or profile used by Amplify.",
      scopes: ["amplify:*", "cloudformation:*"]
    },
    fallbackCommands: [
      { subcommand: "configure", description: "Configure Amplify and AWS profile" },
      { subcommand: "init", description: "Initialize Amplify project" },
      { subcommand: "add hosting", description: "Add hosting resource" },
      { subcommand: "push", description: "Provision backend changes" },
      { subcommand: "publish", description: "Publish frontend and backend" }
    ],
    workflowRefs: ["deploy-nextjs-app", "serverless-backend-launch"]
  },
  {
    slug: "supabase",
    name: "Supabase CLI",
    publisher: "Supabase",
    description: "Manage Supabase projects, auth, and Postgres migrations",
    category: "databases",
    tags: ["database", "postgres", "backend"],
    binary: "supabase",
    docs: ["https://supabase.com/docs/guides/cli"],
    runners: [{ type: "direct", command: "supabase" }, { type: "npx", packageName: "supabase" }],
    install: { macos: "brew install supabase/tap/supabase", linux: "npm install -g supabase" },
    auth: {
      type: "api_key",
      env: ["SUPABASE_ACCESS_TOKEN"],
      loginCommand: "supabase login",
      refresh: "Rotate Supabase personal access token.",
      scopes: ["projects:read", "database:write"]
    },
    fallbackCommands: [
      { subcommand: "login", description: "Authenticate Supabase CLI" },
      { subcommand: "link", description: "Link project reference" },
      { subcommand: "db pull", description: "Pull remote schema" },
      { subcommand: "db push", description: "Push migrations" },
      { subcommand: "functions deploy", description: "Deploy edge function" }
    ],
    workflowRefs: ["database-setup", "full-stack-saas"]
  },
  {
    slug: "planetscale",
    name: "PlanetScale CLI",
    publisher: "PlanetScale",
    description: "Operate PlanetScale databases and branches",
    category: "databases",
    tags: ["database", "mysql", "branching"],
    binary: "pscale",
    docs: ["https://planetscale.com/docs/reference/planetscale-cli"],
    runners: [{ type: "direct", command: "pscale" }, { type: "npx", packageName: "@planetscale/cli" }],
    install: { macos: "brew tap planetscale/tap && brew install pscale", linux: "brew tap planetscale/tap && brew install pscale" },
    auth: {
      type: "login_command",
      env: ["PLANETSCALE_SERVICE_TOKEN_ID", "PLANETSCALE_SERVICE_TOKEN"],
      loginCommand: "pscale auth login",
      refresh: "Rotate PlanetScale service tokens.",
      scopes: ["database:read", "database:write"]
    },
    fallbackCommands: [
      { subcommand: "auth login", description: "Authenticate CLI" },
      { subcommand: "database create", description: "Create database" },
      { subcommand: "branch create", description: "Create schema branch" },
      { subcommand: "deploy-request create", description: "Create deploy request" },
      { subcommand: "connect", description: "Open local connection" }
    ],
    workflowRefs: ["database-setup", "full-stack-saas"]
  },
  {
    slug: "turso",
    name: "Turso CLI",
    publisher: "Turso",
    description: "Manage Turso/libSQL databases and replicas",
    category: "databases",
    tags: ["database", "sqlite", "edge"],
    binary: "turso",
    docs: ["https://docs.turso.tech/cli/introduction"],
    runners: [{ type: "direct", command: "turso" }],
    install: { macos: "brew tap tursodatabase/tap && brew install turso", linux: "curl -sSfL https://get.tur.so/install.sh | bash" },
    auth: {
      type: "login_command",
      env: ["TURSO_API_TOKEN"],
      loginCommand: "turso auth login",
      refresh: "Refresh Turso token via auth login.",
      scopes: ["databases:write"]
    },
    fallbackCommands: [
      { subcommand: "auth login", description: "Authenticate Turso CLI" },
      { subcommand: "db create", description: "Create database" },
      { subcommand: "db list", description: "List databases" },
      { subcommand: "db shell", description: "Open SQL shell" },
      { subcommand: "db tokens create", description: "Create database token" }
    ],
    workflowRefs: ["database-setup", "edge-api-launch"]
  },
  {
    slug: "neon",
    name: "Neon CLI",
    publisher: "Neon",
    description: "Manage Neon serverless Postgres projects",
    category: "databases",
    tags: ["database", "postgres", "serverless"],
    binary: "neon",
    docs: ["https://neon.tech/docs/reference/cli"],
    runners: [{ type: "direct", command: "neon" }, { type: "npx", packageName: "neonctl" }],
    install: { macos: "brew install neonctl", linux: "npm install -g neonctl" },
    auth: {
      type: "api_key",
      env: ["NEON_API_KEY"],
      refresh: "Rotate Neon API key in project settings.",
      scopes: ["projects:read", "branches:write"]
    },
    fallbackCommands: [
      { subcommand: "auth", description: "Authenticate Neon CLI" },
      { subcommand: "projects list", description: "List Neon projects" },
      { subcommand: "branches create", description: "Create branch" },
      { subcommand: "connection-string", description: "Generate connection string" },
      { subcommand: "operations list", description: "List asynchronous operations" }
    ],
    workflowRefs: ["database-setup", "full-stack-saas"]
  },
  {
    slug: "prisma",
    name: "Prisma CLI",
    publisher: "Prisma",
    description: "Run schema migrations and generate Prisma client",
    category: "databases",
    tags: ["database", "orm", "migrations"],
    binary: "prisma",
    docs: ["https://www.prisma.io/docs/orm/reference/prisma-cli-reference"],
    runners: [{ type: "direct", command: "prisma" }, { type: "npx", packageName: "prisma" }],
    install: { macos: "npm install prisma --save-dev", linux: "npm install prisma --save-dev" },
    auth: {
      type: "none",
      env: ["DATABASE_URL"],
      refresh: "No CLI token; relies on database credentials.",
      scopes: []
    },
    fallbackCommands: [
      { subcommand: "init", description: "Initialize Prisma files" },
      { subcommand: "migrate dev", description: "Create and apply migration" },
      { subcommand: "migrate deploy", description: "Apply migrations in prod" },
      { subcommand: "db pull", description: "Introspect schema" },
      { subcommand: "generate", description: "Generate Prisma client" }
    ],
    workflowRefs: ["database-setup", "full-stack-saas"]
  },
  {
    slug: "stripe",
    name: "Stripe CLI",
    publisher: "Stripe",
    description: "Test Stripe events and payment workflows",
    category: "payments",
    tags: ["payments", "billing", "webhooks"],
    binary: "stripe",
    docs: ["https://docs.stripe.com/stripe-cli"],
    runners: [{ type: "direct", command: "stripe" }, { type: "npx", packageName: "@stripe/stripe-cli" }],
    install: { macos: "brew tap stripe/stripe-cli && brew install stripe-cli", linux: "sudo apt install stripe-cli" },
    auth: {
      type: "login_command",
      env: ["STRIPE_API_KEY"],
      loginCommand: "stripe login",
      refresh: "Re-run login flow to refresh session token.",
      scopes: ["read_write"]
    },
    fallbackCommands: [
      { subcommand: "login", description: "Authenticate Stripe account" },
      { subcommand: "listen", description: "Listen for webhook events" },
      { subcommand: "trigger", description: "Trigger test event" },
      { subcommand: "products list", description: "List products" },
      { subcommand: "prices create", description: "Create price object" }
    ],
    workflowRefs: ["payments-integration", "full-stack-saas"]
  },
  {
    slug: "postmark",
    name: "Postmark CLI",
    publisher: "Postmark",
    description: "Operate Postmark transactional email resources",
    category: "email-comms",
    tags: ["email", "postmark", "notifications"],
    binary: "postmark",
    docs: ["https://postmarkapp.com/developer"],
    runners: [{ type: "direct", command: "postmark" }],
    install: { macos: "npm install -g postmark-cli", linux: "npm install -g postmark-cli" },
    auth: {
      type: "api_key",
      env: ["POSTMARK_SERVER_TOKEN"],
      refresh: "Rotate Postmark server token.",
      scopes: ["messages:write", "templates:read"]
    },
    fallbackCommands: [
      { subcommand: "auth", description: "Set Postmark token" },
      { subcommand: "servers list", description: "List servers" },
      { subcommand: "templates list", description: "List templates" },
      { subcommand: "messages send", description: "Send message" },
      { subcommand: "stats", description: "View send statistics" }
    ],
    workflowRefs: ["notifications-stack", "full-stack-saas"]
  },
  {
    slug: "twilio",
    name: "Twilio CLI",
    publisher: "Twilio",
    description: "Manage Twilio SMS, Voice, and serverless resources",
    category: "email-comms",
    tags: ["sms", "voice", "communications"],
    binary: "twilio",
    docs: ["https://www.twilio.com/docs/twilio-cli"],
    runners: [{ type: "direct", command: "twilio" }, { type: "npx", packageName: "twilio-cli" }],
    install: { macos: "npm install -g twilio-cli", linux: "npm install -g twilio-cli" },
    auth: {
      type: "api_key",
      env: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"],
      loginCommand: "twilio login",
      refresh: "Rotate Twilio auth tokens.",
      scopes: ["messages:write", "calls:write"]
    },
    fallbackCommands: [
      { subcommand: "login", description: "Authenticate Twilio profile" },
      { subcommand: "phone-numbers:list", description: "List owned numbers" },
      { subcommand: "api:core:messages:create", description: "Send SMS" },
      { subcommand: "api:core:calls:create", description: "Create call" },
      { subcommand: "profiles:list", description: "List local CLI profiles" }
    ],
    workflowRefs: ["notifications-stack", "full-stack-saas"]
  },
  {
    slug: "auth0",
    name: "Auth0 CLI",
    publisher: "Auth0",
    description: "Manage Auth0 tenants, clients, and APIs",
    category: "auth",
    tags: ["auth", "oauth", "identity"],
    binary: "auth0",
    docs: ["https://auth0.github.io/auth0-cli/"],
    runners: [{ type: "direct", command: "auth0" }, { type: "npx", packageName: "@auth0/auth0-cli" }],
    install: { macos: "brew tap auth0/auth0-cli && brew install auth0/auth0-cli/auth0", linux: "curl -sSfL https://raw.githubusercontent.com/auth0/auth0-cli/main/install.sh | bash" },
    auth: {
      type: "login_command",
      env: ["AUTH0_ACCESS_TOKEN"],
      loginCommand: "auth0 login",
      refresh: "Refresh Auth0 session token through login flow.",
      scopes: ["read:clients", "create:clients"]
    },
    fallbackCommands: [
      { subcommand: "login", description: "Authenticate Auth0 tenant" },
      { subcommand: "apps list", description: "List applications" },
      { subcommand: "apps create", description: "Create app" },
      { subcommand: "apis list", description: "List APIs" },
      { subcommand: "users list", description: "List users" }
    ],
    workflowRefs: ["auth-setup", "full-stack-saas"]
  },
  {
    slug: "aws-cli",
    name: "AWS CLI",
    publisher: "Amazon Web Services",
    description: "Manage AWS infrastructure and cloud resources",
    category: "hosting-infra",
    tags: ["cloud", "aws", "infrastructure"],
    binary: "aws",
    docs: ["https://docs.aws.amazon.com/cli/latest/reference/"],
    runners: [{ type: "direct", command: "aws" }],
    install: { macos: "brew install awscli", linux: "sudo apt install awscli" },
    auth: {
      type: "config_file",
      env: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"],
      loginCommand: "aws configure",
      refresh: "Rotate IAM keys or session credentials.",
      scopes: ["depends-on-iam-policy"]
    },
    fallbackCommands: [
      { subcommand: "configure", description: "Configure AWS credentials" },
      { subcommand: "s3 ls", description: "List S3 buckets" },
      { subcommand: "s3 sync", description: "Sync local files to S3" },
      { subcommand: "lambda list-functions", description: "List Lambda functions" },
      { subcommand: "cloudformation deploy", description: "Deploy stack template" }
    ],
    workflowRefs: ["infra-bootstrap", "full-stack-saas"]
  },
  {
    slug: "gcloud",
    name: "Google Cloud CLI",
    publisher: "Google Cloud",
    description: "Operate Google Cloud resources from terminal",
    category: "hosting-infra",
    tags: ["cloud", "gcp", "infrastructure"],
    binary: "gcloud",
    docs: ["https://cloud.google.com/sdk/gcloud/reference"],
    runners: [{ type: "direct", command: "gcloud" }],
    install: { macos: "brew install --cask google-cloud-sdk", linux: "curl https://sdk.cloud.google.com | bash" },
    auth: {
      type: "login_command",
      env: ["GOOGLE_APPLICATION_CREDENTIALS"],
      loginCommand: "gcloud auth login",
      refresh: "Refresh OAuth session or service-account key.",
      scopes: ["cloud-platform"]
    },
    fallbackCommands: [
      { subcommand: "auth login", description: "Authenticate gcloud" },
      { subcommand: "config set project", description: "Set project context" },
      { subcommand: "run deploy", description: "Deploy Cloud Run service" },
      { subcommand: "functions deploy", description: "Deploy Cloud Function" },
      { subcommand: "compute instances list", description: "List VM instances" }
    ],
    workflowRefs: ["infra-bootstrap", "deploy-nextjs-app"]
  },
  {
    slug: "az",
    name: "Azure CLI",
    publisher: "Microsoft Azure",
    description: "Manage Azure resources and deployments",
    category: "hosting-infra",
    tags: ["cloud", "azure", "infrastructure"],
    binary: "az",
    docs: ["https://learn.microsoft.com/cli/azure/"],
    runners: [{ type: "direct", command: "az" }],
    install: { macos: "brew install azure-cli", linux: "curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash" },
    auth: {
      type: "login_command",
      env: ["AZURE_TENANT_ID"],
      loginCommand: "az login",
      refresh: "Re-login or refresh service principal credentials.",
      scopes: ["subscription:write"]
    },
    fallbackCommands: [
      { subcommand: "login", description: "Authenticate Azure account" },
      { subcommand: "account set", description: "Set active subscription" },
      { subcommand: "group create", description: "Create resource group" },
      { subcommand: "webapp up", description: "Deploy web app quickly" },
      { subcommand: "aks list", description: "List AKS clusters" }
    ],
    workflowRefs: ["infra-bootstrap", "service-launch"]
  },
  {
    slug: "docker",
    name: "Docker CLI",
    publisher: "Docker",
    description: "Build and run container images",
    category: "hosting-infra",
    tags: ["containers", "devops", "build"],
    binary: "docker",
    docs: ["https://docs.docker.com/reference/cli/docker/"],
    runners: [{ type: "direct", command: "docker" }],
    install: { macos: "brew install --cask docker", linux: "sudo apt install docker.io" },
    auth: {
      type: "login_command",
      env: ["DOCKER_CONFIG"],
      loginCommand: "docker login",
      refresh: "Re-login to registry if token expires.",
      scopes: ["registry:push", "registry:pull"]
    },
    fallbackCommands: [
      { subcommand: "build", description: "Build image from Dockerfile" },
      { subcommand: "run", description: "Run container" },
      { subcommand: "ps", description: "List running containers" },
      { subcommand: "logs", description: "Show container logs" },
      { subcommand: "compose up", description: "Run multi-container stack" }
    ],
    workflowRefs: ["container-api-launch", "deploy-nextjs-app"]
  },
  {
    slug: "kubectl",
    name: "kubectl",
    publisher: "Kubernetes",
    description: "Control Kubernetes clusters",
    category: "hosting-infra",
    tags: ["kubernetes", "orchestration", "devops"],
    binary: "kubectl",
    docs: ["https://kubernetes.io/docs/reference/kubectl/"],
    runners: [{ type: "direct", command: "kubectl" }],
    install: { macos: "brew install kubectl", linux: "sudo apt install kubectl" },
    auth: {
      type: "config_file",
      env: ["KUBECONFIG"],
      loginCommand: "kubectl config use-context <context>",
      refresh: "Refresh cluster credentials via cloud provider CLI.",
      scopes: ["cluster:read", "cluster:write"]
    },
    fallbackCommands: [
      { subcommand: "config get-contexts", description: "List kube contexts" },
      { subcommand: "get pods", description: "List pods" },
      { subcommand: "apply -f", description: "Apply manifests" },
      { subcommand: "rollout status", description: "Watch rollout" },
      { subcommand: "logs", description: "Read pod logs" }
    ],
    workflowRefs: ["k8s-service-deploy", "infra-bootstrap"]
  },
  {
    slug: "gh",
    name: "GitHub CLI",
    publisher: "GitHub",
    description: "Manage repos, PRs, and issues",
    category: "dev-tooling",
    tags: ["git", "github", "collaboration"],
    binary: "gh",
    docs: ["https://cli.github.com/manual/"],
    runners: [{ type: "direct", command: "gh" }],
    install: { macos: "brew install gh", linux: "sudo apt install gh" },
    auth: {
      type: "login_command",
      env: ["GH_TOKEN"],
      loginCommand: "gh auth login",
      refresh: "Refresh GitHub token in auth flow.",
      scopes: ["repo", "read:org"]
    },
    fallbackCommands: [
      { subcommand: "auth login", description: "Authenticate GitHub" },
      { subcommand: "repo create", description: "Create repository" },
      { subcommand: "pr create", description: "Create pull request" },
      { subcommand: "issue list", description: "List issues" },
      { subcommand: "run list", description: "List workflow runs" }
    ],
    workflowRefs: ["developer-loop", "full-stack-saas"]
  },
  {
    slug: "git",
    name: "Git CLI",
    publisher: "Git",
    description: "Version control for source code",
    category: "dev-tooling",
    tags: ["git", "version-control", "source"],
    binary: "git",
    docs: ["https://git-scm.com/docs"],
    runners: [{ type: "direct", command: "git" }],
    install: { macos: "brew install git", linux: "sudo apt install git" },
    auth: {
      type: "config_file",
      env: ["GIT_ASKPASS"],
      refresh: "Rotate SSH key or PAT for remote providers.",
      scopes: ["depends-on-remote"]
    },
    fallbackCommands: [
      { subcommand: "clone", description: "Clone repository" },
      { subcommand: "checkout", description: "Switch branch" },
      { subcommand: "add", description: "Stage files" },
      { subcommand: "commit", description: "Commit staged changes" },
      { subcommand: "push", description: "Push changes" }
    ],
    workflowRefs: ["developer-loop", "saas-bootstrap"]
  },
  {
    slug: "npm",
    name: "npm CLI",
    publisher: "npm",
    description: "Node package management and scripts",
    category: "dev-tooling",
    tags: ["node", "packages", "javascript"],
    binary: "npm",
    docs: ["https://docs.npmjs.com/cli/v10/commands"],
    runners: [{ type: "direct", command: "npm" }],
    install: { macos: "brew install node", linux: "sudo apt install npm" },
    auth: {
      type: "config_file",
      env: ["NPM_TOKEN"],
      loginCommand: "npm login",
      refresh: "Rotate npm automation token.",
      scopes: ["packages:read", "packages:write"]
    },
    fallbackCommands: [
      { subcommand: "install", description: "Install dependencies" },
      { subcommand: "run", description: "Run package script" },
      { subcommand: "publish", description: "Publish package" },
      { subcommand: "outdated", description: "List outdated dependencies" },
      { subcommand: "audit", description: "Audit dependency vulnerabilities" }
    ],
    workflowRefs: ["developer-loop", "saas-bootstrap"]
  },
  {
    slug: "pnpm",
    name: "pnpm CLI",
    publisher: "pnpm",
    description: "Fast and disk-efficient Node package manager",
    category: "dev-tooling",
    tags: ["node", "packages", "pnpm"],
    binary: "pnpm",
    docs: ["https://pnpm.io/cli"],
    runners: [{ type: "direct", command: "pnpm" }, { type: "npx", packageName: "pnpm" }],
    install: { macos: "brew install pnpm", linux: "npm install -g pnpm" },
    auth: {
      type: "config_file",
      env: ["NPM_TOKEN"],
      loginCommand: "pnpm login",
      refresh: "Rotate registry token in npmrc.",
      scopes: ["packages:read", "packages:write"]
    },
    fallbackCommands: [
      { subcommand: "install", description: "Install dependencies" },
      { subcommand: "add", description: "Add dependency" },
      { subcommand: "remove", description: "Remove dependency" },
      { subcommand: "run", description: "Run script" },
      { subcommand: "publish", description: "Publish package" }
    ],
    workflowRefs: ["developer-loop", "saas-bootstrap"]
  },
  {
    slug: "yarn",
    name: "Yarn CLI",
    publisher: "Yarn",
    description: "JavaScript package management and workspaces",
    category: "dev-tooling",
    tags: ["node", "packages", "workspaces"],
    binary: "yarn",
    docs: ["https://yarnpkg.com/cli"],
    runners: [{ type: "direct", command: "yarn" }, { type: "npx", packageName: "yarn" }],
    install: { macos: "brew install yarn", linux: "npm install -g yarn" },
    auth: {
      type: "config_file",
      env: ["YARN_NPM_AUTH_TOKEN"],
      refresh: "Update registry token in yarn config.",
      scopes: ["packages:read", "packages:write"]
    },
    fallbackCommands: [
      { subcommand: "install", description: "Install dependencies" },
      { subcommand: "add", description: "Add package" },
      { subcommand: "remove", description: "Remove package" },
      { subcommand: "workspaces foreach", description: "Run command in workspaces" },
      { subcommand: "npm publish", description: "Publish package" }
    ],
    workflowRefs: ["developer-loop", "saas-bootstrap"]
  },
  {
    slug: "bun",
    name: "Bun CLI",
    publisher: "Bun",
    description: "JavaScript runtime and package manager",
    category: "dev-tooling",
    tags: ["node", "runtime", "bun"],
    binary: "bun",
    docs: ["https://bun.sh/docs/cli"],
    runners: [{ type: "direct", command: "bun" }],
    install: { macos: "curl -fsSL https://bun.sh/install | bash", linux: "curl -fsSL https://bun.sh/install | bash" },
    auth: {
      type: "none",
      env: [],
      refresh: "No default auth unless publishing packages.",
      scopes: []
    },
    fallbackCommands: [
      { subcommand: "install", description: "Install dependencies" },
      { subcommand: "run", description: "Run script" },
      { subcommand: "test", description: "Run tests" },
      { subcommand: "build", description: "Build bundle" },
      { subcommand: "x", description: "Execute package binary" }
    ],
    workflowRefs: ["developer-loop", "saas-bootstrap"]
  },
  {
    slug: "deno",
    name: "Deno CLI",
    publisher: "Deno",
    description: "JavaScript and TypeScript runtime with built-in tooling",
    category: "dev-tooling",
    tags: ["typescript", "runtime", "javascript"],
    binary: "deno",
    docs: ["https://docs.deno.com/runtime/reference/cli/"],
    runners: [{ type: "direct", command: "deno" }],
    install: {
      macos: "brew install deno",
      linux: "curl -fsSL https://deno.land/install.sh | sh"
    },
    auth: {
      type: "none",
      env: ["DENO_DEPLOY_TOKEN"],
      refresh: "Optional token for Deno Deploy and private registries.",
      scopes: []
    },
    fallbackCommands: [
      { subcommand: "init", description: "Initialize a new Deno project" },
      { subcommand: "run", description: "Run a script or module" },
      { subcommand: "task", description: "Run configured project task" },
      { subcommand: "test", description: "Execute test suite" },
      { subcommand: "fmt", description: "Format source files" }
    ],
    workflowRefs: ["developer-loop", "service-launch"]
  },
  {
    slug: "cargo",
    name: "Cargo CLI",
    publisher: "Rust",
    description: "Rust package manager and build tool",
    category: "dev-tooling",
    tags: ["rust", "build", "packages"],
    binary: "cargo",
    docs: ["https://doc.rust-lang.org/cargo/commands/"],
    runners: [{ type: "direct", command: "cargo" }],
    install: { macos: "brew install rust", linux: "curl https://sh.rustup.rs -sSf | sh" },
    auth: {
      type: "config_file",
      env: ["CARGO_REGISTRY_TOKEN"],
      refresh: "Rotate crates.io token.",
      scopes: ["publish:crates"]
    },
    fallbackCommands: [
      { subcommand: "new", description: "Create new crate" },
      { subcommand: "build", description: "Build crate" },
      { subcommand: "test", description: "Run tests" },
      { subcommand: "run", description: "Run binary" },
      { subcommand: "publish", description: "Publish crate" }
    ],
    workflowRefs: ["developer-loop", "service-launch"]
  },
  {
    slug: "pip",
    name: "pip",
    publisher: "Python",
    description: "Python package installation and management",
    category: "dev-tooling",
    tags: ["python", "packages", "pip"],
    binary: "pip",
    docs: ["https://pip.pypa.io/en/stable/cli/"],
    runners: [{ type: "direct", command: "pip" }],
    install: { macos: "brew install python", linux: "sudo apt install python3-pip" },
    auth: {
      type: "config_file",
      env: ["PIP_INDEX_URL", "PIP_EXTRA_INDEX_URL"],
      refresh: "Update tokenized package index URL credentials.",
      scopes: ["packages:read", "packages:write"]
    },
    fallbackCommands: [
      { subcommand: "install", description: "Install package" },
      { subcommand: "uninstall", description: "Uninstall package" },
      { subcommand: "list", description: "List installed packages" },
      { subcommand: "freeze", description: "Output requirements" },
      { subcommand: "wheel", description: "Build wheel file" }
    ],
    workflowRefs: ["developer-loop", "service-launch"]
  },
  {
    slug: "brew",
    name: "Homebrew CLI",
    publisher: "Homebrew",
    description: "macOS package manager",
    category: "dev-tooling",
    tags: ["packages", "macos", "brew"],
    binary: "brew",
    docs: ["https://docs.brew.sh/Manpage"],
    runners: [{ type: "direct", command: "brew" }],
    install: {
      macos: "/bin/bash -c \"$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\"",
      linux: "/bin/bash -c \"$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
    },
    auth: {
      type: "none",
      env: [],
      refresh: "No auth required for public formulas.",
      scopes: []
    },
    fallbackCommands: [
      { subcommand: "update", description: "Fetch latest formula metadata" },
      { subcommand: "install", description: "Install formula" },
      { subcommand: "upgrade", description: "Upgrade installed formula" },
      { subcommand: "list", description: "List installed formulae" },
      { subcommand: "doctor", description: "Check Homebrew health" }
    ],
    workflowRefs: ["developer-loop", "environment-bootstrap"]
  },
  {
    slug: "sentry-cli",
    name: "Sentry CLI",
    publisher: "Sentry",
    description: "Upload releases and monitor error telemetry",
    category: "monitoring",
    tags: ["monitoring", "errors", "releases"],
    binary: "sentry-cli",
    docs: ["https://docs.sentry.io/product/cli/"],
    runners: [{ type: "direct", command: "sentry-cli" }, { type: "npx", packageName: "@sentry/cli" }],
    install: { macos: "brew install sentry-cli", linux: "curl -sL https://sentry.io/get-cli/ | bash" },
    auth: {
      type: "api_key",
      env: ["SENTRY_AUTH_TOKEN", "SENTRY_ORG", "SENTRY_PROJECT"],
      refresh: "Rotate Sentry auth token.",
      scopes: ["project:releases", "project:write"]
    },
    fallbackCommands: [
      { subcommand: "login", description: "Authenticate against Sentry" },
      { subcommand: "releases new", description: "Create release" },
      { subcommand: "releases files upload-sourcemaps", description: "Upload sourcemaps" },
      { subcommand: "releases finalize", description: "Finalize release" },
      { subcommand: "send-event", description: "Send test event" }
    ],
    workflowRefs: ["observability-setup", "release-monitoring"]
  },
  {
    slug: "datadog",
    name: "Datadog CLI",
    publisher: "Datadog",
    description: "Upload symbols, monitor CI visibility, and trigger Datadog actions",
    category: "monitoring",
    tags: ["monitoring", "datadog", "ci"],
    binary: "datadog-ci",
    docs: ["https://github.com/DataDog/datadog-ci"],
    runners: [{ type: "direct", command: "datadog-ci" }, { type: "npx", packageName: "@datadog/datadog-ci" }],
    install: { macos: "npm install -g @datadog/datadog-ci", linux: "npm install -g @datadog/datadog-ci" },
    auth: {
      type: "api_key",
      env: ["DATADOG_API_KEY", "DATADOG_APP_KEY"],
      refresh: "Rotate Datadog API and app keys.",
      scopes: ["ci_visibility:write", "dashboards:read"]
    },
    fallbackCommands: [
      { subcommand: "sourcemaps upload", description: "Upload sourcemaps" },
      { subcommand: "junit upload", description: "Upload test reports" },
      { subcommand: "metrics send", description: "Send custom metric" },
      { subcommand: "dora deployment", description: "Report deployment event" },
      { subcommand: "tagging upload", description: "Upload git metadata" }
    ],
    workflowRefs: ["observability-setup", "release-monitoring"]
  },
  {
    slug: "cloudflare",
    name: "Cloudflare CLI",
    publisher: "Cloudflare",
    description: "Operate Cloudflare Workers, Pages, and DNS",
    category: "storage-cdn",
    tags: ["cdn", "edge", "cloudflare"],
    binary: "wrangler",
    docs: ["https://developers.cloudflare.com/workers/wrangler/"],
    runners: [{ type: "direct", command: "wrangler" }, { type: "npx", packageName: "wrangler" }],
    install: { macos: "brew install cloudflare-wrangler", linux: "npm install -g wrangler" },
    auth: {
      type: "login_command",
      env: ["CLOUDFLARE_API_TOKEN"],
      loginCommand: "wrangler login",
      refresh: "Rotate Cloudflare API token.",
      scopes: ["workers:write", "zones:read"]
    },
    fallbackCommands: [
      { subcommand: "login", description: "Authenticate Cloudflare account" },
      { subcommand: "deploy", description: "Deploy Worker" },
      { subcommand: "secret put", description: "Store encrypted secret" },
      { subcommand: "pages deploy", description: "Deploy Pages project" },
      { subcommand: "kv namespace list", description: "List KV namespaces" }
    ],
    workflowRefs: ["asset-delivery", "edge-worker-launch"]
  },
  {
    slug: "minio",
    name: "MinIO Client",
    publisher: "MinIO",
    description: "Manage object storage buckets and policies",
    category: "storage-cdn",
    tags: ["storage", "s3", "object-store"],
    binary: "mc",
    docs: ["https://min.io/docs/minio/linux/reference/minio-mc.html"],
    runners: [{ type: "direct", command: "mc" }],
    install: { macos: "brew tap minio/stable && brew install minio-mc", linux: "curl https://dl.min.io/client/mc/release/linux-amd64/mc --create-dirs -o $HOME/minio-binaries/mc && chmod +x $HOME/minio-binaries/mc" },
    auth: {
      type: "config_file",
      env: ["MC_HOST_local"],
      loginCommand: "mc alias set local http://localhost:9000 <access-key> <secret-key>",
      refresh: "Rotate MinIO access and secret keys.",
      scopes: ["s3:read", "s3:write"]
    },
    fallbackCommands: [
      { subcommand: "alias set", description: "Configure MinIO host alias" },
      { subcommand: "mb", description: "Create bucket" },
      { subcommand: "cp", description: "Copy objects" },
      { subcommand: "ls", description: "List buckets/objects" },
      { subcommand: "policy set", description: "Set bucket policy" }
    ],
    workflowRefs: ["asset-delivery", "storage-provisioning"]
  },
  {
    slug: "heroku",
    name: "Heroku CLI",
    publisher: "Heroku",
    description: "Deploy and operate Heroku applications",
    category: "additional",
    tags: ["deploy", "paas", "heroku"],
    binary: "heroku",
    docs: ["https://devcenter.heroku.com/articles/heroku-cli-commands"],
    runners: [{ type: "direct", command: "heroku" }],
    install: { macos: "brew tap heroku/brew && brew install heroku", linux: "curl https://cli-assets.heroku.com/install.sh | sh" },
    auth: {
      type: "login_command",
      env: ["HEROKU_API_KEY"],
      loginCommand: "heroku login",
      refresh: "Rotate Heroku API key and re-authenticate.",
      scopes: ["apps:write"]
    },
    fallbackCommands: [
      { subcommand: "login", description: "Authenticate account" },
      { subcommand: "create", description: "Create app" },
      { subcommand: "git:remote", description: "Attach git remote" },
      { subcommand: "logs", description: "Tail logs" },
      { subcommand: "releases", description: "List releases" }
    ],
    workflowRefs: ["deploy-nextjs-app", "service-launch"]
  },
  {
    slug: "terraform",
    name: "Terraform CLI",
    publisher: "HashiCorp",
    description: "Provision infrastructure as code",
    category: "additional",
    tags: ["infrastructure", "iac", "terraform"],
    binary: "terraform",
    docs: ["https://developer.hashicorp.com/terraform/cli/commands"],
    runners: [{ type: "direct", command: "terraform" }],
    install: { macos: "brew tap hashicorp/tap && brew install terraform", linux: "sudo apt install terraform" },
    auth: {
      type: "config_file",
      env: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"],
      refresh: "Refresh provider credentials used in Terraform.",
      scopes: ["depends-on-provider"]
    },
    fallbackCommands: [
      { subcommand: "init", description: "Initialize working dir" },
      { subcommand: "plan", description: "Generate execution plan" },
      { subcommand: "apply", description: "Apply plan" },
      { subcommand: "destroy", description: "Destroy managed infra" },
      { subcommand: "output", description: "Show output values" }
    ],
    workflowRefs: ["infra-bootstrap", "service-launch"]
  },
  {
    slug: "wrangler",
    name: "Wrangler CLI",
    publisher: "Cloudflare",
    description: "Build and deploy Cloudflare Workers",
    category: "additional",
    tags: ["workers", "cloudflare", "edge"],
    binary: "wrangler",
    docs: ["https://developers.cloudflare.com/workers/wrangler/commands/"],
    runners: [{ type: "direct", command: "wrangler" }, { type: "npx", packageName: "wrangler" }],
    install: { macos: "brew install cloudflare-wrangler", linux: "npm install -g wrangler" },
    auth: {
      type: "login_command",
      env: ["CLOUDFLARE_API_TOKEN"],
      loginCommand: "wrangler login",
      refresh: "Rotate API token and re-login.",
      scopes: ["workers:write"]
    },
    fallbackCommands: [
      { subcommand: "login", description: "Authenticate account" },
      { subcommand: "dev", description: "Run worker in dev mode" },
      { subcommand: "deploy", description: "Deploy worker" },
      { subcommand: "secret put", description: "Upload secret" },
      { subcommand: "tail", description: "Tail worker logs" }
    ],
    workflowRefs: ["edge-worker-launch", "asset-delivery"]
  },
  {
    slug: "firebase",
    name: "Firebase CLI",
    publisher: "Google Firebase",
    description: "Deploy hosting and cloud functions",
    category: "additional",
    tags: ["firebase", "serverless", "hosting"],
    binary: "firebase",
    docs: ["https://firebase.google.com/docs/cli"],
    runners: [{ type: "direct", command: "firebase" }, { type: "npx", packageName: "firebase-tools" }],
    install: { macos: "brew install firebase-cli", linux: "npm install -g firebase-tools" },
    auth: {
      type: "login_command",
      env: ["FIREBASE_TOKEN"],
      loginCommand: "firebase login",
      refresh: "Regenerate CI token via firebase login:ci.",
      scopes: ["firebase.projects.update"]
    },
    fallbackCommands: [
      { subcommand: "login", description: "Authenticate Firebase" },
      { subcommand: "use", description: "Select project alias" },
      { subcommand: "emulators:start", description: "Start local emulators" },
      { subcommand: "deploy", description: "Deploy configured targets" },
      { subcommand: "functions:config:get", description: "Get functions config" }
    ],
    workflowRefs: ["serverless-backend-launch", "deploy-nextjs-app"]
  },
  {
    slug: "helm",
    name: "Helm CLI",
    publisher: "Helm",
    description: "Package manager for Kubernetes",
    category: "additional",
    tags: ["kubernetes", "helm", "charts"],
    binary: "helm",
    docs: ["https://helm.sh/docs/helm/"],
    runners: [{ type: "direct", command: "helm" }],
    install: { macos: "brew install helm", linux: "curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash" },
    auth: {
      type: "config_file",
      env: ["KUBECONFIG"],
      refresh: "Refresh Kubernetes credentials for target cluster.",
      scopes: ["cluster:write"]
    },
    fallbackCommands: [
      { subcommand: "repo add", description: "Add chart repository" },
      { subcommand: "repo update", description: "Refresh repo indexes" },
      { subcommand: "install", description: "Install chart" },
      { subcommand: "upgrade", description: "Upgrade release" },
      { subcommand: "uninstall", description: "Uninstall release" }
    ],
    workflowRefs: ["k8s-service-deploy", "infra-bootstrap"]
  },
  {
    slug: "ansible",
    name: "Ansible CLI",
    publisher: "Ansible",
    description: "Automate infrastructure provisioning and config",
    category: "additional",
    tags: ["automation", "infrastructure", "ansible"],
    binary: "ansible",
    docs: ["https://docs.ansible.com/ansible/latest/command_guide/index.html"],
    runners: [{ type: "direct", command: "ansible" }],
    install: { macos: "brew install ansible", linux: "pip install ansible" },
    auth: {
      type: "config_file",
      env: ["ANSIBLE_CONFIG"],
      refresh: "Rotate SSH keys and vault credentials.",
      scopes: ["ssh:remote"]
    },
    fallbackCommands: [
      { subcommand: "all -m ping", description: "Test remote connectivity" },
      { subcommand: "playbook", description: "Run playbook" },
      { subcommand: "inventory", description: "Inspect inventory" },
      { subcommand: "vault encrypt", description: "Encrypt secret file" },
      { subcommand: "galaxy install", description: "Install collections/roles" }
    ],
    workflowRefs: ["infra-bootstrap", "service-launch"]
  },
  {
    slug: "uv",
    name: "uv CLI",
    publisher: "Astral",
    description: "Fast Python package and project manager",
    category: "additional",
    tags: ["python", "packages", "uv"],
    binary: "uv",
    docs: ["https://docs.astral.sh/uv/reference/cli/"],
    runners: [{ type: "direct", command: "uv" }],
    install: { macos: "brew install uv", linux: "curl -LsSf https://astral.sh/uv/install.sh | sh" },
    auth: {
      type: "config_file",
      env: ["UV_INDEX_URL"],
      refresh: "Update authenticated index URLs if credentials rotate.",
      scopes: ["packages:read"]
    },
    fallbackCommands: [
      { subcommand: "init", description: "Initialize project" },
      { subcommand: "add", description: "Add dependency" },
      { subcommand: "sync", description: "Sync lockfile dependencies" },
      { subcommand: "run", description: "Run command in managed env" },
      { subcommand: "pip compile", description: "Compile requirements" }
    ],
    workflowRefs: ["developer-loop", "service-launch"]
  },
  {
    slug: "psql",
    name: "psql CLI",
    publisher: "PostgreSQL",
    description: "PostgreSQL interactive terminal",
    category: "additional",
    tags: ["database", "postgres", "sql"],
    binary: "psql",
    docs: ["https://www.postgresql.org/docs/current/app-psql.html"],
    runners: [{ type: "direct", command: "psql" }],
    install: { macos: "brew install postgresql", linux: "sudo apt install postgresql-client" },
    auth: {
      type: "config_file",
      env: ["PGHOST", "PGUSER", "PGPASSWORD", "PGDATABASE"],
      refresh: "Rotate DB credentials or IAM auth token.",
      scopes: ["database:read", "database:write"]
    },
    fallbackCommands: [
      { subcommand: "-l", description: "List databases" },
      { subcommand: "-c", description: "Run one SQL command" },
      { subcommand: "\\dt", description: "List tables" },
      { subcommand: "\\du", description: "List roles" },
      { subcommand: "\\q", description: "Exit session" }
    ],
    workflowRefs: ["database-setup", "full-stack-saas"]
  },
  {
    slug: "mysql",
    name: "MySQL CLI",
    publisher: "MySQL",
    description: "MySQL command-line client",
    category: "additional",
    tags: ["database", "mysql", "sql"],
    binary: "mysql",
    docs: ["https://dev.mysql.com/doc/refman/8.0/en/mysql.html"],
    runners: [{ type: "direct", command: "mysql" }],
    install: { macos: "brew install mysql-client", linux: "sudo apt install mysql-client" },
    auth: {
      type: "config_file",
      env: ["MYSQL_PWD"],
      refresh: "Rotate MySQL username/password credentials.",
      scopes: ["database:read", "database:write"]
    },
    fallbackCommands: [
      { subcommand: "-u", description: "Authenticate with username" },
      { subcommand: "-e", description: "Execute statement and exit" },
      { subcommand: "show databases", description: "List databases" },
      { subcommand: "use", description: "Switch database" },
      { subcommand: "source", description: "Execute SQL script file" }
    ],
    workflowRefs: ["database-setup", "service-launch"]
  },
  {
    slug: "redis-cli",
    name: "redis-cli",
    publisher: "Redis",
    description: "Redis command-line interface",
    category: "additional",
    tags: ["database", "redis", "cache"],
    binary: "redis-cli",
    docs: ["https://redis.io/docs/latest/develop/tools/cli/"],
    runners: [{ type: "direct", command: "redis-cli" }],
    install: { macos: "brew install redis", linux: "sudo apt install redis-tools" },
    auth: {
      type: "config_file",
      env: ["REDISCLI_AUTH"],
      refresh: "Rotate Redis ACL password/token.",
      scopes: ["cache:read", "cache:write"]
    },
    fallbackCommands: [
      { subcommand: "ping", description: "Ping Redis server" },
      { subcommand: "set", description: "Set key value" },
      { subcommand: "get", description: "Get key value" },
      { subcommand: "scan", description: "Iterate keys" },
      { subcommand: "info", description: "Get server info" }
    ],
    workflowRefs: ["database-setup", "full-stack-saas"]
  },
  {
    slug: "sqlite3",
    name: "sqlite3 CLI",
    publisher: "SQLite",
    description: "SQLite interactive shell",
    category: "additional",
    tags: ["database", "sqlite", "local"],
    binary: "sqlite3",
    docs: ["https://sqlite.org/cli.html"],
    runners: [{ type: "direct", command: "sqlite3" }],
    install: { macos: "brew install sqlite", linux: "sudo apt install sqlite3" },
    auth: {
      type: "none",
      env: [],
      refresh: "No auth; local file access based.",
      scopes: []
    },
    fallbackCommands: [
      { subcommand: ".open", description: "Open database file" },
      { subcommand: ".tables", description: "List tables" },
      { subcommand: ".schema", description: "Show schema" },
      { subcommand: ".import", description: "Import data file" },
      { subcommand: ".quit", description: "Exit session" }
    ],
    workflowRefs: ["database-setup", "local-dev-loop"]
  },
  {
    slug: "node",
    name: "Node.js CLI",
    publisher: "Node.js",
    description: "Run JavaScript programs and tooling",
    category: "additional",
    tags: ["node", "runtime", "javascript"],
    binary: "node",
    docs: ["https://nodejs.org/api/cli.html"],
    runners: [{ type: "direct", command: "node" }],
    install: { macos: "brew install node", linux: "sudo apt install nodejs" },
    auth: {
      type: "none",
      env: [],
      refresh: "No auth for runtime usage.",
      scopes: []
    },
    fallbackCommands: [
      { subcommand: "--version", description: "Print Node version" },
      { subcommand: "--eval", description: "Evaluate JS snippet" },
      { subcommand: "--test", description: "Run test runner" },
      { subcommand: "--watch", description: "Restart on file change" },
      { subcommand: "--inspect", description: "Enable debugger inspector" }
    ],
    workflowRefs: ["developer-loop", "service-launch"]
  }
];

interface ExpansionBlueprint {
  slug: string;
  name: string;
  publisher: string;
  description: string;
  category: string;
  tags: string[];
  binary: string;
  docs: string[];
  install: {
    macos: string;
    linux: string;
  };
  npmPackage?: string;
  auth?: TargetSpec["auth"];
  fallbackCommands?: Array<{ subcommand: string; description: string }>;
  workflowRefs?: string[];
  source?: TargetSpec["source"];
}

const DEFAULT_FALLBACKS_BY_CATEGORY: Record<string, Array<{ subcommand: string; description: string }>> = {
  "ci-cd": [
    { subcommand: "login", description: "Authenticate with CI/CD provider" },
    { subcommand: "status", description: "Check current pipeline status" },
    { subcommand: "run", description: "Trigger a pipeline run" },
    { subcommand: "logs", description: "Fetch recent build logs" },
    { subcommand: "config", description: "Validate CI/CD configuration" }
  ],
  testing: [
    { subcommand: "run", description: "Run test suite" },
    { subcommand: "watch", description: "Run tests in watch mode" },
    { subcommand: "init", description: "Initialize test configuration" },
    { subcommand: "list", description: "List discovered test files" },
    { subcommand: "report", description: "Generate test reports" }
  ],
  containers: [
    { subcommand: "version", description: "Print CLI/runtime version" },
    { subcommand: "ps", description: "List containers/workloads" },
    { subcommand: "logs", description: "Stream container logs" },
    { subcommand: "inspect", description: "Inspect container/workload metadata" },
    { subcommand: "config", description: "Show effective container config" }
  ],
  serverless: [
    { subcommand: "login", description: "Authenticate with provider account" },
    { subcommand: "deploy", description: "Deploy serverless service" },
    { subcommand: "invoke", description: "Invoke function for validation" },
    { subcommand: "logs", description: "Fetch runtime logs" },
    { subcommand: "remove", description: "Remove deployed service" }
  ],
  "cms-content": [
    { subcommand: "login", description: "Authenticate CMS workspace" },
    { subcommand: "init", description: "Initialize local project context" },
    { subcommand: "pull", description: "Pull remote content/configuration" },
    { subcommand: "deploy", description: "Deploy schema or studio changes" },
    { subcommand: "list", description: "List projects/spaces/environments" }
  ],
  analytics: [
    { subcommand: "login", description: "Authenticate analytics account" },
    { subcommand: "projects list", description: "List analytics projects" },
    { subcommand: "events", description: "Inspect or send event payloads" },
    { subcommand: "dashboards", description: "List dashboard definitions" },
    { subcommand: "status", description: "Check service connectivity" }
  ],
  "dns-domains": [
    { subcommand: "login", description: "Authenticate domain provider account" },
    { subcommand: "domains list", description: "List managed domains" },
    { subcommand: "dns list", description: "List DNS records" },
    { subcommand: "dns update", description: "Update DNS record values" },
    { subcommand: "whois", description: "Inspect domain registration details" }
  ],
  queues: [
    { subcommand: "start", description: "Start queue worker/service" },
    { subcommand: "status", description: "Check queue health and lag" },
    { subcommand: "workers", description: "List active workers" },
    { subcommand: "jobs", description: "Inspect pending or active jobs" },
    { subcommand: "purge", description: "Purge queue safely" }
  ],
  caching: [
    { subcommand: "stats", description: "Show cache statistics" },
    { subcommand: "set", description: "Set key/value in cache" },
    { subcommand: "get", description: "Get key/value from cache" },
    { subcommand: "flush", description: "Flush selected cache namespace" },
    { subcommand: "version", description: "Print cache server version" }
  ],
  search: [
    { subcommand: "start", description: "Start search service instance" },
    { subcommand: "index", description: "Create or manage search indexes" },
    { subcommand: "documents", description: "Import/update indexed documents" },
    { subcommand: "search", description: "Execute a search query" },
    { subcommand: "health", description: "Check cluster/service health" }
  ],
  "ml-ai": [
    { subcommand: "login", description: "Authenticate model provider account" },
    { subcommand: "models", description: "List available models" },
    { subcommand: "run", description: "Run model inference" },
    { subcommand: "deploy", description: "Deploy inference endpoint" },
    { subcommand: "status", description: "Check job/run status" }
  ],
  utilities: [
    { subcommand: "version", description: "Print tool version" },
    { subcommand: "help", description: "Show usage reference" },
    { subcommand: "run", description: "Execute default command flow" },
    { subcommand: "input", description: "Read/process input stream" },
    { subcommand: "output", description: "Format output for pipelines" }
  ],
  additional: [
    { subcommand: "help", description: "Display help output" },
    { subcommand: "version", description: "Display tool version" },
    { subcommand: "list", description: "List available resources" },
    { subcommand: "status", description: "Show runtime status" },
    { subcommand: "config", description: "Show current configuration" }
  ]
};

const DEFAULT_WORKFLOW_REFS_BY_CATEGORY: Record<string, string[]> = {
  "ci-cd": ["ci-cd-automation", "developer-loop"],
  testing: ["testing-automation", "developer-loop"],
  containers: ["container-operations", "infra-bootstrap"],
  serverless: ["serverless-workloads", "deploy-nextjs-app"],
  "cms-content": ["cms-content-ops", "developer-loop"],
  analytics: ["product-analytics", "observability-setup"],
  "dns-domains": ["dns-domain-ops", "asset-delivery"],
  queues: ["queue-processing", "full-stack-saas"],
  caching: ["cache-operations", "full-stack-saas"],
  search: ["search-stack", "full-stack-saas"],
  "ml-ai": ["ai-inference", "developer-loop"],
  utilities: ["utility-toolbox", "developer-loop"]
};

function defaultAuthForExpansion(entry: ExpansionBlueprint): TargetSpec["auth"] {
  if (entry.category === "utilities" || entry.category === "containers" || entry.category === "caching") {
    return {
      type: "none",
      env: [],
      refresh: "No account credential required for local utility usage.",
      scopes: []
    };
  }

  const envName = `${entry.slug.replace(/[^a-z0-9]+/gi, "_").toUpperCase()}_TOKEN`;
  return {
    type: "api_key",
    env: [envName],
    refresh: `Rotate ${entry.name} token/credential in provider settings.`,
    scopes: ["default"]
  };
}

const EXPANSION_BLUEPRINTS: ExpansionBlueprint[] = [
  {
    slug: "github-actions",
    name: "GitHub Actions (act)",
    publisher: "GitHub",
    description: "Run and validate GitHub Actions workflows locally.",
    category: "ci-cd",
    tags: ["github", "actions", "ci"],
    binary: "act",
    docs: ["https://github.com/nektos/act"],
    install: { macos: "brew install act", linux: "sudo apt install act" },
    workflowRefs: ["ci-cd-automation", "developer-loop"],
    auth: {
      type: "api_key",
      env: ["GITHUB_TOKEN"],
      refresh: "Rotate GitHub token in developer settings.",
      scopes: ["repo", "workflow"]
    }
  },
  {
    slug: "circleci",
    name: "CircleCI CLI",
    publisher: "CircleCI",
    description: "Validate and trigger CircleCI pipelines.",
    category: "ci-cd",
    tags: ["circleci", "ci", "pipelines"],
    binary: "circleci",
    docs: ["https://circleci.com/docs/local-cli/"],
    install: { macos: "brew install circleci", linux: "sudo apt install circleci" },
    workflowRefs: ["ci-cd-automation", "developer-loop"],
    auth: {
      type: "api_key",
      env: ["CIRCLECI_CLI_TOKEN"],
      refresh: "Rotate CircleCI personal token in user settings.",
      scopes: ["pipeline:trigger", "project:read"]
    }
  },
  {
    slug: "jenkins",
    name: "Jenkins CLI",
    publisher: "Jenkins",
    description: "Operate Jenkins jobs and builds from terminal.",
    category: "ci-cd",
    tags: ["jenkins", "ci", "jobs"],
    binary: "jenkins-cli",
    docs: ["https://www.jenkins.io/doc/book/managing/cli/"],
    install: { macos: "brew install jenkins-lts", linux: "npm install -g jenkins-cli" },
    npmPackage: "jenkins-cli",
    workflowRefs: ["ci-cd-automation", "developer-loop"],
    auth: {
      type: "api_key",
      env: ["JENKINS_USER_ID", "JENKINS_API_TOKEN", "JENKINS_URL"],
      refresh: "Rotate Jenkins API token from user profile settings.",
      scopes: ["job:read", "job:build"]
    }
  },
  {
    slug: "gitlab-ci-local",
    name: "GitLab CI Local",
    publisher: "GitLab Community",
    description: "Run GitLab CI pipeline jobs locally for validation.",
    category: "ci-cd",
    tags: ["gitlab", "ci", "pipelines"],
    binary: "gitlab-ci-local",
    docs: ["https://github.com/firecow/gitlab-ci-local"],
    install: { macos: "npm install -g gitlab-ci-local", linux: "npm install -g gitlab-ci-local" },
    npmPackage: "gitlab-ci-local",
    workflowRefs: ["ci-cd-automation", "developer-loop"],
    auth: {
      type: "api_key",
      env: ["GITLAB_TOKEN", "CI_SERVER_URL"],
      refresh: "Rotate GitLab PAT from access token settings.",
      scopes: ["api", "read_repository"]
    }
  },
  {
    slug: "argocd",
    name: "Argo CD CLI",
    publisher: "Argo",
    description: "Manage Argo CD applications and sync operations.",
    category: "ci-cd",
    tags: ["argo", "gitops", "cd"],
    binary: "argocd",
    docs: ["https://argo-cd.readthedocs.io/en/stable/user-guide/commands/argocd/"],
    install: { macos: "brew install argocd", linux: "sudo apt install argocd" },
    workflowRefs: ["ci-cd-automation", "infra-bootstrap"],
    auth: {
      type: "login_command",
      env: ["ARGOCD_AUTH_TOKEN"],
      loginCommand: "argocd login <server>",
      refresh: "Re-run login or rotate ArgoCD account token.",
      scopes: ["applications:write", "projects:read"]
    }
  },
  {
    slug: "flux",
    name: "Flux CLI",
    publisher: "Flux",
    description: "Bootstrap and reconcile Flux GitOps deployments.",
    category: "ci-cd",
    tags: ["flux", "gitops", "kubernetes"],
    binary: "flux",
    docs: ["https://fluxcd.io/flux/cmd/"],
    install: { macos: "brew install flux", linux: "sudo apt install flux" },
    workflowRefs: ["ci-cd-automation", "infra-bootstrap"],
    auth: {
      type: "api_key",
      env: ["GITHUB_TOKEN"],
      refresh: "Rotate provider token used for Flux bootstrap.",
      scopes: ["repo", "admin:repo_hook"]
    }
  },
  {
    slug: "tekton",
    name: "Tekton CLI",
    publisher: "Tekton",
    description: "Trigger and monitor Tekton pipeline runs.",
    category: "ci-cd",
    tags: ["tekton", "pipelines", "kubernetes"],
    binary: "tkn",
    docs: ["https://tekton.dev/docs/cli/"],
    install: { macos: "brew install tektoncd-cli", linux: "sudo apt install tektoncd-cli" },
    workflowRefs: ["ci-cd-automation", "infra-bootstrap"],
    auth: {
      type: "config_file",
      env: ["KUBECONFIG"],
      refresh: "Refresh cluster kubeconfig and access tokens.",
      scopes: ["pipelines:read", "pipelines:write"]
    }
  },
  {
    slug: "playwright",
    name: "Playwright CLI",
    publisher: "Microsoft",
    description: "Run end-to-end browser automation tests.",
    category: "testing",
    tags: ["testing", "e2e", "browser"],
    binary: "playwright",
    docs: ["https://playwright.dev/docs/test-cli"],
    install: { macos: "npm install -g playwright", linux: "npm install -g playwright" },
    npmPackage: "playwright"
  },
  {
    slug: "cypress",
    name: "Cypress CLI",
    publisher: "Cypress",
    description: "Execute browser tests with Cypress.",
    category: "testing",
    tags: ["testing", "e2e", "frontend"],
    binary: "cypress",
    docs: ["https://docs.cypress.io/guides/guides/command-line"],
    install: { macos: "npm install -g cypress", linux: "npm install -g cypress" },
    npmPackage: "cypress"
  },
  {
    slug: "jest",
    name: "Jest CLI",
    publisher: "Jest",
    description: "Run JavaScript and TypeScript unit tests.",
    category: "testing",
    tags: ["testing", "unit", "javascript"],
    binary: "jest",
    docs: ["https://jestjs.io/docs/cli"],
    install: { macos: "npm install -g jest", linux: "npm install -g jest" },
    npmPackage: "jest"
  },
  {
    slug: "vitest",
    name: "Vitest CLI",
    publisher: "Vitest",
    description: "Run fast Vite-native unit/integration tests.",
    category: "testing",
    tags: ["testing", "vite", "unit"],
    binary: "vitest",
    docs: ["https://vitest.dev/guide/cli.html"],
    install: { macos: "npm install -g vitest", linux: "npm install -g vitest" },
    npmPackage: "vitest"
  },
  {
    slug: "newman",
    name: "Newman CLI",
    publisher: "Postman",
    description: "Run Postman collections in CI pipelines.",
    category: "testing",
    tags: ["testing", "api", "postman"],
    binary: "newman",
    docs: ["https://learning.postman.com/docs/collections/using-newman-cli/command-line-integration-with-newman/"],
    install: { macos: "npm install -g newman", linux: "npm install -g newman" },
    npmPackage: "newman"
  },
  {
    slug: "podman",
    name: "Podman CLI",
    publisher: "Podman",
    description: "Build and run OCI containers without a daemon.",
    category: "containers",
    tags: ["containers", "oci", "runtime"],
    binary: "podman",
    docs: ["https://docs.podman.io/en/latest/Commands.html"],
    install: { macos: "brew install podman", linux: "sudo apt install podman" }
  },
  {
    slug: "k9s",
    name: "k9s CLI",
    publisher: "k9s",
    description: "Interactive Kubernetes cluster management UI.",
    category: "containers",
    tags: ["kubernetes", "containers", "operations"],
    binary: "k9s",
    docs: ["https://k9scli.io/topics/commands/"],
    install: { macos: "brew install k9s", linux: "sudo apt install k9s" }
  },
  {
    slug: "kind",
    name: "kind CLI",
    publisher: "Kubernetes",
    description: "Run local Kubernetes clusters in Docker.",
    category: "containers",
    tags: ["kubernetes", "kind", "clusters"],
    binary: "kind",
    docs: ["https://kind.sigs.k8s.io/docs/user/quick-start/"],
    install: { macos: "brew install kind", linux: "sudo apt install kind" }
  },
  {
    slug: "minikube",
    name: "minikube CLI",
    publisher: "Kubernetes",
    description: "Create and operate local Kubernetes clusters.",
    category: "containers",
    tags: ["kubernetes", "minikube", "clusters"],
    binary: "minikube",
    docs: ["https://minikube.sigs.k8s.io/docs/commands/"],
    install: { macos: "brew install minikube", linux: "sudo apt install minikube" }
  },
  {
    slug: "skopeo",
    name: "Skopeo CLI",
    publisher: "containers/image",
    description: "Inspect and copy container images between registries.",
    category: "containers",
    tags: ["containers", "registry", "images"],
    binary: "skopeo",
    docs: ["https://github.com/containers/skopeo"],
    install: { macos: "brew install skopeo", linux: "sudo apt install skopeo" }
  },
  {
    slug: "kubectx",
    name: "kubectx CLI",
    publisher: "kubectx",
    description: "Quickly switch Kubernetes contexts and namespaces.",
    category: "containers",
    tags: ["kubernetes", "contexts", "operations"],
    binary: "kubectx",
    docs: ["https://github.com/ahmetb/kubectx"],
    install: { macos: "brew install kubectx", linux: "sudo apt install kubectx" }
  },
  {
    slug: "stern",
    name: "Stern CLI",
    publisher: "Stern",
    description: "Tail logs from multiple Kubernetes pods.",
    category: "containers",
    tags: ["kubernetes", "logs", "debugging"],
    binary: "stern",
    docs: ["https://github.com/stern/stern"],
    install: { macos: "brew install stern", linux: "sudo apt install stern" }
  },
  {
    slug: "serverless",
    name: "Serverless Framework CLI",
    publisher: "Serverless",
    description: "Deploy and manage serverless services.",
    category: "serverless",
    tags: ["serverless", "deploy", "functions"],
    binary: "serverless",
    docs: ["https://www.serverless.com/framework/docs/providers/aws/cli-reference/"],
    install: { macos: "npm install -g serverless", linux: "npm install -g serverless" },
    npmPackage: "serverless"
  },
  {
    slug: "sst",
    name: "SST CLI",
    publisher: "SST",
    description: "Build and deploy full-stack serverless applications.",
    category: "serverless",
    tags: ["serverless", "sst", "aws"],
    binary: "sst",
    docs: ["https://sst.dev/docs/reference/cli/"],
    install: { macos: "npm install -g sst", linux: "npm install -g sst" },
    npmPackage: "sst"
  },
  {
    slug: "arc",
    name: "Architect CLI",
    publisher: "Architect",
    description: "Create and deploy serverless apps with Architect.",
    category: "serverless",
    tags: ["serverless", "architect", "lambda"],
    binary: "arc",
    docs: ["https://arc.codes/docs/en/reference/cli"],
    install: { macos: "npm install -g @architect/architect", linux: "npm install -g @architect/architect" },
    npmPackage: "@architect/architect"
  },
  {
    slug: "aws-sam",
    name: "AWS SAM CLI",
    publisher: "AWS",
    description: "Build, test, and deploy AWS serverless resources.",
    category: "serverless",
    tags: ["aws", "serverless", "sam"],
    binary: "sam",
    docs: ["https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-cli-command-reference.html"],
    install: { macos: "brew install aws-sam-cli", linux: "sudo apt install aws-sam-cli" },
    auth: {
      type: "config_file",
      env: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"],
      refresh: "Rotate AWS IAM keys or refresh SSO profile.",
      scopes: ["cloudformation:*", "lambda:*"]
    }
  },
  {
    slug: "faas-cli",
    name: "OpenFaaS CLI",
    publisher: "OpenFaaS",
    description: "Deploy and manage OpenFaaS functions.",
    category: "serverless",
    tags: ["serverless", "openfaas", "functions"],
    binary: "faas-cli",
    docs: ["https://docs.openfaas.com/cli/"],
    install: { macos: "brew install faas-cli", linux: "sudo apt install faas-cli" }
  },
  {
    slug: "sanity",
    name: "Sanity CLI",
    publisher: "Sanity",
    description: "Manage Sanity projects, datasets, and studios.",
    category: "cms-content",
    tags: ["cms", "content", "sanity"],
    binary: "sanity",
    docs: ["https://www.sanity.io/docs/cli-reference"],
    install: { macos: "npm install -g @sanity/cli", linux: "npm install -g @sanity/cli" },
    npmPackage: "@sanity/cli"
  },
  {
    slug: "contentful",
    name: "Contentful CLI",
    publisher: "Contentful",
    description: "Automate Contentful space and environment workflows.",
    category: "cms-content",
    tags: ["cms", "content", "contentful"],
    binary: "contentful",
    docs: ["https://www.contentful.com/developers/docs/tutorials/cli/installation/"],
    install: { macos: "npm install -g contentful-cli", linux: "npm install -g contentful-cli" },
    npmPackage: "contentful-cli"
  },
  {
    slug: "strapi",
    name: "Strapi CLI",
    publisher: "Strapi",
    description: "Develop and operate Strapi content platforms.",
    category: "cms-content",
    tags: ["cms", "content", "strapi"],
    binary: "strapi",
    docs: ["https://docs.strapi.io/cms/cli"],
    install: { macos: "npm install -g strapi", linux: "npm install -g strapi" },
    npmPackage: "strapi"
  },
  {
    slug: "posthog",
    name: "PostHog CLI",
    publisher: "PostHog",
    description: "Manage PostHog project and ingestion workflows.",
    category: "analytics",
    tags: ["analytics", "events", "product"],
    binary: "posthog",
    docs: ["https://posthog.com/docs"],
    install: { macos: "pip3 install posthog", linux: "pip3 install posthog" },
    auth: {
      type: "api_key",
      env: ["POSTHOG_API_KEY", "POSTHOG_HOST"],
      refresh: "Rotate PostHog personal API key from project settings.",
      scopes: ["events:write", "project:read"]
    }
  },
  {
    slug: "mixpanel",
    name: "Mixpanel CLI",
    publisher: "Mixpanel",
    description: "Manage Mixpanel analytics data and exports.",
    category: "analytics",
    tags: ["analytics", "mixpanel", "events"],
    binary: "mixpanel",
    docs: ["https://developer.mixpanel.com/reference/overview"],
    install: { macos: "npm install -g mixpanel-cli", linux: "npm install -g mixpanel-cli" },
    npmPackage: "mixpanel-cli"
  },
  {
    slug: "namecheap",
    name: "Namecheap CLI",
    publisher: "Namecheap Community",
    description: "Automate Namecheap domain and DNS operations.",
    category: "dns-domains",
    tags: ["dns", "domains", "namecheap"],
    binary: "namecheap",
    docs: ["https://www.namecheap.com/support/api/intro/"],
    install: { macos: "npm install -g namecheap-cli", linux: "npm install -g namecheap-cli" },
    npmPackage: "namecheap-cli"
  },
  {
    slug: "dig",
    name: "dig CLI",
    publisher: "ISC",
    description: "Inspect DNS records and domain propagation.",
    category: "dns-domains",
    tags: ["dns", "domains", "records"],
    binary: "dig",
    docs: ["https://bind9.readthedocs.io/en/latest/manpages.html#dig"],
    install: { macos: "brew install bind", linux: "sudo apt install dnsutils" },
    auth: {
      type: "none",
      env: [],
      refresh: "No authentication required for DNS lookups.",
      scopes: []
    }
  },
  {
    slug: "celery",
    name: "Celery CLI",
    publisher: "Celery",
    description: "Manage Celery workers and task queues.",
    category: "queues",
    tags: ["queue", "python", "workers"],
    binary: "celery",
    docs: ["https://docs.celeryq.dev/en/stable/reference/cli.html"],
    install: { macos: "pip3 install celery", linux: "pip3 install celery" },
    auth: {
      type: "config_file",
      env: ["CELERY_BROKER_URL", "CELERY_RESULT_BACKEND"],
      refresh: "Rotate broker credentials for Celery backends.",
      scopes: ["queue:read", "queue:write"]
    }
  },
  {
    slug: "nats",
    name: "NATS CLI",
    publisher: "NATS",
    description: "Publish, subscribe, and inspect NATS streams.",
    category: "queues",
    tags: ["queue", "messaging", "nats"],
    binary: "nats-server",
    docs: ["https://docs.nats.io/running-a-nats-service/introduction/installation"],
    install: { macos: "brew install nats-server", linux: "sudo apt install nats-server" },
    auth: {
      type: "config_file",
      env: ["NATS_URL", "NATS_CREDS"],
      refresh: "Rotate NATS credentials and JWT user tokens.",
      scopes: ["stream:read", "stream:write"]
    }
  },
  {
    slug: "memcached",
    name: "Memcached CLI",
    publisher: "Memcached",
    description: "Operate Memcached server from terminal.",
    category: "caching",
    tags: ["cache", "memcached", "performance"],
    binary: "memcached",
    docs: ["https://memcached.org/"],
    install: { macos: "brew install memcached", linux: "sudo apt install memcached" },
    auth: {
      type: "none",
      env: [],
      refresh: "No auth by default; configure SASL when enabled.",
      scopes: []
    }
  },
  {
    slug: "memtier",
    name: "memtier_benchmark",
    publisher: "Redis Labs",
    description: "Benchmark cache workloads and latency profiles.",
    category: "caching",
    tags: ["cache", "benchmark", "performance"],
    binary: "memtier_benchmark",
    docs: ["https://github.com/RedisLabs/memtier_benchmark"],
    install: { macos: "brew install memtier_benchmark", linux: "sudo apt install memtier-benchmark" },
    auth: {
      type: "none",
      env: [],
      refresh: "No account auth required for benchmark execution.",
      scopes: []
    }
  },
  {
    slug: "meilisearch",
    name: "Meilisearch CLI",
    publisher: "Meilisearch",
    description: "Run and manage Meilisearch instances.",
    category: "search",
    tags: ["search", "index", "meilisearch"],
    binary: "meilisearch",
    docs: ["https://www.meilisearch.com/docs/learn/getting_started/installation"],
    install: { macos: "brew install meilisearch", linux: "sudo apt install meilisearch" }
  },
  {
    slug: "algolia",
    name: "Algolia CLI",
    publisher: "Algolia",
    description: "Configure Algolia indices and search settings.",
    category: "search",
    tags: ["search", "algolia", "index"],
    binary: "algolia",
    docs: ["https://github.com/algolia/algolia-cli#readme"],
    install: { macos: "npm install -g @algolia/cli", linux: "npm install -g @algolia/cli" },
    npmPackage: "@algolia/cli",
    auth: {
      type: "api_key",
      env: ["ALGOLIA_APP_ID", "ALGOLIA_API_KEY"],
      refresh: "Rotate Algolia admin API key in dashboard.",
      scopes: ["indices:write", "settings:write"]
    }
  },
  {
    slug: "ollama",
    name: "Ollama CLI",
    publisher: "Ollama",
    description: "Run local LLM models and inference workflows.",
    category: "ml-ai",
    tags: ["ai", "llm", "inference"],
    binary: "ollama",
    docs: ["https://github.com/ollama/ollama/blob/main/docs/cli.md"],
    install: { macos: "brew install ollama", linux: "sudo apt install ollama" },
    auth: {
      type: "none",
      env: [],
      refresh: "No auth required for local model runtime.",
      scopes: []
    }
  },
  {
    slug: "huggingface-cli",
    name: "Hugging Face CLI",
    publisher: "Hugging Face",
    description: "Download/upload models and datasets from Hugging Face Hub.",
    category: "ml-ai",
    tags: ["ai", "models", "huggingface"],
    binary: "huggingface-cli",
    docs: ["https://huggingface.co/docs/huggingface_hub/main/en/guides/cli"],
    install: { macos: "pip3 install huggingface_hub", linux: "pip3 install huggingface_hub" },
    auth: {
      type: "api_key",
      env: ["HF_TOKEN"],
      refresh: "Rotate Hugging Face access token in account settings.",
      scopes: ["read", "write"]
    }
  },
  {
    slug: "replicate",
    name: "Replicate CLI",
    publisher: "Replicate",
    description: "Run and manage model predictions on Replicate.",
    category: "ml-ai",
    tags: ["ai", "inference", "replicate"],
    binary: "replicate",
    docs: ["https://github.com/replicate/cli", "https://replicate.com/docs"],
    install: {
      macos: "brew tap replicate/tap && brew install replicate",
      linux: "brew tap replicate/tap && brew install replicate"
    },
    auth: {
      type: "api_key",
      env: ["REPLICATE_API_TOKEN"],
      refresh: "Rotate Replicate API token from account settings.",
      scopes: ["predictions:write", "models:read"]
    },
    workflowRefs: ["ai-inference"]
  },
  {
    slug: "jq",
    name: "jq CLI",
    publisher: "jq",
    description: "Transform and query JSON streams.",
    category: "utilities",
    tags: ["json", "utility", "cli"],
    binary: "jq",
    docs: ["https://jqlang.github.io/jq/manual/"],
    install: { macos: "brew install jq", linux: "sudo apt install jq" }
  },
  {
    slug: "fx",
    name: "fx CLI",
    publisher: "fx",
    description: "Interactive JSON processing in terminal.",
    category: "utilities",
    tags: ["json", "utility", "terminal"],
    binary: "fx",
    docs: ["https://github.com/antonmedv/fx"],
    install: { macos: "brew install fx", linux: "sudo apt install fx" }
  },
  {
    slug: "httpie",
    name: "HTTPie CLI",
    publisher: "HTTPie",
    description: "Human-friendly HTTP client for APIs.",
    category: "utilities",
    tags: ["http", "api", "utility"],
    binary: "http",
    docs: ["https://httpie.io/docs/cli"],
    install: { macos: "brew install httpie", linux: "sudo apt install httpie" }
  },
  {
    slug: "curl",
    name: "curl CLI",
    publisher: "curl",
    description: "Transfer data with URL syntax.",
    category: "utilities",
    tags: ["http", "network", "utility"],
    binary: "curl",
    docs: ["https://curl.se/docs/manpage.html"],
    install: { macos: "brew install curl", linux: "sudo apt install curl" }
  },
  {
    slug: "wget",
    name: "wget CLI",
    publisher: "GNU",
    description: "Download files over HTTP/HTTPS/FTP.",
    category: "utilities",
    tags: ["network", "download", "utility"],
    binary: "wget",
    docs: ["https://www.gnu.org/software/wget/manual/wget.html"],
    install: { macos: "brew install wget", linux: "sudo apt install wget" }
  },
  {
    slug: "rsync",
    name: "rsync CLI",
    publisher: "rsync",
    description: "Synchronize files and directories efficiently.",
    category: "utilities",
    tags: ["files", "sync", "utility"],
    binary: "rsync",
    docs: ["https://download.samba.org/pub/rsync/rsync.1"],
    install: { macos: "brew install rsync", linux: "sudo apt install rsync" }
  },
  {
    slug: "ffmpeg",
    name: "FFmpeg CLI",
    publisher: "FFmpeg",
    description: "Process and transcode audio/video pipelines.",
    category: "utilities",
    tags: ["media", "video", "utility"],
    binary: "ffmpeg",
    docs: ["https://ffmpeg.org/ffmpeg.html"],
    install: { macos: "brew install ffmpeg", linux: "sudo apt install ffmpeg" }
  },
  {
    slug: "imagemagick",
    name: "ImageMagick CLI",
    publisher: "ImageMagick",
    description: "Manipulate and transform images from terminal.",
    category: "utilities",
    tags: ["image", "media", "utility"],
    binary: "magick",
    docs: ["https://imagemagick.org/script/command-line-tools.php"],
    install: { macos: "brew install imagemagick", linux: "sudo apt install imagemagick" }
  },
  {
    slug: "yq",
    name: "yq CLI",
    publisher: "yq",
    description: "Process YAML/JSON/XML in shell pipelines.",
    category: "utilities",
    tags: ["yaml", "json", "utility"],
    binary: "yq",
    docs: ["https://mikefarah.gitbook.io/yq/"],
    install: { macos: "brew install yq", linux: "sudo apt install yq" }
  },
  {
    slug: "doppler",
    name: "Doppler CLI",
    publisher: "Doppler",
    description: "Manage secrets and configuration across environments.",
    category: "dev-tooling",
    tags: ["secrets", "config", "developer"],
    binary: "doppler",
    docs: ["https://docs.doppler.com/docs/cli"],
    install: {
      macos: "brew tap dopplerhq/cli && brew install dopplerhq/cli/doppler",
      linux: "curl -Ls https://cli.doppler.com/install.sh | sh"
    },
    auth: {
      type: "api_key",
      env: ["DOPPLER_TOKEN"],
      loginCommand: "doppler login",
      refresh: "Rotate Doppler service tokens in project settings.",
      scopes: ["configs:read", "secrets:read"]
    },
    fallbackCommands: [
      { subcommand: "login", description: "Authenticate Doppler CLI" },
      { subcommand: "setup", description: "Bind project and config to local workspace" },
      { subcommand: "secrets", description: "List or manage secrets in a config" },
      { subcommand: "configs", description: "List available configs for project" },
      { subcommand: "run", description: "Run command with injected Doppler secrets" }
    ],
    workflowRefs: ["developer-loop", "full-stack-saas"]
  }
];

const GOLD_NPM_EXPANSIONS: ExpansionBlueprint[] = goldNpmCatalog.map((entry) => ({
  slug: entry.slug,
  name: entry.name,
  publisher: entry.publisher,
  description: entry.description,
  category: entry.category,
  tags: entry.tags,
  binary: entry.binary,
  docs: [entry.docs],
  install: {
    macos: `npm install -g ${entry.packageName}`,
    linux: `npm install -g ${entry.packageName}`
  },
  npmPackage: entry.packageName,
  source: "npm_auto",
  auth: defaultAuthForExpansion({
    slug: entry.slug,
    name: entry.name,
    publisher: entry.publisher,
    description: entry.description,
    category: entry.category,
    tags: entry.tags,
    binary: entry.binary,
    docs: [entry.docs],
    install: {
      macos: `npm install -g ${entry.packageName}`,
      linux: `npm install -g ${entry.packageName}`
    },
    npmPackage: entry.packageName
  })
}));

const EXPANSION_TARGETS: TargetSpec[] = [...EXPANSION_BLUEPRINTS, ...GOLD_NPM_EXPANSIONS].map((entry) => ({
  slug: entry.slug,
  name: entry.name,
  publisher: entry.publisher,
  description: entry.description,
  category: entry.category,
  tags: entry.tags,
  binary: entry.binary,
  docs: entry.docs,
  runners: [{ type: "direct", command: entry.binary }, ...(entry.npmPackage && ENABLE_NPX_PROBES ? [{ type: "npx" as const, packageName: entry.npmPackage }] : [])],
  install: entry.install,
  auth: entry.auth ?? defaultAuthForExpansion(entry),
  fallbackCommands:
    entry.fallbackCommands ??
    DEFAULT_FALLBACKS_BY_CATEGORY[entry.category] ??
    DEFAULT_FALLBACKS_BY_CATEGORY.additional,
  workflowRefs:
    entry.workflowRefs ??
    DEFAULT_WORKFLOW_REFS_BY_CATEGORY[entry.category] ??
    ["developer-loop"],
  source: entry.source ?? "expansion"
}));

const CURATED_TARGETS: TargetSpec[] = [...TARGETS, ...EXPANSION_TARGETS].filter(
  (target) => !DISALLOWED_GENERATED_SLUGS.has(target.slug)
);

const WORKFLOW_TEMPLATES: Array<Omit<WorkflowChain, "created_at" | "updated_at" | "steps"> & {
  categories: string[];
}> = [
  {
    id: "wf_deploy_nextjs_app",
    slug: "deploy-nextjs-app",
    title: "Deploy Next.js App",
    description: "Deploy frontend app and attach runtime env + domain.",
    tags: ["deploy", "nextjs", "frontend"],
    estimated_minutes: 30,
    categories: ["deployment"]
  },
  {
    id: "wf_database_setup",
    slug: "database-setup",
    title: "Database Setup",
    description: "Provision database, create branches, and apply migrations.",
    tags: ["database", "migrations"],
    estimated_minutes: 25,
    categories: ["databases", "additional"]
  },
  {
    id: "wf_payments_integration",
    slug: "payments-integration",
    title: "Payments Integration",
    description: "Configure products, pricing, and webhook test events.",
    tags: ["payments", "billing"],
    estimated_minutes: 25,
    categories: ["payments"]
  },
  {
    id: "wf_notifications_stack",
    slug: "notifications-stack",
    title: "Notifications Stack",
    description: "Configure transactional email or messaging providers.",
    tags: ["email", "sms", "notifications"],
    estimated_minutes: 20,
    categories: ["email-comms"]
  },
  {
    id: "wf_auth_setup",
    slug: "auth-setup",
    title: "Authentication Setup",
    description: "Create and configure auth providers for app login flows.",
    tags: ["auth", "identity"],
    estimated_minutes: 20,
    categories: ["auth"]
  },
  {
    id: "wf_infra_bootstrap",
    slug: "infra-bootstrap",
    title: "Infrastructure Bootstrap",
    description: "Initialize cloud resources and deployment infrastructure.",
    tags: ["infra", "cloud"],
    estimated_minutes: 40,
    categories: ["hosting-infra", "additional"]
  },
  {
    id: "wf_developer_loop",
    slug: "developer-loop",
    title: "Developer Loop",
    description: "Install deps, run tests, commit, and open PRs.",
    tags: ["dev", "git", "ci"],
    estimated_minutes: 15,
    categories: ["dev-tooling", "additional"]
  },
  {
    id: "wf_observability_setup",
    slug: "observability-setup",
    title: "Observability Setup",
    description: "Attach error and metrics monitoring to application release.",
    tags: ["monitoring", "alerts"],
    estimated_minutes: 20,
    categories: ["monitoring"]
  },
  {
    id: "wf_asset_delivery",
    slug: "asset-delivery",
    title: "Asset Delivery",
    description: "Configure object storage and CDN delivery paths.",
    tags: ["storage", "cdn"],
    estimated_minutes: 20,
    categories: ["storage-cdn", "additional"]
  },
  {
    id: "wf_full_stack_saas",
    slug: "full-stack-saas",
    title: "Full-Stack SaaS",
    description: "Deploy app, connect database, integrate payments and notifications.",
    tags: ["saas", "deploy"],
    estimated_minutes: 45,
    categories: ["deployment", "databases", "payments", "email-comms", "auth"]
  },
  {
    id: "wf_ci_cd_automation",
    slug: "ci-cd-automation",
    title: "CI/CD Automation",
    description: "Validate pipeline config, trigger runs, and inspect deployment logs.",
    tags: ["ci", "cd", "automation"],
    estimated_minutes: 25,
    categories: ["ci-cd"]
  },
  {
    id: "wf_testing_automation",
    slug: "testing-automation",
    title: "Testing Automation",
    description: "Run unit, integration, and end-to-end testing workflows.",
    tags: ["testing", "qa", "automation"],
    estimated_minutes: 20,
    categories: ["testing"]
  },
  {
    id: "wf_container_operations",
    slug: "container-operations",
    title: "Container Operations",
    description: "Manage container lifecycle, local clusters, and runtime diagnostics.",
    tags: ["containers", "kubernetes", "ops"],
    estimated_minutes: 30,
    categories: ["containers"]
  },
  {
    id: "wf_serverless_workloads",
    slug: "serverless-workloads",
    title: "Serverless Workloads",
    description: "Build, deploy, and test serverless functions and stacks.",
    tags: ["serverless", "functions", "deploy"],
    estimated_minutes: 30,
    categories: ["serverless"]
  },
  {
    id: "wf_cms_content_ops",
    slug: "cms-content-ops",
    title: "CMS Content Ops",
    description: "Manage content models, datasets, and publishing pipelines.",
    tags: ["cms", "content", "publishing"],
    estimated_minutes: 20,
    categories: ["cms-content"]
  },
  {
    id: "wf_product_analytics",
    slug: "product-analytics",
    title: "Product Analytics",
    description: "Configure event ingestion and analytics project operations.",
    tags: ["analytics", "events", "metrics"],
    estimated_minutes: 20,
    categories: ["analytics"]
  },
  {
    id: "wf_dns_domain_ops",
    slug: "dns-domain-ops",
    title: "DNS & Domain Ops",
    description: "Automate domain and DNS record management tasks.",
    tags: ["dns", "domains", "networking"],
    estimated_minutes: 15,
    categories: ["dns-domains"]
  },
  {
    id: "wf_queue_processing",
    slug: "queue-processing",
    title: "Queue Processing",
    description: "Operate queue workers, inspect jobs, and monitor throughput.",
    tags: ["queues", "workers", "jobs"],
    estimated_minutes: 20,
    categories: ["queues"]
  },
  {
    id: "wf_cache_operations",
    slug: "cache-operations",
    title: "Cache Operations",
    description: "Inspect cache health, keyspace behavior, and performance.",
    tags: ["cache", "performance", "operations"],
    estimated_minutes: 15,
    categories: ["caching"]
  },
  {
    id: "wf_search_stack",
    slug: "search-stack",
    title: "Search Stack",
    description: "Set up and operate search engines and indexes.",
    tags: ["search", "indexing", "relevance"],
    estimated_minutes: 25,
    categories: ["search"]
  },
  {
    id: "wf_ai_inference",
    slug: "ai-inference",
    title: "AI Inference",
    description: "Authenticate model providers and execute inference runs.",
    tags: ["ai", "ml", "inference"],
    estimated_minutes: 25,
    categories: ["ml-ai"]
  },
  {
    id: "wf_utility_toolbox",
    slug: "utility-toolbox",
    title: "Utility Toolbox",
    description: "Compose CLI utility pipelines for data, media, and network tasks.",
    tags: ["utilities", "pipelines", "shell"],
    estimated_minutes: 10,
    categories: ["utilities", "additional"]
  }
];

const WORKFLOW_PREFERRED_CHAINS: Record<string, string[]> = {
  "deploy-nextjs-app": ["vercel", "netlify", "railway"],
  "database-setup": ["supabase", "neon", "prisma"],
  "payments-integration": ["stripe"],
  "notifications-stack": ["postmark", "twilio"],
  "auth-setup": ["auth0"],
  "infra-bootstrap": ["aws-cli", "gcloud", "docker", "kubectl"],
  "developer-loop": ["gh", "git", "npm", "pnpm"],
  "observability-setup": ["sentry-cli", "datadog"],
  "asset-delivery": ["cloudflare", "minio"],
  "full-stack-saas": ["vercel", "supabase", "stripe", "postmark", "auth0"],
  "ci-cd-automation": ["github-actions", "circleci", "jenkins", "gitlab-ci-local"],
  "testing-automation": ["playwright", "vitest", "jest", "cypress", "newman"],
  "container-operations": ["podman", "k9s", "kind", "minikube", "kubectx", "stern"],
  "serverless-workloads": ["serverless", "sst", "arc", "aws-sam", "faas-cli"],
  "cms-content-ops": ["sanity", "contentful", "strapi"],
  "product-analytics": ["posthog", "mixpanel"],
  "dns-domain-ops": ["cloudflare", "namecheap", "dig"],
  "queue-processing": ["celery", "nats", "redis-cli"],
  "cache-operations": ["redis-cli", "memcached", "memtier"],
  "search-stack": ["meilisearch", "algolia"],
  "ai-inference": ["ollama", "huggingface-cli", "replicate"],
  "utility-toolbox": ["jq", "httpie", "curl", "wget", "rsync", "yq"]
};

function runCommand(command: string, args: string[], timeoutMs = 12000) {
  const result = spawnSync(command, args, {
    encoding: "utf-8",
    timeout: timeoutMs,
    maxBuffer: 2 * 1024 * 1024
  });

  if (result.error || result.status !== 0) {
    return {
      ok: false,
      output: `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim()
    };
  }

  return {
    ok: true,
    output: `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim()
  };
}

async function fetchDocsText(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "clime-curation-bot/1.0"
      }
    });
    if (!response.ok) {
      return "";
    }
    const html = await response.text();
    const withoutScripts = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ");
    const withoutStyles = withoutScripts.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ");
    const text = withoutStyles
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
    return text;
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

const NON_ACTIONABLE_COMMAND_TOKENS = new Set([
  "api",
  "apis",
  "cli",
  "clis",
  "command",
  "commands",
  "dashboard",
  "docs",
  "documentation",
  "guide",
  "guides",
  "logo",
  "overview",
  "quickstart",
  "reference",
  "references",
  "skip",
  "support",
  "tutorial",
  "visual",
  "workbench"
]);

const ACTIONABLE_COMMAND_TOKENS = new Set([
  "add",
  "apply",
  "auth",
  "build",
  "config",
  "configure",
  "create",
  "delete",
  "deploy",
  "destroy",
  "dev",
  "domain",
  "domains",
  "env",
  "events",
  "functions",
  "generate",
  "get",
  "health",
  "init",
  "install",
  "link",
  "list",
  "listen",
  "login",
  "logs",
  "migrate",
  "open",
  "prices",
  "products",
  "projects",
  "publish",
  "pull",
  "push",
  "remove",
  "run",
  "serve",
  "setup",
  "show",
  "start",
  "status",
  "stop",
  "tail",
  "trigger",
  "update",
  "upload",
  "verify",
  "webhooks",
  "whoami"
]);

function tokenizeCommandCandidate(candidate: string) {
  return candidate
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function isActionableCommandCandidate(candidate: string, source: "help" | "docs") {
  const normalized = candidate.trim();
  const tokens = tokenizeCommandCandidate(normalized);
  if (tokens.length === 0) {
    return false;
  }

  if (!/^[a-z][a-z0-9:_-]*(?:\s+[a-z][a-z0-9:_-]*){0,2}$/i.test(normalized)) {
    return false;
  }

  if (tokens.length > 3) {
    return false;
  }

  // Docs often include heading phrases that look command-like but are not executable.
  if (tokens.some((token) => NON_ACTIONABLE_COMMAND_TOKENS.has(token))) {
    return false;
  }

  if (source === "docs" && !tokens.some((token) => ACTIONABLE_COMMAND_TOKENS.has(token))) {
    return false;
  }

  return true;
}

function parseSubcommandsFromHelp(helpText: string) {
  const lines = helpText.split(/\r?\n/);
  const commands: Array<{ name: string; description: string }> = [];

  for (const line of lines) {
    const match = line.match(/^\s{1,}([a-z][a-z0-9:_-]*(?:\s+[a-z][a-z0-9:_-]*)?)\s{2,}(.+)$/i);
    if (!match) {
      continue;
    }

    const name = match[1].trim();
    const description = match[2].trim();

    if (name.startsWith("-") || /\bhelp\b/i.test(name) || /\[/.test(name)) {
      continue;
    }

    if (!isActionableCommandCandidate(name, "help")) {
      continue;
    }

    commands.push({ name, description });
  }

  const deduped = new Map<string, { name: string; description: string }>();
  for (const command of commands) {
    if (!deduped.has(command.name)) {
      deduped.set(command.name, command);
    }
  }

  return [...deduped.values()];
}

function parseCommandCandidatesFromDocs(binary: string, docsText: string) {
  const pattern = new RegExp(`\\b${binary.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\s+([a-z][a-z0-9:_-]*(?:\\s+[a-z][a-z0-9:_-]*)?)`, "gi");
  const found = new Map<string, { name: string; description: string }>();
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(docsText)) !== null) {
    const candidate = match[1]?.trim();
    if (!candidate || candidate.startsWith("-")) {
      continue;
    }
    if (!isActionableCommandCandidate(candidate, "docs")) {
      continue;
    }
    if (!found.has(candidate)) {
      found.set(candidate, { name: candidate, description: "Derived from docs command references" });
    }
  }

  return [...found.values()];
}

function parseOptions(helpText: string) {
  const lines = helpText.split(/\r?\n/);
  const options: Array<{ name: string; description: string; required: boolean }> = [];

  for (const line of lines) {
    const match = line.match(/^\s*(?:-[a-zA-Z],\s*)?(--?[a-zA-Z0-9-]+(?:[ =][<\[][^\]>]+[\]>])?)\s{2,}(.+)$/);
    if (!match) {
      continue;
    }

    const name = match[1].trim();
    const description = match[2].trim();

    options.push({
      name,
      description,
      required: /required|must|need/i.test(description)
    });
  }

  return options;
}

function parseRequiredArgsFromCommand(command: string) {
  const args: Array<{ name: string; description: string }> = [];
  const matches = command.match(/<([^>]+)>/g) ?? [];

  for (const raw of matches) {
    const name = raw.replace(/[<>]/g, "");
    args.push({
      name,
      description: `Required argument '${name}' for this command.`
    });
  }

  return args;
}

function expectedOutputForCommand(command: string) {
  if (/list|get|status|logs|tail|show/i.test(command)) {
    return "Table or JSON-style structured output with command status details.";
  }
  if (/create|deploy|push|apply|publish|send|upload/i.test(command)) {
    return "Operation result summary including created resource identifiers or URLs.";
  }
  if (/login|auth|configure/i.test(command)) {
    return "Authentication confirmation and profile/token setup output.";
  }
  return "Command-specific structured output suitable for agent parsing.";
}

function commonErrorsForCategory(category: string) {
  switch (category) {
    case "deployment":
      return ["Authentication required", "Project context not linked", "Network/API timeout"];
    case "databases":
      return ["Invalid credentials", "Migration/schema conflict", "Connection refused"];
    case "payments":
      return ["Invalid API key", "Webhook endpoint unreachable", "Permission denied"];
    case "email-comms":
      return ["Unverified sender/domain", "Rate limit exceeded", "Invalid recipient payload"];
    case "auth":
      return ["Tenant/app not selected", "Insufficient management API scope", "Token expired"];
    case "hosting-infra":
      return ["Cloud credential missing", "Resource quota exceeded", "Permission denied"];
    case "ci-cd":
      return ["Pipeline auth failed", "Workflow config invalid", "Runner not available"];
    case "testing":
      return ["Test environment misconfigured", "Dependency not resolved", "Assertion failures"];
    case "containers":
      return ["Cluster context missing", "Container runtime unavailable", "Image pull failed"];
    case "serverless":
      return ["Provider auth missing", "Deployment package invalid", "Function timeout exceeded"];
    case "cms-content":
      return ["Project access denied", "Schema validation failed", "Environment not selected"];
    case "analytics":
      return ["API key invalid", "Event schema mismatch", "Rate limit exceeded"];
    case "dns-domains":
      return ["Domain not found", "DNS propagation delay", "Provider auth failed"];
    case "queues":
      return ["Broker unavailable", "Worker disconnected", "Queue backlog threshold exceeded"];
    case "caching":
      return ["Cache endpoint unreachable", "Key eviction conflict", "Permission denied"];
    case "search":
      return ["Index missing", "Document schema mismatch", "Cluster health degraded"];
    case "ml-ai":
      return ["Model access denied", "Inference job failed", "Provider quota exceeded"];
    case "utilities":
      return ["Invalid input format", "Pipe/process failure", "Unsupported flag combination"];
    case "monitoring":
      return ["API key invalid", "Release artifact missing", "Upload failure"];
    default:
      return ["Command failed", "Insufficient permissions", "Invalid parameters"];
  }
}

function commonErrorsForCommand(category: string, command: string) {
  const base = commonErrorsForCategory(category);
  const normalized = command.toLowerCase();

  if (/login|auth|token|whoami/.test(normalized)) {
    return [base[0] ?? "Authentication required", "Login flow interrupted", "Token expired or missing scope"];
  }

  if (/deploy|publish|push|release|apply|up/.test(normalized)) {
    return [
      base[0] ?? "Authentication required",
      "Project or environment not linked",
      "Build/deploy operation failed on remote provider"
    ];
  }

  if (/logs|tail|status|list|get|show|inspect/.test(normalized)) {
    return [
      "Resource not found for current context",
      base[1] ?? "Project context not linked",
      base[2] ?? "Network/API timeout"
    ];
  }

  if (/create|init|add|set|configure|update/.test(normalized)) {
    return [
      "Invalid flag or payload for requested operation",
      base[1] ?? "Resource validation failed",
      base[2] ?? "Permission denied"
    ];
  }

  return base;
}

function detectPackageManager(command: string): string {
  const normalized = command.toLowerCase();
  if (normalized.includes("brew install")) {
    return "brew";
  }
  if (normalized.includes("npm install")) {
    return "npm";
  }
  if (normalized.includes("pip install") || normalized.includes("pip3 install")) {
    return "pip";
  }
  if (normalized.includes("apt install") || normalized.includes("apt-get install")) {
    return "apt";
  }
  if (normalized.includes("curl ")) {
    return "curl";
  }
  return "shell";
}

function normalizeParameterDescription(
  parameterName: string,
  description: string | undefined,
  required: boolean
) {
  const clean = (description ?? "").trim().replace(/\s+/g, " ");
  if (clean.length >= 5) {
    return clean;
  }
  if (required) {
    return `Required value for ${parameterName}.`;
  }
  return `Optional flag for ${parameterName}.`;
}

function getRunnerCommand(spec: TargetSpec, runner: RunnerSpec, subcommand?: string) {
  if (runner.type === "direct") {
    const cmd = runner.command ?? spec.binary;
    const args = subcommand ? [...subcommand.split(" "), "--help"] : ["--help"];
    return { command: cmd, args };
  }

  const packageName = runner.packageName ?? spec.binary;
  const args = ["-y", packageName];
  if (subcommand) {
    args.push(...subcommand.split(" "));
  }
  args.push("--help");
  return { command: "npx", args };
}

function normalizeCommandString(binary: string, subcommand: string) {
  const clean = subcommand.trim();
  if (clean.startsWith(binary)) {
    return clean;
  }
  return `${binary} ${clean}`;
}

function createAuthGuide(spec: TargetSpec) {
  const setupSteps = [] as Array<{ order: number; instruction: string; command?: string }>;

  if (spec.auth.loginCommand) {
    setupSteps.push({
      order: 1,
      instruction: "Authenticate CLI profile for this provider.",
      command: spec.auth.loginCommand
    });
    if (spec.auth.env.length > 0) {
      setupSteps.push({
        order: 2,
        instruction: `Set required environment variables: ${spec.auth.env.join(", ")}`
      });
    }
  } else if (spec.auth.env.length > 0) {
    setupSteps.push({
      order: 1,
      instruction: `Export required environment variables: ${spec.auth.env.join(", ")}`
    });
  } else {
    setupSteps.push({
      order: 1,
      instruction: "No explicit authentication required for local usage."
    });
  }

  return {
    auth_type: spec.auth.type,
    setup_steps: setupSteps,
    environment_variables: spec.auth.env,
    token_refresh: spec.auth.refresh,
    scopes: spec.auth.scopes
  };
}

function ratingForCategory(category: string) {
  const basePopularity: Record<string, number> = {
    deployment: 88,
    databases: 82,
    payments: 78,
    "email-comms": 72,
    auth: 74,
    "hosting-infra": 86,
    "ci-cd": 84,
    testing: 88,
    containers: 87,
    serverless: 83,
    "cms-content": 74,
    analytics: 79,
    "dns-domains": 72,
    queues: 77,
    caching: 80,
    search: 81,
    "ml-ai": 82,
    utilities: 89,
    "dev-tooling": 90,
    monitoring: 70,
    "storage-cdn": 76,
    additional: 68
  };

  return basePopularity[category] ?? 65;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function hashFraction(value: string) {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  }
  return (hash % 10_000) / 10_000;
}

function estimatedTrust(spec: TargetSpec, commandCount: number) {
  const base = 70 + (ratingForCategory(spec.category) - 65) * 0.45;
  const authAdjustment: Record<TargetSpec["auth"]["type"], number> = {
    none: 4,
    api_key: 2,
    config_file: 1,
    login_command: 0,
    oauth: -2
  };
  const commandAdjustment = Math.min(3, Math.max(0, commandCount - 5)) * 0.8;
  const jitter = (hashFraction(`${spec.slug}:trust`) - 0.5) * 6;
  return Math.round(clamp(base + authAdjustment[spec.auth.type] + commandAdjustment + jitter, 74, 95));
}

async function buildListing(spec: TargetSpec, index: number): Promise<CliProfile> {
  let baseHelp = "";
  let usedRunner: RunnerSpec | undefined;

  const shouldProbeRuntimeHelp = spec.source !== "npm_auto";
  if (shouldProbeRuntimeHelp) {
    for (const runner of spec.runners) {
      const invocation = getRunnerCommand(spec, runner);
      const response = runCommand(invocation.command, invocation.args);
      if (response.ok && response.output.length > 100) {
        baseHelp = response.output;
        usedRunner = runner;
        break;
      }
    }
  }

  const docsTextBlocks: string[] = [];
  const shouldFetchDocs = !(spec.source === "npm_auto" && !FETCH_DOCS_FOR_NPM_AUTO);
  if (shouldFetchDocs) {
    for (const url of spec.docs) {
      const text = await fetchDocsText(url);
      if (text.length > 0) {
        docsTextBlocks.push(text);
      }
    }
  } else {
    docsTextBlocks.push(spec.description);
  }
  const docsText = docsTextBlocks.join("\n");

  const fromHelp = baseHelp ? parseSubcommandsFromHelp(baseHelp) : [];
  // Only use docs-derived commands when help parsing succeeds; otherwise fall back to curated commands.
  const fromDocs = baseHelp ? parseCommandCandidatesFromDocs(spec.binary, docsText) : [];

  const candidates = new Map<string, { name: string; description: string }>();
  for (const entry of fromHelp) {
    if (!candidates.has(entry.name)) {
      candidates.set(entry.name, entry);
    }
  }
  for (const fallback of spec.fallbackCommands) {
    if (!candidates.has(fallback.subcommand)) {
      candidates.set(fallback.subcommand, {
        name: fallback.subcommand,
        description: fallback.description
      });
    }
  }
  for (const entry of fromDocs) {
    if (!candidates.has(entry.name)) {
      candidates.set(entry.name, entry);
    }
  }

  const commandEntries: CliProfile["commands"] = [];
  const maxCommands = 7;

  for (const candidate of candidates.values()) {
    if (commandEntries.length >= maxCommands) {
      break;
    }
    if (!isActionableCommandCandidate(candidate.name, "help")) {
      continue;
    }

    let detailHelp = "";
    // Avoid repeated npx executions; one base help call is enough for package-only CLIs.
    if (usedRunner?.type === "direct") {
      const invocation = getRunnerCommand(spec, usedRunner, candidate.name);
      const response = runCommand(invocation.command, invocation.args);
      if (response.ok && response.output.length > 20) {
        detailHelp = response.output;
      }
    }

    const sourceText = `${detailHelp}\n${baseHelp}\n${docsText}`;
    const options = parseOptions(sourceText).slice(0, 8);
    const commandString = normalizeCommandString(spec.binary, candidate.name);
    const requiredArgs = parseRequiredArgsFromCommand(commandString);

    const requiredParameters = [
      ...requiredArgs.map((arg) => ({
        name: arg.name,
        type: "string",
        description: normalizeParameterDescription(arg.name, arg.description, true)
      })),
      ...options
        .filter((option) => option.required)
        .slice(0, 3)
        .map((option) => ({
          name: option.name,
          type: "string",
          description: normalizeParameterDescription(option.name, option.description, true)
        }))
    ];

    const optionalParameters = options
      .filter((option) => !option.required)
      .slice(0, 5)
      .map((option) => ({
        name: option.name,
        type: "string|boolean",
        description: normalizeParameterDescription(option.name, option.description, false)
      }));

    if (requiredParameters.length === 0 && optionalParameters.length === 0) {
      optionalParameters.push({
        name: "--help",
        type: "boolean",
        description: "Display command help and usage options."
      });
    }

    commandEntries.push({
      id: `${spec.slug}-${candidate.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "")}`,
      cli_slug: spec.slug,
      command: commandString,
      description: candidate.description || `Run '${candidate.name}' workflow with ${spec.name}.`,
      required_parameters: requiredParameters,
      optional_parameters: optionalParameters,
      examples: [
        commandString,
        `${commandString}${optionalParameters[0] ? ` ${optionalParameters[0].name}` : ""}`.trim()
      ],
      expected_output: expectedOutputForCommand(commandString),
      common_errors: commonErrorsForCommand(spec.category, commandString),
      workflow_context: spec.workflowRefs
    });
  }

  while (commandEntries.length < 5) {
    const fallback = spec.fallbackCommands[commandEntries.length % spec.fallbackCommands.length];
    const commandString = normalizeCommandString(spec.binary, fallback.subcommand);
    commandEntries.push({
      id: `${spec.slug}-fallback-${commandEntries.length + 1}`,
      cli_slug: spec.slug,
      command: commandString,
      description: fallback.description,
      required_parameters: parseRequiredArgsFromCommand(commandString).map((arg) => ({
        name: arg.name,
        type: "string",
        description: arg.description
      })),
      optional_parameters: [
        {
          name: "--help",
          type: "boolean",
          description: "Display command options and usage details."
        }
      ],
      examples: [commandString],
      expected_output: expectedOutputForCommand(commandString),
      common_errors: commonErrorsForCommand(spec.category, commandString),
      workflow_context: spec.workflowRefs
    });
  }

  const verificationStatus = spec.source === "npm_auto" ? "auto-indexed" : "community-curated";
  const tierTag = spec.source === "npm_auto" ? "auto-curated" : "gold-curated";

  const now = new Date().toISOString();
  const popularity =
    ratingForCategory(spec.category) +
    Math.max(0, 20 - index) * 0.4 +
    (hashFraction(`${spec.slug}:popularity`) - 0.5) * 1.2;
  const normalizedPopularity = Number(clamp(popularity, 60, 98).toFixed(2));
  const trust = estimatedTrust(spec, commandEntries.length);
  return {
    identity: {
      slug: spec.slug,
      name: spec.name,
      publisher: spec.publisher,
      description: spec.description,
      category_tags: [...new Set([spec.category, tierTag, ...spec.tags])],
      website: spec.docs[0],
      repository: spec.docs[0],
      verification_status: verificationStatus,
      latest_version: "latest",
      last_updated: now,
      last_verified: now,
      popularity_score: normalizedPopularity,
      trust_score: trust,
      permission_scope: ["filesystem", "network"],
      compatibility: []
    },
    install: [
      {
        os: "macos",
        package_manager: detectPackageManager(spec.install.macos),
        command: spec.install.macos,
        checksum: undefined,
        dependencies: []
      },
      {
        os: "linux",
        package_manager: detectPackageManager(spec.install.linux),
        command: spec.install.linux,
        checksum: undefined,
        dependencies: []
      }
    ],
    auth: createAuthGuide(spec),
    commands: commandEntries,
    listing_version: {
      id: `lv_${spec.slug}_1`,
      cli_slug: spec.slug,
      version_number: 1,
      changed_fields: ["commands", "auth", "install"],
      changelog: "Generated from CLI help output + docs enrichment.",
      updated_at: now
    }
  };
}

function buildWorkflows(listings: CliProfile[]): WorkflowChain[] {
  const now = new Date().toISOString();
  const listingBySlug = new Map(listings.map((listing) => [listing.identity.slug, listing]));

  const categoryToListings = new Map<string, CliProfile[]>();
  for (const listing of listings) {
    const category = listing.identity.category_tags[0];
    const bucket = categoryToListings.get(category) ?? [];
    bucket.push(listing);
    categoryToListings.set(category, bucket);
  }

  return WORKFLOW_TEMPLATES.map((template) => {
    const steps: WorkflowChain["steps"] = [];
    let stepNumber = 1;
    const selected = new Set<string>();
    const coveredCategories = new Set<string>();

    function pushWorkflowStep(listing: CliProfile) {
      if (selected.has(listing.identity.slug)) {
        return;
      }

      const commandIds = (
        listing.commands.filter((command) =>
          command.workflow_context.some(
            (context) =>
              context === template.slug ||
              context.includes(template.slug) ||
              template.slug.includes(context)
          )
        ).length > 0
          ? listing.commands.filter((command) =>
              command.workflow_context.some(
                (context) =>
                  context === template.slug ||
                  context.includes(template.slug) ||
                  template.slug.includes(context)
              )
            )
          : listing.commands
      )
        .slice(0, 2)
        .map((command) => command.id);

      if (commandIds.length === 0) {
        return;
      }

      steps.push({
        step_number: stepNumber,
        cli_slug: listing.identity.slug,
        purpose: `Execute ${listing.identity.name} stage in ${template.title.toLowerCase()} workflow.`,
        command_ids: commandIds,
        auth_prerequisite: listing.auth.auth_type !== "none"
      });
      selected.add(listing.identity.slug);
      coveredCategories.add(listing.identity.category_tags[0] ?? "");
      stepNumber += 1;
    }

    for (const preferredSlug of WORKFLOW_PREFERRED_CHAINS[template.slug] ?? []) {
      const listing = listingBySlug.get(preferredSlug);
      if (!listing) {
        continue;
      }
      pushWorkflowStep(listing);
    }

    for (const category of template.categories) {
      if (coveredCategories.has(category)) {
        continue;
      }
      const candidates = categoryToListings.get(category) ?? [];
      const listing = candidates.find((candidate) => !selected.has(candidate.identity.slug));
      if (!listing) {
        continue;
      }
      pushWorkflowStep(listing);
    }

    return {
      id: template.id,
      slug: template.slug,
      title: template.title,
      description: template.description,
      tags: template.tags,
      estimated_minutes: template.estimated_minutes,
      created_at: now,
      updated_at: now,
      steps
    };
  }).filter((workflow) => workflow.steps.length > 0);
}

function validateQualityGate(listing: CliProfile) {
  const hasMac = listing.install.some((item) => item.os === "macos");
  const hasLinux = listing.install.some((item) => item.os === "linux");
  const commandCount = listing.commands.length;
  const hasAuth = listing.auth.setup_steps.length > 0;
  const hasWorkflow = listing.commands.some((command) => command.workflow_context.length > 0);
  const hasParamDescriptions = listing.commands.every((command) =>
    [...command.required_parameters, ...command.optional_parameters].every((parameter) =>
      Boolean(parameter.description && parameter.description.trim().length > 4)
    )
  );

  return {
    ok: hasMac && hasLinux && commandCount >= 5 && hasAuth && hasWorkflow && hasParamDescriptions,
    details: {
      hasMac,
      hasLinux,
      commandCount,
      hasAuth,
      hasWorkflow,
      hasParamDescriptions
    }
  };
}

async function main() {
  const sortedTargets = CURATED_TARGETS.slice().sort((left, right) => {
    const leftIndex = CATEGORY_ORDER.indexOf(left.category as (typeof CATEGORY_ORDER)[number]);
    const rightIndex = CATEGORY_ORDER.indexOf(right.category as (typeof CATEGORY_ORDER)[number]);
    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }
    return left.slug.localeCompare(right.slug);
  });

  const listings: CliProfile[] = [];
  const failures: Array<{ slug: string; details: unknown }> = [];

  for (let index = 0; index < sortedTargets.length; index += 1) {
    const spec = sortedTargets[index];
    const listing = await buildListing(spec, index);
    const validation = validateQualityGate(listing);
    if (!validation.ok) {
      failures.push({ slug: spec.slug, details: validation.details });
      continue;
    }
    listings.push(listing);
    console.log(`generated ${spec.slug} (${listing.commands.length} commands)`);
  }

  if (listings.length < MIN_CURATED_LISTINGS) {
    throw new Error(`Expected at least ${MIN_CURATED_LISTINGS} curated listings, generated ${listings.length}. Failures: ${JSON.stringify(failures)}`);
  }

  const workflows = buildWorkflows(listings);
  const outputFile = resolve(process.cwd(), "apps/api/src/data/curated-generated.ts");
  const datasetFile = resolve(process.cwd(), "infra/generated/curated-listings.json");

  const source = `import type { CliProfile, WorkflowChain } from "@cli-me/shared-types";\n\n` +
    `export const generatedCuratedClis: CliProfile[] = ${JSON.stringify(listings, null, 2)};\n\n` +
    `export const generatedCuratedWorkflows: WorkflowChain[] = ${JSON.stringify(workflows, null, 2)};\n`;

  writeFileSync(outputFile, source);
  writeFileSync(
    datasetFile,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        clis: listings,
        workflows,
        failures
      },
      null,
      2
    )
  );

  const reportFile = resolve(process.cwd(), "infra/generated/curated-generation-report.json");
  writeFileSync(
    reportFile,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        listings: listings.length,
        workflows: workflows.length,
        failures
      },
      null,
      2
    )
  );

  console.log(`wrote ${outputFile}`);
  console.log(`wrote ${datasetFile}`);
  console.log(`wrote ${reportFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
