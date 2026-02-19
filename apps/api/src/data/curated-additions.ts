import type { CliProfile, WorkflowChain } from "@cli-me/shared-types";

const now = new Date().toISOString();

export const curatedCliAdditions: CliProfile[] = [
  {
    identity: {
      slug: "netlify",
      name: "Netlify CLI",
      publisher: "Netlify",
      description: "Deploy and manage websites and serverless functions on Netlify",
      category_tags: ["deploy", "frontend", "serverless"],
      website: "https://docs.netlify.com/cli/get-started/",
      repository: "https://github.com/netlify/cli",
      verification_status: "community-curated",
      latest_version: "17.38.0",
      last_updated: now,
      last_verified: now,
      popularity_score: 74,
      trust_score: 86,
      permission_scope: ["filesystem", "network"],
      compatibility: [
        {
          agent_name: "codex",
          status: "verified",
          success_rate: 0.92,
          last_verified: now
        }
      ]
    },
    install: [
      {
        os: "any",
        package_manager: "npm",
        command: "npm install -g netlify-cli",
        checksum: undefined,
        dependencies: ["node>=18"]
      }
    ],
    auth: {
      auth_type: "login_command",
      setup_steps: [
        { order: 1, instruction: "Login with browser flow", command: "netlify login" },
        { order: 2, instruction: "Link current project", command: "netlify link" }
      ],
      environment_variables: ["NETLIFY_AUTH_TOKEN"],
      token_refresh: "Rotate personal access token in Netlify user settings",
      scopes: ["sites:write", "deploys:write"]
    },
    commands: [
      {
        id: "netlify-link",
        cli_slug: "netlify",
        command: "netlify link",
        description: "Connect local repository to an existing Netlify site",
        required_parameters: [],
        optional_parameters: [],
        examples: ["netlify link"],
        expected_output: "Linked site id and team context",
        common_errors: ["No site access", "Team scope mismatch"],
        workflow_context: ["jamstack-launch"]
      },
      {
        id: "netlify-deploy-prod",
        cli_slug: "netlify",
        command: "netlify deploy --prod",
        description: "Deploy current build output to production",
        required_parameters: [],
        optional_parameters: [
          { name: "--prod", type: "boolean", description: "Deploy to production context" }
        ],
        examples: ["netlify deploy --prod --dir=dist"],
        expected_output: "Production deploy URL and deploy id",
        common_errors: ["Build directory missing"],
        workflow_context: ["jamstack-launch"]
      }
    ],
    listing_version: {
      id: "lv_netlify_1",
      cli_slug: "netlify",
      version_number: 1,
      changed_fields: ["commands", "auth"],
      changelog: "Initial curated listing",
      updated_at: now
    }
  },
  {
    identity: {
      slug: "gh",
      name: "GitHub CLI",
      publisher: "GitHub",
      description: "Manage GitHub repositories, issues, and pull requests from terminal",
      category_tags: ["git", "source-control", "collaboration"],
      website: "https://cli.github.com/manual/",
      repository: "https://github.com/cli/cli",
      verification_status: "community-curated",
      latest_version: "2.72.0",
      last_updated: now,
      last_verified: now,
      popularity_score: 93,
      trust_score: 95,
      permission_scope: ["network", "git"],
      compatibility: [
        {
          agent_name: "codex",
          status: "verified",
          success_rate: 0.98,
          last_verified: now
        }
      ]
    },
    install: [
      { os: "macos", package_manager: "brew", command: "brew install gh", checksum: undefined, dependencies: [] },
      { os: "linux", package_manager: "apt", command: "sudo apt install gh", checksum: undefined, dependencies: [] }
    ],
    auth: {
      auth_type: "login_command",
      setup_steps: [
        { order: 1, instruction: "Authenticate with GitHub", command: "gh auth login" }
      ],
      environment_variables: ["GH_TOKEN"],
      token_refresh: "Refresh PAT manually when expired/revoked",
      scopes: ["repo", "read:org"]
    },
    commands: [
      {
        id: "gh-repo-create",
        cli_slug: "gh",
        command: "gh repo create",
        description: "Create a repository under the authenticated account",
        required_parameters: [],
        optional_parameters: [
          { name: "--private", type: "boolean", description: "Create private repository" }
        ],
        examples: ["gh repo create acme-saas --private --clone"],
        expected_output: "Repository URL and clone path",
        common_errors: ["Repository already exists"],
        workflow_context: ["saas-bootstrap"]
      },
      {
        id: "gh-pr-create",
        cli_slug: "gh",
        command: "gh pr create",
        description: "Open a pull request for current branch",
        required_parameters: [],
        optional_parameters: [
          { name: "--fill", type: "boolean", description: "Auto-fill PR title/body from commits" }
        ],
        examples: ["gh pr create --fill --base main"],
        expected_output: "Pull request URL",
        common_errors: ["No commits between branches"],
        workflow_context: ["saas-bootstrap"]
      }
    ],
    listing_version: {
      id: "lv_gh_1",
      cli_slug: "gh",
      version_number: 1,
      changed_fields: ["commands"],
      changelog: "Initial curated listing",
      updated_at: now
    }
  },
  {
    identity: {
      slug: "wrangler",
      name: "Cloudflare Wrangler",
      publisher: "Cloudflare",
      description: "Deploy and manage Cloudflare Workers and Pages",
      category_tags: ["edge", "serverless", "deploy"],
      website: "https://developers.cloudflare.com/workers/wrangler/",
      repository: "https://github.com/cloudflare/workers-sdk",
      verification_status: "community-curated",
      latest_version: "3.113.0",
      last_updated: now,
      last_verified: now,
      popularity_score: 85,
      trust_score: 90,
      permission_scope: ["filesystem", "network"],
      compatibility: [
        {
          agent_name: "codex",
          status: "verified",
          success_rate: 0.95,
          last_verified: now
        }
      ]
    },
    install: [
      {
        os: "any",
        package_manager: "npm",
        command: "npm install -g wrangler",
        checksum: undefined,
        dependencies: ["node>=18"]
      }
    ],
    auth: {
      auth_type: "login_command",
      setup_steps: [{ order: 1, instruction: "Authenticate Cloudflare account", command: "wrangler login" }],
      environment_variables: ["CLOUDFLARE_API_TOKEN"],
      token_refresh: "Regenerate API token in dashboard if revoked",
      scopes: ["workers:write", "account:read"]
    },
    commands: [
      {
        id: "wrangler-deploy",
        cli_slug: "wrangler",
        command: "wrangler deploy",
        description: "Deploy Worker script to Cloudflare edge",
        required_parameters: [],
        optional_parameters: [],
        examples: ["wrangler deploy"],
        expected_output: "Worker version and deployment URL",
        common_errors: ["Missing wrangler.toml", "No auth token"],
        workflow_context: ["edge-worker-launch"]
      },
      {
        id: "wrangler-secret-put",
        cli_slug: "wrangler",
        command: "wrangler secret put",
        description: "Set encrypted secret for Worker runtime",
        required_parameters: [
          { name: "name", type: "string", description: "Secret variable name" }
        ],
        optional_parameters: [],
        examples: ["wrangler secret put STRIPE_API_KEY"],
        expected_output: "Secret upload confirmation",
        common_errors: ["Account permission denied"],
        workflow_context: ["edge-worker-launch"]
      }
    ],
    listing_version: {
      id: "lv_wrangler_1",
      cli_slug: "wrangler",
      version_number: 1,
      changed_fields: ["commands", "auth"],
      changelog: "Initial curated listing",
      updated_at: now
    }
  },
  {
    identity: {
      slug: "docker",
      name: "Docker CLI",
      publisher: "Docker",
      description: "Build and run container images",
      category_tags: ["containers", "devops", "build"],
      website: "https://docs.docker.com/reference/cli/docker/",
      repository: "https://github.com/docker/cli",
      verification_status: "community-curated",
      latest_version: "27.5.1",
      last_updated: now,
      last_verified: now,
      popularity_score: 98,
      trust_score: 96,
      permission_scope: ["filesystem", "network", "docker-socket"],
      compatibility: [
        {
          agent_name: "codex",
          status: "verified",
          success_rate: 0.97,
          last_verified: now
        }
      ]
    },
    install: [
      { os: "macos", package_manager: "brew", command: "brew install --cask docker", checksum: undefined, dependencies: [] },
      { os: "linux", package_manager: "apt", command: "sudo apt install docker.io", checksum: undefined, dependencies: [] }
    ],
    auth: {
      auth_type: "none",
      setup_steps: [
        { order: 1, instruction: "Ensure Docker daemon is running" }
      ],
      environment_variables: [],
      token_refresh: "No token needed for local daemon",
      scopes: []
    },
    commands: [
      {
        id: "docker-build",
        cli_slug: "docker",
        command: "docker build -t <tag> .",
        description: "Build container image from Dockerfile",
        required_parameters: [
          { name: "-t", type: "string", description: "Target image tag" }
        ],
        optional_parameters: [],
        examples: ["docker build -t acme-api:latest ."],
        expected_output: "Build step logs and resulting image id",
        common_errors: ["Dockerfile not found"],
        workflow_context: ["container-api-launch"]
      },
      {
        id: "docker-run",
        cli_slug: "docker",
        command: "docker run -p 3000:3000 <image>",
        description: "Run container exposing service port",
        required_parameters: [
          { name: "-p", type: "string", description: "Port mapping" }
        ],
        optional_parameters: [],
        examples: ["docker run -p 3000:3000 acme-api:latest"],
        expected_output: "Container logs",
        common_errors: ["Port already in use", "Image not found"],
        workflow_context: ["container-api-launch"]
      }
    ],
    listing_version: {
      id: "lv_docker_1",
      cli_slug: "docker",
      version_number: 1,
      changed_fields: ["commands"],
      changelog: "Initial curated listing",
      updated_at: now
    }
  },
  {
    identity: {
      slug: "kubectl",
      name: "kubectl",
      publisher: "Kubernetes",
      description: "Control Kubernetes clusters from terminal",
      category_tags: ["kubernetes", "devops", "orchestration"],
      website: "https://kubernetes.io/docs/reference/kubectl/",
      repository: "https://github.com/kubernetes/kubectl",
      verification_status: "community-curated",
      latest_version: "1.32.1",
      last_updated: now,
      last_verified: now,
      popularity_score: 92,
      trust_score: 91,
      permission_scope: ["network", "kubeconfig"],
      compatibility: [
        {
          agent_name: "codex",
          status: "partial",
          success_rate: 0.84,
          last_verified: now
        }
      ]
    },
    install: [
      { os: "macos", package_manager: "brew", command: "brew install kubectl", checksum: undefined, dependencies: [] },
      { os: "linux", package_manager: "apt", command: "sudo apt install kubectl", checksum: undefined, dependencies: [] }
    ],
    auth: {
      auth_type: "config_file",
      setup_steps: [
        { order: 1, instruction: "Set cluster context", command: "kubectl config use-context <context>" }
      ],
      environment_variables: ["KUBECONFIG"],
      token_refresh: "Depends on cluster auth provider",
      scopes: ["cluster:read", "cluster:write"]
    },
    commands: [
      {
        id: "kubectl-apply",
        cli_slug: "kubectl",
        command: "kubectl apply -f <manifest>",
        description: "Apply Kubernetes manifests to current cluster",
        required_parameters: [
          { name: "-f", type: "string", description: "Manifest file or directory" }
        ],
        optional_parameters: [],
        examples: ["kubectl apply -f k8s/deployment.yaml"],
        expected_output: "Resource apply status",
        common_errors: ["Forbidden", "Invalid schema"],
        workflow_context: ["k8s-service-deploy"]
      },
      {
        id: "kubectl-get-pods",
        cli_slug: "kubectl",
        command: "kubectl get pods",
        description: "List pod status in current namespace",
        required_parameters: [],
        optional_parameters: [],
        examples: ["kubectl get pods -n production"],
        expected_output: "Tabular pod status list",
        common_errors: ["Context not set"],
        workflow_context: ["k8s-service-deploy"]
      }
    ],
    listing_version: {
      id: "lv_kubectl_1",
      cli_slug: "kubectl",
      version_number: 1,
      changed_fields: ["commands", "auth"],
      changelog: "Initial curated listing",
      updated_at: now
    }
  },
  {
    identity: {
      slug: "aws",
      name: "AWS CLI",
      publisher: "Amazon Web Services",
      description: "Manage AWS infrastructure and services",
      category_tags: ["cloud", "infrastructure", "aws"],
      website: "https://docs.aws.amazon.com/cli/latest/reference/",
      repository: "https://github.com/aws/aws-cli",
      verification_status: "community-curated",
      latest_version: "2.24.8",
      last_updated: now,
      last_verified: now,
      popularity_score: 96,
      trust_score: 94,
      permission_scope: ["network", "credentials"],
      compatibility: [
        {
          agent_name: "codex",
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
        command: "brew install awscli",
        checksum: undefined,
        dependencies: []
      },
      {
        os: "linux",
        package_manager: "apt",
        command: "sudo apt install awscli",
        checksum: undefined,
        dependencies: []
      }
    ],
    auth: {
      auth_type: "config_file",
      setup_steps: [
        { order: 1, instruction: "Configure AWS credentials", command: "aws configure" }
      ],
      environment_variables: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"],
      token_refresh: "Rotate access keys or assume role with refreshed session tokens",
      scopes: ["depends-on-iam-policy"]
    },
    commands: [
      {
        id: "aws-s3-sync",
        cli_slug: "aws",
        command: "aws s3 sync <src> <dest>",
        description: "Sync local directory to S3 bucket",
        required_parameters: [
          { name: "src", type: "string", description: "Source path" },
          { name: "dest", type: "string", description: "Destination S3 URI" }
        ],
        optional_parameters: [],
        examples: ["aws s3 sync ./dist s3://acme-site"],
        expected_output: "Transfer summary logs",
        common_errors: ["AccessDenied", "NoSuchBucket"],
        workflow_context: ["aws-static-site"]
      },
      {
        id: "aws-lambda-update",
        cli_slug: "aws",
        command: "aws lambda update-function-code",
        description: "Update Lambda function package",
        required_parameters: [
          { name: "--function-name", type: "string", description: "Target function name" },
          { name: "--zip-file", type: "string", description: "Zip payload" }
        ],
        optional_parameters: [],
        examples: [
          "aws lambda update-function-code --function-name acme-api --zip-file fileb://function.zip"
        ],
        expected_output: "Updated function configuration",
        common_errors: ["InvalidParameterValue", "ResourceNotFoundException"],
        workflow_context: ["aws-static-site"]
      }
    ],
    listing_version: {
      id: "lv_aws_1",
      cli_slug: "aws",
      version_number: 1,
      changed_fields: ["commands", "auth"],
      changelog: "Initial curated listing",
      updated_at: now
    }
  },
  {
    identity: {
      slug: "gcloud",
      name: "Google Cloud CLI",
      publisher: "Google Cloud",
      description: "Manage GCP resources and deployments",
      category_tags: ["cloud", "gcp", "deploy"],
      website: "https://cloud.google.com/sdk/gcloud/reference",
      repository: "https://github.com/google-cloud-sdk-unofficial/google-cloud-sdk",
      verification_status: "community-curated",
      latest_version: "516.0.0",
      last_updated: now,
      last_verified: now,
      popularity_score: 89,
      trust_score: 88,
      permission_scope: ["network", "credentials"],
      compatibility: [
        {
          agent_name: "codex",
          status: "partial",
          success_rate: 0.8,
          last_verified: now
        }
      ]
    },
    install: [
      {
        os: "macos",
        package_manager: "brew",
        command: "brew install --cask google-cloud-sdk",
        checksum: undefined,
        dependencies: []
      }
    ],
    auth: {
      auth_type: "login_command",
      setup_steps: [
        { order: 1, instruction: "Authenticate account", command: "gcloud auth login" },
        { order: 2, instruction: "Set project", command: "gcloud config set project <project-id>" }
      ],
      environment_variables: ["GOOGLE_APPLICATION_CREDENTIALS"],
      token_refresh: "Re-run auth login or refresh service account credentials",
      scopes: ["cloud-platform"]
    },
    commands: [
      {
        id: "gcloud-run-deploy",
        cli_slug: "gcloud",
        command: "gcloud run deploy",
        description: "Deploy container image to Cloud Run",
        required_parameters: [
          { name: "SERVICE", type: "string", description: "Cloud Run service name" }
        ],
        optional_parameters: [],
        examples: ["gcloud run deploy acme-api --image gcr.io/acme/api:latest --region us-central1"],
        expected_output: "Service URL and revision",
        common_errors: ["Permission denied", "Image not found"],
        workflow_context: ["gcp-service-launch"]
      },
      {
        id: "gcloud-functions-deploy",
        cli_slug: "gcloud",
        command: "gcloud functions deploy",
        description: "Deploy Cloud Function",
        required_parameters: [
          { name: "NAME", type: "string", description: "Function name" }
        ],
        optional_parameters: [],
        examples: [
          "gcloud functions deploy acmeWebhook --runtime nodejs20 --trigger-http --allow-unauthenticated"
        ],
        expected_output: "Function deployment summary",
        common_errors: ["Runtime unsupported"],
        workflow_context: ["gcp-service-launch"]
      }
    ],
    listing_version: {
      id: "lv_gcloud_1",
      cli_slug: "gcloud",
      version_number: 1,
      changed_fields: ["commands"],
      changelog: "Initial curated listing",
      updated_at: now
    }
  },
  {
    identity: {
      slug: "prisma",
      name: "Prisma CLI",
      publisher: "Prisma",
      description: "Manage Prisma schema, migrations, and client generation",
      category_tags: ["database", "orm", "migrations"],
      website: "https://www.prisma.io/docs/orm/reference/prisma-cli-reference",
      repository: "https://github.com/prisma/prisma",
      verification_status: "community-curated",
      latest_version: "6.2.1",
      last_updated: now,
      last_verified: now,
      popularity_score: 82,
      trust_score: 89,
      permission_scope: ["filesystem", "database"],
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
        os: "any",
        package_manager: "npm",
        command: "npm install prisma --save-dev",
        checksum: undefined,
        dependencies: ["node>=18"]
      }
    ],
    auth: {
      auth_type: "none",
      setup_steps: [
        { order: 1, instruction: "Ensure DATABASE_URL is configured in environment" }
      ],
      environment_variables: ["DATABASE_URL"],
      token_refresh: "No token required for local migration commands",
      scopes: []
    },
    commands: [
      {
        id: "prisma-migrate-deploy",
        cli_slug: "prisma",
        command: "prisma migrate deploy",
        description: "Apply existing Prisma migrations to target database",
        required_parameters: [],
        optional_parameters: [],
        examples: ["npx prisma migrate deploy"],
        expected_output: "Migration execution summary",
        common_errors: ["Migration drift detected", "Database unreachable"],
        workflow_context: ["saas-bootstrap"]
      },
      {
        id: "prisma-generate",
        cli_slug: "prisma",
        command: "prisma generate",
        description: "Generate Prisma client from schema",
        required_parameters: [],
        optional_parameters: [],
        examples: ["npx prisma generate"],
        expected_output: "Generated client artifact",
        common_errors: ["Schema validation failed"],
        workflow_context: ["saas-bootstrap"]
      }
    ],
    listing_version: {
      id: "lv_prisma_1",
      cli_slug: "prisma",
      version_number: 1,
      changed_fields: ["commands"],
      changelog: "Initial curated listing",
      updated_at: now
    }
  },
  {
    identity: {
      slug: "terraform",
      name: "Terraform CLI",
      publisher: "HashiCorp",
      description: "Provision infrastructure declaratively",
      category_tags: ["infrastructure", "iac", "devops"],
      website: "https://developer.hashicorp.com/terraform/cli",
      repository: "https://github.com/hashicorp/terraform",
      verification_status: "community-curated",
      latest_version: "1.11.0",
      last_updated: now,
      last_verified: now,
      popularity_score: 91,
      trust_score: 93,
      permission_scope: ["filesystem", "network", "cloud-credentials"],
      compatibility: [
        {
          agent_name: "codex",
          status: "partial",
          success_rate: 0.79,
          last_verified: now
        }
      ]
    },
    install: [
      {
        os: "macos",
        package_manager: "brew",
        command: "brew tap hashicorp/tap && brew install hashicorp/tap/terraform",
        checksum: undefined,
        dependencies: []
      }
    ],
    auth: {
      auth_type: "config_file",
      setup_steps: [{ order: 1, instruction: "Set cloud provider credentials before apply" }],
      environment_variables: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"],
      token_refresh: "Depends on provider token policy",
      scopes: ["depends-on-provider-policy"]
    },
    commands: [
      {
        id: "terraform-init",
        cli_slug: "terraform",
        command: "terraform init",
        description: "Initialize Terraform working directory",
        required_parameters: [],
        optional_parameters: [],
        examples: ["terraform init"],
        expected_output: "Provider/plugin initialization output",
        common_errors: ["Backend config missing"],
        workflow_context: ["infra-bootstrap"]
      },
      {
        id: "terraform-apply",
        cli_slug: "terraform",
        command: "terraform apply",
        description: "Apply execution plan to provision resources",
        required_parameters: [],
        optional_parameters: [
          { name: "-auto-approve", type: "boolean", description: "Skip interactive approval" }
        ],
        examples: ["terraform apply -auto-approve"],
        expected_output: "Resource change summary",
        common_errors: ["Provider auth failure", "State lock timeout"],
        workflow_context: ["infra-bootstrap"]
      }
    ],
    listing_version: {
      id: "lv_terraform_1",
      cli_slug: "terraform",
      version_number: 1,
      changed_fields: ["commands"],
      changelog: "Initial curated listing",
      updated_at: now
    }
  },
  {
    identity: {
      slug: "firebase",
      name: "Firebase CLI",
      publisher: "Google Firebase",
      description: "Deploy hosting, functions, and rules for Firebase projects",
      category_tags: ["firebase", "hosting", "functions"],
      website: "https://firebase.google.com/docs/cli",
      repository: "https://github.com/firebase/firebase-tools",
      verification_status: "community-curated",
      latest_version: "13.34.0",
      last_updated: now,
      last_verified: now,
      popularity_score: 76,
      trust_score: 87,
      permission_scope: ["filesystem", "network"],
      compatibility: [
        {
          agent_name: "codex",
          status: "partial",
          success_rate: 0.81,
          last_verified: now
        }
      ]
    },
    install: [
      {
        os: "any",
        package_manager: "npm",
        command: "npm install -g firebase-tools",
        checksum: undefined,
        dependencies: ["node>=18"]
      }
    ],
    auth: {
      auth_type: "login_command",
      setup_steps: [{ order: 1, instruction: "Authenticate", command: "firebase login" }],
      environment_variables: ["FIREBASE_TOKEN"],
      token_refresh: "Regenerate CI token via firebase login:ci when expired",
      scopes: ["firebase.projects.update"]
    },
    commands: [
      {
        id: "firebase-deploy",
        cli_slug: "firebase",
        command: "firebase deploy",
        description: "Deploy configured Firebase targets",
        required_parameters: [],
        optional_parameters: [],
        examples: ["firebase deploy --only hosting,functions"],
        expected_output: "Deploy status by target",
        common_errors: ["Project not selected"],
        workflow_context: ["serverless-backend-launch"]
      },
      {
        id: "firebase-emulators-start",
        cli_slug: "firebase",
        command: "firebase emulators:start",
        description: "Run local emulator suite for development",
        required_parameters: [],
        optional_parameters: [],
        examples: ["firebase emulators:start --only firestore,functions"],
        expected_output: "Local emulator endpoint list",
        common_errors: ["Port conflict"],
        workflow_context: ["serverless-backend-launch"]
      }
    ],
    listing_version: {
      id: "lv_firebase_1",
      cli_slug: "firebase",
      version_number: 1,
      changed_fields: ["commands"],
      changelog: "Initial curated listing",
      updated_at: now
    }
  }
];

