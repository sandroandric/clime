import type { CliProfile, WorkflowChain } from "@cli-me/shared-types";
import type { RegistryData } from "../lib/types.js";
import { curatedCliAdditions, curatedWorkflowAdditions } from "./curated-additions.js";
import { generatedCuratedClis, generatedCuratedWorkflows } from "./curated-generated.js";

const now = new Date().toISOString();
const DISALLOWED_SEED_SLUGS = new Set([
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

const clis: CliProfile[] = [
  {
    identity: {
      slug: "vercel",
      name: "Vercel CLI",
      publisher: "Vercel",
      description: "Deploy and manage web apps on Vercel",
      category_tags: ["deploy", "frontend", "hosting"],
      website: "https://vercel.com/docs/cli",
      repository: "https://github.com/vercel/vercel",
      verification_status: "community-curated",
      latest_version: "34.2.0",
      last_updated: now,
      last_verified: now,
      popularity_score: 95,
      trust_score: 94,
      permission_scope: ["filesystem", "network"],
      compatibility: [
        {
          agent_name: "codex",
          status: "verified",
          success_rate: 0.97,
          last_verified: now
        },
        {
          agent_name: "claude-code",
          status: "verified",
          success_rate: 0.96,
          last_verified: now
        }
      ]
    },
    install: [
      {
        os: "macos",
        package_manager: "brew",
        command: "brew install vercel-cli",
        checksum: undefined,
        dependencies: ["node>=20"]
      },
      {
        os: "linux",
        package_manager: "npm",
        command: "npm install -g vercel",
        checksum: undefined,
        dependencies: ["node>=20"]
      }
    ],
    auth: {
      auth_type: "login_command",
      setup_steps: [
        { order: 1, instruction: "Run login", command: "vercel login" },
        { order: 2, instruction: "Complete browser auth flow" }
      ],
      environment_variables: ["VERCEL_TOKEN"],
      token_refresh: "Token is long-lived; rotate manually from dashboard",
      scopes: ["projects:read", "deployments:write"]
    },
    commands: [
      {
        id: "vercel-deploy",
        cli_slug: "vercel",
        command: "vercel deploy --prod",
        description: "Deploy current project to production",
        required_parameters: [],
        optional_parameters: [
          {
            name: "--prod",
            type: "boolean",
            description: "Deploy to production"
          }
        ],
        examples: ["vercel deploy --prod"],
        expected_output: "URL and deployment metadata",
        common_errors: ["Authentication required", "Project not linked"],
        workflow_context: ["full-stack-saas", "nextjs-deploy"]
      },
      {
        id: "vercel-link",
        cli_slug: "vercel",
        command: "vercel link",
        description: "Link local directory to a Vercel project",
        required_parameters: [],
        optional_parameters: [],
        examples: ["vercel link"],
        expected_output: "Project link confirmation",
        common_errors: ["No permissions for selected team"],
        workflow_context: ["full-stack-saas"]
      }
    ],
    listing_version: {
      id: "lv_vercel_12",
      cli_slug: "vercel",
      version_number: 12,
      changed_fields: ["commands", "auth"],
      changelog: "Updated deploy command examples and auth scopes",
      updated_at: now
    }
  },
  {
    identity: {
      slug: "supabase",
      name: "Supabase CLI",
      publisher: "Supabase",
      description: "Manage Supabase projects, database, and migrations",
      category_tags: ["database", "backend", "postgres"],
      website: "https://supabase.com/docs/guides/cli",
      repository: "https://github.com/supabase/cli",
      verification_status: "community-curated",
      latest_version: "2.44.1",
      last_updated: now,
      last_verified: now,
      popularity_score: 90,
      trust_score: 92,
      permission_scope: ["filesystem", "network"],
      compatibility: [
        {
          agent_name: "codex",
          status: "verified",
          success_rate: 0.94,
          last_verified: now
        },
        {
          agent_name: "openclaw",
          status: "partial",
          success_rate: 0.88,
          last_verified: now
        }
      ]
    },
    install: [
      {
        os: "macos",
        package_manager: "brew",
        command: "brew install supabase/tap/supabase",
        checksum: undefined,
        dependencies: []
      },
      {
        os: "linux",
        package_manager: "npm",
        command: "npm install -g supabase",
        checksum: undefined,
        dependencies: ["node>=18"]
      }
    ],
    auth: {
      auth_type: "api_key",
      setup_steps: [
        {
          order: 1,
          instruction: "Set access token in environment",
          command: "export SUPABASE_ACCESS_TOKEN=<token>"
        },
        {
          order: 2,
          instruction: "Login if needed",
          command: "supabase login"
        }
      ],
      environment_variables: ["SUPABASE_ACCESS_TOKEN"],
      token_refresh: "Rotate personal access token in dashboard",
      scopes: ["project:read", "db:write"]
    },
    commands: [
      {
        id: "supabase-link",
        cli_slug: "supabase",
        command: "supabase link --project-ref <ref>",
        description: "Link project reference to current directory",
        required_parameters: [
          {
            name: "--project-ref",
            type: "string",
            description: "Project reference id"
          }
        ],
        optional_parameters: [],
        examples: ["supabase link --project-ref abc123"],
        expected_output: "Linked project confirmation",
        common_errors: ["Invalid access token"],
        workflow_context: ["full-stack-saas"]
      },
      {
        id: "supabase-db-push",
        cli_slug: "supabase",
        command: "supabase db push",
        description: "Push local migrations to remote database",
        required_parameters: [],
        optional_parameters: [],
        examples: ["supabase db push"],
        expected_output: "Migration execution summary",
        common_errors: ["Schema conflicts"],
        workflow_context: ["full-stack-saas"]
      }
    ],
    listing_version: {
      id: "lv_supabase_8",
      cli_slug: "supabase",
      version_number: 8,
      changed_fields: ["commands"],
      changelog: "Added migration push troubleshooting notes",
      updated_at: now
    }
  },
  {
    identity: {
      slug: "stripe",
      name: "Stripe CLI",
      publisher: "Stripe",
      description: "Test webhooks and payment operations from terminal",
      category_tags: ["payments", "fintech", "api"],
      website: "https://stripe.com/docs/stripe-cli",
      repository: "https://github.com/stripe/stripe-cli",
      verification_status: "community-curated",
      latest_version: "1.23.4",
      last_updated: now,
      last_verified: now,
      popularity_score: 88,
      trust_score: 91,
      permission_scope: ["network", "credentials"],
      compatibility: [
        {
          agent_name: "codex",
          status: "verified",
          success_rate: 0.95,
          last_verified: now
        },
        {
          agent_name: "gemini-cli",
          status: "partial",
          success_rate: 0.82,
          last_verified: now
        }
      ]
    },
    install: [
      {
        os: "macos",
        package_manager: "brew",
        command: "brew install stripe/stripe-cli/stripe",
        checksum: undefined,
        dependencies: []
      },
      {
        os: "linux",
        package_manager: "apt",
        command: "sudo apt install stripe",
        checksum: undefined,
        dependencies: []
      }
    ],
    auth: {
      auth_type: "login_command",
      setup_steps: [
        { order: 1, instruction: "Run stripe login", command: "stripe login" },
        { order: 2, instruction: "Confirm browser session" }
      ],
      environment_variables: ["STRIPE_API_KEY"],
      token_refresh: "Session token expires, rerun stripe login",
      scopes: ["read_write"]
    },
    commands: [
      {
        id: "stripe-listen",
        cli_slug: "stripe",
        command: "stripe listen --forward-to localhost:3000/api/webhooks",
        description: "Forward Stripe webhooks to local endpoint",
        required_parameters: [
          {
            name: "--forward-to",
            type: "string",
            description: "Local URL to forward events"
          }
        ],
        optional_parameters: [],
        examples: ["stripe listen --forward-to localhost:3000/api/webhooks"],
        expected_output: "Webhook signing secret and event stream",
        common_errors: ["Authentication required", "Port not reachable"],
        workflow_context: ["full-stack-saas"]
      },
      {
        id: "stripe-trigger",
        cli_slug: "stripe",
        command: "stripe trigger payment_intent.succeeded",
        description: "Trigger test payment webhook event",
        required_parameters: [],
        optional_parameters: [],
        examples: ["stripe trigger payment_intent.succeeded"],
        expected_output: "Triggered event output",
        common_errors: ["Webhook not configured"],
        workflow_context: ["full-stack-saas"]
      }
    ],
    listing_version: {
      id: "lv_stripe_11",
      cli_slug: "stripe",
      version_number: 11,
      changed_fields: ["auth"],
      changelog: "Updated auth flow with browser approval details",
      updated_at: now
    }
  },
  {
    identity: {
      slug: "resend",
      name: "Resend CLI",
      publisher: "Resend",
      description: "Manage email templates and domains",
      category_tags: ["email", "notifications"],
      website: "https://resend.com/docs",
      repository: "https://github.com/resend/resend-node",
      verification_status: "community-curated",
      latest_version: "0.7.2",
      last_updated: now,
      last_verified: now,
      popularity_score: 72,
      trust_score: 80,
      permission_scope: ["network"],
      compatibility: [
        {
          agent_name: "codex",
          status: "partial",
          success_rate: 0.86,
          last_verified: now
        }
      ]
    },
    install: [
      {
        os: "any",
        package_manager: "npm",
        command: "npm install -g resend-cli",
        checksum: undefined,
        dependencies: ["node>=18"]
      }
    ],
    auth: {
      auth_type: "api_key",
      setup_steps: [
        {
          order: 1,
          instruction: "Set API key",
          command: "export RESEND_API_KEY=<key>"
        }
      ],
      environment_variables: ["RESEND_API_KEY"],
      token_refresh: "Manual token rotation",
      scopes: ["emails:write"]
    },
    commands: [
      {
        id: "resend-domain-add",
        cli_slug: "resend",
        command: "resend domains add <domain>",
        description: "Add and verify sending domain",
        required_parameters: [
          {
            name: "domain",
            type: "string",
            description: "Domain name"
          }
        ],
        optional_parameters: [],
        examples: ["resend domains add example.com"],
        expected_output: "DNS verification instructions",
        common_errors: ["Domain already exists"],
        workflow_context: ["full-stack-saas"]
      }
    ],
    listing_version: {
      id: "lv_resend_4",
      cli_slug: "resend",
      version_number: 4,
      changed_fields: ["commands"],
      changelog: "Added domain setup command",
      updated_at: now
    }
  },
  {
    identity: {
      slug: "fly",
      name: "Flyctl",
      publisher: "Fly.io",
      description: "Deploy apps globally with Fly.io",
      category_tags: ["deploy", "containers", "edge"],
      website: "https://fly.io/docs/flyctl",
      repository: "https://github.com/superfly/flyctl",
      verification_status: "community-curated",
      latest_version: "0.3.212",
      last_updated: now,
      last_verified: now,
      popularity_score: 78,
      trust_score: 87,
      permission_scope: ["filesystem", "network"],
      compatibility: [
        {
          agent_name: "codex",
          status: "verified",
          success_rate: 0.93,
          last_verified: now
        }
      ]
    },
    install: [
      {
        os: "macos",
        package_manager: "brew",
        command: "brew install flyctl",
        checksum: undefined,
        dependencies: []
      },
      {
        os: "linux",
        package_manager: "curl",
        command: "curl -L https://fly.io/install.sh | sh",
        checksum: undefined,
        dependencies: []
      }
    ],
    auth: {
      auth_type: "login_command",
      setup_steps: [{ order: 1, instruction: "Authenticate", command: "fly auth login" }],
      environment_variables: ["FLY_API_TOKEN"],
      token_refresh: "Rotate API tokens in dashboard",
      scopes: ["apps:write"]
    },
    commands: [
      {
        id: "fly-launch",
        cli_slug: "fly",
        command: "fly launch",
        description: "Create Fly app config and initialize deployment",
        required_parameters: [],
        optional_parameters: [],
        examples: ["fly launch"],
        expected_output: "fly.toml and app setup",
        common_errors: ["Missing Dockerfile"],
        workflow_context: ["edge-api-launch"]
      }
    ],
    listing_version: {
      id: "lv_fly_6",
      cli_slug: "fly",
      version_number: 6,
      changed_fields: ["install"],
      changelog: "Added checksum references",
      updated_at: now
    }
  }
];

const workflows: WorkflowChain[] = [
  {
    id: "wf_full_stack_saas",
    slug: "full-stack-saas",
    title: "Deploy Full-Stack SaaS",
    description:
      "Deploy web app, connect database, wire payments, and configure transactional email.",
    tags: ["saas", "deploy", "payments"],
    estimated_minutes: 35,
    created_at: now,
    updated_at: now,
    steps: [
      {
        step_number: 1,
        cli_slug: "vercel",
        purpose: "Deploy frontend and API",
        command_ids: ["vercel-link", "vercel-deploy"],
        auth_prerequisite: true
      },
      {
        step_number: 2,
        cli_slug: "supabase",
        purpose: "Link database and apply migrations",
        command_ids: ["supabase-link", "supabase-db-push"],
        auth_prerequisite: true
      },
      {
        step_number: 3,
        cli_slug: "stripe",
        purpose: "Enable payment event testing",
        command_ids: ["stripe-listen", "stripe-trigger"],
        auth_prerequisite: true
      },
      {
        step_number: 4,
        cli_slug: "resend",
        purpose: "Add email domain for notifications",
        command_ids: ["resend-domain-add"],
        auth_prerequisite: true
      }
    ]
  },
  {
    id: "wf_edge_api_launch",
    slug: "edge-api-launch",
    title: "Launch Edge API",
    description: "Provision and deploy an edge API stack",
    tags: ["api", "edge", "deploy"],
    estimated_minutes: 20,
    created_at: now,
    updated_at: now,
    steps: [
      {
        step_number: 1,
        cli_slug: "fly",
        purpose: "Initialize and deploy edge service",
        command_ids: ["fly-launch"],
        auth_prerequisite: true
      }
    ]
  }
];

const CORE_AGENT_NAMES = [
  "claude-code",
  "codex-cli",
  "gemini-cli",
  "cline",
  "aider",
  "opencode"
] as const;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function statusFromRate(rate: number): "verified" | "partial" | "failed" {
  if (rate >= 0.8) {
    return "verified";
  }
  if (rate >= 0.5) {
    return "partial";
  }
  return "failed";
}

function hashFraction(value: string) {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return (hash % 10_000) / 10_000;
}

function canonicalAgentName(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "codex") {
    return "codex-cli";
  }
  if (normalized === "openclaw") {
    return "opencode";
  }
  return normalized;
}

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

function estimateAgentCompatibility(cli: CliProfile, agentName: (typeof CORE_AGENT_NAMES)[number]) {
  const authPenaltyByType: Record<CliProfile["auth"]["auth_type"], number> = {
    none: 0,
    api_key: 0.04,
    config_file: 0.06,
    login_command: 0.08,
    oauth: 0.12
  };

  const permissionPenalty =
    (cli.identity.permission_scope.includes("network") ? 0.03 : 0) +
    (cli.identity.permission_scope.includes("filesystem") ? 0.035 : 0) +
    (cli.identity.permission_scope.includes("credentials") ? 0.05 : 0) +
    (cli.identity.permission_scope.includes("docker-socket") ? 0.07 : 0) +
    (cli.identity.permission_scope.includes("kubeconfig") ? 0.06 : 0);

  const browserAuthPenalty =
    cli.auth.auth_type === "oauth" || cli.auth.auth_type === "login_command" ? 0.04 : 0;

  const interactivePenalty = cli.commands.some(
    (command) =>
      command.command.toLowerCase().includes("login") ||
      command.expected_output.toLowerCase().includes("interactive")
  )
    ? 0.03
    : 0;

  const complexityPenalty = Math.max(0, cli.commands.length - 8) * 0.004;
  const trustBoost = (cli.identity.trust_score - 75) / 220;
  const popularityBoost = Math.min(0.06, cli.identity.popularity_score / 1500);

  const agentOffset: Record<(typeof CORE_AGENT_NAMES)[number], number> = {
    "claude-code": 0.015,
    "codex-cli": 0.03,
    "gemini-cli": -0.01,
    cline: -0.045,
    aider: -0.03,
    opencode: -0.02
  };

  const browserAgentPenalty =
    browserAuthPenalty > 0 && ["cline", "aider", "opencode", "gemini-cli"].includes(agentName)
      ? 0.03
      : 0;

  const jitter = (hashFraction(`${cli.identity.slug}:${agentName}`) - 0.5) * 0.06;

  return clamp(
    0.86 +
      trustBoost +
      popularityBoost +
      agentOffset[agentName] +
      jitter -
      authPenaltyByType[cli.auth.auth_type] -
      permissionPenalty -
      browserAuthPenalty -
      browserAgentPenalty -
      interactivePenalty -
      complexityPenalty,
    0.38,
    0.98
  );
}

function normalizeCompatibility(cli: CliProfile) {
  const nowIso = new Date().toISOString();
  const existingByAgent = new Map(
    cli.identity.compatibility.map((item) => [canonicalAgentName(item.agent_name), item] as const)
  );

  return CORE_AGENT_NAMES.map((agentName) => {
    const existing = existingByAgent.get(agentName);
    const estimate = estimateAgentCompatibility(cli, agentName);
    const hasMeasuredCompatibility = Boolean(existing && existing.status !== "untested");
    const successRate = hasMeasuredCompatibility
      ? clamp((existing?.success_rate ?? estimate) * 0.75 + estimate * 0.25, 0, 1)
      : estimate;
    const status: CliProfile["identity"]["compatibility"][number]["status"] =
      hasMeasuredCompatibility ? statusFromRate(successRate) : "untested";

    return {
      agent_name: agentName,
      status,
      success_rate: successRate,
      last_verified: existing?.last_verified ?? nowIso
    };
  });
}

function enrichCliProfile(cli: CliProfile): CliProfile {
  const next = structuredClone(cli);
  next.identity.publisher = canonicalPublisherName(next.identity.publisher);
  next.identity.compatibility = normalizeCompatibility(next);
  return next;
}

export function createSeedData(): RegistryData {
  const allClis = mergeClis(clis, curatedCliAdditions, generatedCuratedClis)
    .filter((cli) => !DISALLOWED_SEED_SLUGS.has(cli.identity.slug))
    .map(enrichCliProfile);

  const allowedCliSlugs = new Set(allClis.map((cli) => cli.identity.slug));
  const allWorkflows = mergeWorkflows(workflows, curatedWorkflowAdditions, generatedCuratedWorkflows)
    .map((workflow) => ({
      ...workflow,
      steps: workflow.steps.filter((step) => allowedCliSlugs.has(step.cli_slug))
    }))
    .filter((workflow) => workflow.steps.length > 0);

  return {
    clis: allClis,
    workflows: allWorkflows,
    submissions: [],
    publisherClaims: [],
    reports: [],
    usageEvents: [],
    unmetRequests: [],
    listingVersions: allClis.flatMap((cli) => (cli.listing_version ? [cli.listing_version] : [])),
    changes: allClis.map((cli, idx) => ({
      id: `chg_seed_${idx + 1}`,
      kind: "listing_updated" as const,
      entity_id: cli.identity.slug,
      occurred_at: now,
      payload: {
        version_number: cli.listing_version?.version_number ?? 1
      }
    })),
    rankings: []
  };
}

function mergeClis(...groups: CliProfile[][]) {
  const merged = new Map<string, CliProfile>();
  for (const group of groups) {
    for (const cli of group) {
      if (merged.has(cli.identity.slug)) {
        merged.delete(cli.identity.slug);
      }
      merged.set(cli.identity.slug, cli);
    }
  }
  return [...merged.values()];
}

function mergeWorkflows(...groups: WorkflowChain[][]) {
  const merged = new Map<string, WorkflowChain>();
  for (const group of groups) {
    for (const workflow of group) {
      if (merged.has(workflow.id)) {
        merged.delete(workflow.id);
      }
      merged.set(workflow.id, workflow);
    }
  }
  return [...merged.values()];
}