export const curatedWorkflowAdditions: WorkflowChain[] = [
  {
    id: "wf_jamstack_launch",
    slug: "jamstack-launch",
    title: "Launch JAMStack Site",
    description: "Create repo, deploy frontend, and connect CDN hosting",
    tags: ["frontend", "deploy", "jamstack"],
    estimated_minutes: 30,
    created_at: now,
    updated_at: now,
    steps: [
      {
        step_number: 1,
        cli_slug: "gh",
        purpose: "Create and initialize project repository",
        command_ids: ["gh-repo-create"],
        auth_prerequisite: true
      },
      {
        step_number: 2,
        cli_slug: "netlify",
        purpose: "Link site and deploy production build",
        command_ids: ["netlify-link", "netlify-deploy-prod"],
        auth_prerequisite: true
      }
    ]
  },
  {
    id: "wf_edge_worker_launch",
    slug: "edge-worker-launch",
    title: "Launch Edge Worker API",
    description: "Deploy edge worker with secret configuration",
    tags: ["edge", "api", "workers"],
    estimated_minutes: 20,
    created_at: now,
    updated_at: now,
    steps: [
      {
        step_number: 1,
        cli_slug: "wrangler",
        purpose: "Configure secrets and deploy worker",
        command_ids: ["wrangler-secret-put", "wrangler-deploy"],
        auth_prerequisite: true
      }
    ]
  },
  {
    id: "wf_infra_bootstrap",
    slug: "infra-bootstrap",
    title: "Bootstrap Cloud Infrastructure",
    description: "Initialize Terraform project and provision cloud resources",
    tags: ["infrastructure", "iac", "cloud"],
    estimated_minutes: 40,
    created_at: now,
    updated_at: now,
    steps: [
      {
        step_number: 1,
        cli_slug: "terraform",
        purpose: "Initialize and apply infrastructure configuration",
        command_ids: ["terraform-init", "terraform-apply"],
        auth_prerequisite: true
      }
    ]
  },
  {
    id: "wf_serverless_backend_launch",
    slug: "serverless-backend-launch",
    title: "Launch Serverless Backend",
    description: "Deploy backend functions with local emulator test loop",
    tags: ["serverless", "backend", "firebase"],
    estimated_minutes: 35,
    created_at: now,
    updated_at: now,
    steps: [
      {
        step_number: 1,
        cli_slug: "firebase",
        purpose: "Run local emulators then deploy backend",
        command_ids: ["firebase-emulators-start", "firebase-deploy"],
        auth_prerequisite: true
      }
    ]
  }
];
