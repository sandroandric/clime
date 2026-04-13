import type { CliProfile } from "@cli-me/shared-types";

export const approvedSubmissionCliAdditions: CliProfile[] = [
  {
    "identity": {
      "slug": "yuki",
      "name": "Yuki CLI",
      "publisher": "rvben",
      "description": "CLI client for the Yuki bookkeeping SOAP API with JSON output and agent-friendly design",
      "category_tags": [
        "finance",
        "bookkeeping",
        "accounting",
        "yuki",
        "community-submitted"
      ],
      "website": "https://github.com/rvben/yuki-cli",
      "repository": "https://github.com/rvben/yuki-cli",
      "verification_status": "community-curated",
      "latest_version": "0.1.5",
      "last_updated": "2026-04-13T18:48:48Z",
      "last_verified": "2026-04-13T18:48:48Z",
      "popularity_score": 12,
      "trust_score": 68,
      "permission_scope": [
        "network",
        "filesystem"
      ],
      "compatibility": []
    },
    "install": [
      {
        "os": "macos",
        "package_manager": "cargo",
        "command": "cargo install yuki-cli",
        "dependencies": [
          "rust toolchain"
        ]
      },
      {
        "os": "linux",
        "package_manager": "cargo",
        "command": "cargo install yuki-cli",
        "dependencies": [
          "rust toolchain"
        ]
      }
    ],
    "auth": {
      "auth_type": "api_key",
      "setup_steps": [
        {
          "order": 1,
          "instruction": "Initialize the local CLI profile for this integration.",
          "command": "yuki init --api-key <key> --default-admin <name>"
        },
        {
          "order": 2,
          "instruction": "Run a follow-up command to confirm credentials and connectivity.",
          "command": "yuki check unmatched --period 2025-Q1"
        }
      ],
      "environment_variables": [
        "YUKI_API_KEY"
      ],
      "token_refresh": "Rotate the provider token in the upstream dashboard when it expires or is revoked.",
      "scopes": []
    },
    "commands": [
      {
        "id": "yuki-cmd-1",
        "cli_slug": "yuki",
        "command": "yuki init --api-key <key> --default-admin <name>",
        "description": "Initialize the CLI with an API key",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "yuki init --api-key <key> --default-admin <name>"
        ],
        "expected_output": "Structured CLI output; use the tool's JSON flags when available.",
        "common_errors": [],
        "workflow_context": [
          "finance"
        ]
      },
      {
        "id": "yuki-cmd-2",
        "cli_slug": "yuki",
        "command": "yuki check unmatched --period 2025-Q1",
        "description": "Check unmatched",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "yuki check unmatched --period 2025-Q1"
        ],
        "expected_output": "Structured CLI output; use the tool's JSON flags when available.",
        "common_errors": [],
        "workflow_context": [
          "finance"
        ]
      },
      {
        "id": "yuki-cmd-3",
        "cli_slug": "yuki",
        "command": "yuki upload file invoice.pdf --folder inkoop --amount 7.28 --remarks \"Hetzner hosting\"",
        "description": "Upload file",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "yuki upload file invoice.pdf --folder inkoop --amount 7.28 --remarks \"Hetzner hosting\""
        ],
        "expected_output": "Structured CLI output; use the tool's JSON flags when available.",
        "common_errors": [],
        "workflow_context": [
          "finance"
        ]
      },
      {
        "id": "yuki-cmd-4",
        "cli_slug": "yuki",
        "command": "yuki contacts search \"Hetzner\"",
        "description": "Contacts search",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "yuki contacts search \"Hetzner\""
        ],
        "expected_output": "Structured CLI output; use the tool's JSON flags when available.",
        "common_errors": [],
        "workflow_context": [
          "finance"
        ]
      },
      {
        "id": "yuki-cmd-5",
        "cli_slug": "yuki",
        "command": "yuki accounts balance --account 11001 --period 2025-Q1",
        "description": "Accounts balance",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "yuki accounts balance --account 11001 --period 2025-Q1"
        ],
        "expected_output": "Structured CLI output; use the tool's JSON flags when available.",
        "common_errors": [],
        "workflow_context": [
          "finance"
        ]
      },
      {
        "id": "yuki-cmd-help",
        "cli_slug": "yuki",
        "command": "yuki --help",
        "description": "Show the available commands and flags",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "yuki --help"
        ],
        "expected_output": "Usage text with subcommands and flags.",
        "common_errors": [],
        "workflow_context": [
          "finance"
        ]
      }
    ],
    "listing_version": {
      "id": "lv_yuki_1",
      "cli_slug": "yuki",
      "version_number": 1,
      "changed_fields": [
        "identity",
        "install",
        "auth",
        "commands"
      ],
      "changelog": "Imported from an approved community submission and normalized into the live registry.",
      "updated_at": "2026-04-13T18:48:48Z"
    }
  },
  {
    "identity": {
      "slug": "qnap",
      "name": "QNAP CLI",
      "publisher": "rvben",
      "description": "CLI for QNAP NAS management with JSON output and agent-friendly design",
      "category_tags": [
        "storage",
        "nas",
        "qnap",
        "backup",
        "infrastructure",
        "community-submitted"
      ],
      "website": "https://github.com/rvben/qnap-cli",
      "repository": "https://github.com/rvben/qnap-cli",
      "verification_status": "community-curated",
      "latest_version": "0.1.10",
      "last_updated": "2026-04-13T18:48:48Z",
      "last_verified": "2026-04-13T18:48:48Z",
      "popularity_score": 12,
      "trust_score": 68,
      "permission_scope": [
        "network",
        "filesystem"
      ],
      "compatibility": []
    },
    "install": [
      {
        "os": "macos",
        "package_manager": "cargo",
        "command": "cargo install qnap",
        "dependencies": [
          "rust toolchain"
        ]
      },
      {
        "os": "linux",
        "package_manager": "cargo",
        "command": "cargo install qnap",
        "dependencies": [
          "rust toolchain"
        ]
      }
    ],
    "auth": {
      "auth_type": "login_command",
      "setup_steps": [
        {
          "order": 1,
          "instruction": "Store your QNAP host and username for the target NAS.",
          "command": "qnap login --host nas.local --username admin"
        },
        {
          "order": 2,
          "instruction": "Confirm the controller is reachable before running file or volume commands.",
          "command": "qnap status --json"
        }
      ],
      "environment_variables": [
        "QNAP_HOST",
        "QNAP_USERNAME"
      ],
      "token_refresh": "Rerun the CLI login command when the stored session expires or the controller changes.",
      "scopes": []
    },
    "commands": [
      {
        "id": "qnap-cmd-1",
        "cli_slug": "qnap",
        "command": "qnap login --host nas.local --username admin",
        "description": "Authenticate against the target QNAP host",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "qnap login --host nas.local --username admin"
        ],
        "expected_output": "Structured CLI output; use the tool's JSON flags when available.",
        "common_errors": [],
        "workflow_context": [
          "storage"
        ]
      },
      {
        "id": "qnap-cmd-2",
        "cli_slug": "qnap",
        "command": "qnap info",
        "description": "Info",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "qnap info"
        ],
        "expected_output": "Structured CLI output; use the tool's JSON flags when available.",
        "common_errors": [],
        "workflow_context": [
          "storage"
        ]
      },
      {
        "id": "qnap-cmd-3",
        "cli_slug": "qnap",
        "command": "qnap status --json",
        "description": "Status",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "qnap status --json"
        ],
        "expected_output": "Structured CLI output; use the tool's JSON flags when available.",
        "common_errors": [],
        "workflow_context": [
          "storage"
        ]
      },
      {
        "id": "qnap-cmd-4",
        "cli_slug": "qnap",
        "command": "qnap shares",
        "description": "Shares",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "qnap shares"
        ],
        "expected_output": "Structured CLI output; use the tool's JSON flags when available.",
        "common_errors": [],
        "workflow_context": [
          "storage"
        ]
      },
      {
        "id": "qnap-cmd-5",
        "cli_slug": "qnap",
        "command": "qnap files ls /Public",
        "description": "Files ls",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "qnap files ls /Public"
        ],
        "expected_output": "Structured CLI output; use the tool's JSON flags when available.",
        "common_errors": [],
        "workflow_context": [
          "storage"
        ]
      },
      {
        "id": "qnap-cmd-help",
        "cli_slug": "qnap",
        "command": "qnap --help",
        "description": "Show the available commands and flags",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "qnap --help"
        ],
        "expected_output": "Usage text with subcommands and flags.",
        "common_errors": [],
        "workflow_context": [
          "storage"
        ]
      }
    ],
    "listing_version": {
      "id": "lv_qnap_1",
      "cli_slug": "qnap",
      "version_number": 1,
      "changed_fields": [
        "identity",
        "install",
        "auth",
        "commands"
      ],
      "changelog": "Imported from an approved community submission and normalized into the live registry.",
      "updated_at": "2026-04-13T18:48:48Z"
    }
  },
  {
    "identity": {
      "slug": "n8nc",
      "name": "n8nc CLI",
      "publisher": "rvben",
      "description": "CLI for n8n workflow automation with JSON output and agent-friendly design",
      "category_tags": [
        "automation",
        "workflows",
        "n8n",
        "orchestration",
        "community-submitted"
      ],
      "website": "https://github.com/rvben/n8nc",
      "repository": "https://github.com/rvben/n8nc",
      "verification_status": "community-curated",
      "latest_version": "0.4.3",
      "last_updated": "2026-04-13T18:48:48Z",
      "last_verified": "2026-04-13T18:48:48Z",
      "popularity_score": 12,
      "trust_score": 68,
      "permission_scope": [
        "network",
        "filesystem"
      ],
      "compatibility": []
    },
    "install": [
      {
        "os": "macos",
        "package_manager": "cargo",
        "command": "cargo install n8nc",
        "dependencies": [
          "rust toolchain"
        ]
      },
      {
        "os": "linux",
        "package_manager": "cargo",
        "command": "cargo install n8nc",
        "dependencies": [
          "rust toolchain"
        ]
      }
    ],
    "auth": {
      "auth_type": "api_key",
      "setup_steps": [
        {
          "order": 1,
          "instruction": "Register the n8n instance URL in a local profile.",
          "command": "n8nc init --instance prod --url https://your-instance.app.n8n.cloud"
        },
        {
          "order": 2,
          "instruction": "Attach an API token to the saved instance profile.",
          "command": "n8nc auth add prod --token <api_key>"
        }
      ],
      "environment_variables": [
        "N8N_API_KEY"
      ],
      "token_refresh": "Rotate the provider token in the upstream dashboard when it expires or is revoked.",
      "scopes": []
    },
    "commands": [
      {
        "id": "n8nc-cmd-1",
        "cli_slug": "n8nc",
        "command": "n8nc init --instance prod --url https://your-instance.app.n8n.cloud",
        "description": "Initialize a named n8n instance profile",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "n8nc init --instance prod --url https://your-instance.app.n8n.cloud"
        ],
        "expected_output": "Structured CLI output; use the tool's JSON flags when available.",
        "common_errors": [],
        "workflow_context": [
          "automation"
        ]
      },
      {
        "id": "n8nc-cmd-2",
        "cli_slug": "n8nc",
        "command": "n8nc auth add prod --token <api_key>",
        "description": "Attach an API token to the saved profile",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "n8nc auth add prod --token <api_key>"
        ],
        "expected_output": "Structured CLI output; use the tool's JSON flags when available.",
        "common_errors": [],
        "workflow_context": [
          "automation"
        ]
      },
      {
        "id": "n8nc-cmd-3",
        "cli_slug": "n8nc",
        "command": "n8nc pull --all --instance prod",
        "description": "Pull prod",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "n8nc pull --all --instance prod"
        ],
        "expected_output": "Structured CLI output; use the tool's JSON flags when available.",
        "common_errors": [],
        "workflow_context": [
          "automation"
        ]
      },
      {
        "id": "n8nc-cmd-4",
        "cli_slug": "n8nc",
        "command": "n8nc status",
        "description": "Status",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "n8nc status"
        ],
        "expected_output": "Structured CLI output; use the tool's JSON flags when available.",
        "common_errors": [],
        "workflow_context": [
          "automation"
        ]
      },
      {
        "id": "n8nc-cmd-help",
        "cli_slug": "n8nc",
        "command": "n8nc --help",
        "description": "Show the available commands and flags",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "n8nc --help"
        ],
        "expected_output": "Usage text with subcommands and flags.",
        "common_errors": [],
        "workflow_context": [
          "automation"
        ]
      }
    ],
    "listing_version": {
      "id": "lv_n8nc_1",
      "cli_slug": "n8nc",
      "version_number": 1,
      "changed_fields": [
        "identity",
        "install",
        "auth",
        "commands"
      ],
      "changelog": "Imported from an approved community submission and normalized into the live registry.",
      "updated_at": "2026-04-13T18:48:48Z"
    }
  },
  {
    "identity": {
      "slug": "confluence",
      "name": "Confluence CLI",
      "publisher": "rvben",
      "description": "Markdown-sync-first Confluence CLI with JSON output and agent-friendly design",
      "category_tags": [
        "documentation",
        "confluence",
        "atlassian",
        "wiki",
        "markdown",
        "community-submitted"
      ],
      "website": "https://github.com/rvben/confluence-cli",
      "repository": "https://github.com/rvben/confluence-cli",
      "verification_status": "community-curated",
      "latest_version": "0.1.10",
      "last_updated": "2026-04-13T18:48:48Z",
      "last_verified": "2026-04-13T18:48:48Z",
      "popularity_score": 12,
      "trust_score": 68,
      "permission_scope": [
        "network",
        "filesystem"
      ],
      "compatibility": []
    },
    "install": [
      {
        "os": "macos",
        "package_manager": "cargo",
        "command": "cargo install confluence-cli",
        "dependencies": [
          "rust toolchain"
        ]
      },
      {
        "os": "linux",
        "package_manager": "cargo",
        "command": "cargo install confluence-cli",
        "dependencies": [
          "rust toolchain"
        ]
      }
    ],
    "auth": {
      "auth_type": "api_key",
      "setup_steps": [
        {
          "order": 1,
          "instruction": "Authenticate against the target Confluence profile.",
          "command": "confluence-cli auth login --profile cloud --space SPACEKEY"
        },
        {
          "order": 2,
          "instruction": "Run the doctor check before planning or applying markdown sync.",
          "command": "confluence-cli doctor --profile cloud --space SPACEKEY"
        }
      ],
      "environment_variables": [
        "CONFLUENCE_BASE_URL",
        "CONFLUENCE_API_TOKEN"
      ],
      "token_refresh": "Rotate the provider token in the upstream dashboard when it expires or is revoked.",
      "scopes": []
    },
    "commands": [
      {
        "id": "confluence-cmd-1",
        "cli_slug": "confluence",
        "command": "confluence-cli auth login --profile cloud --space SPACEKEY",
        "description": "Authenticate the Confluence profile",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "confluence-cli auth login --profile cloud --space SPACEKEY"
        ],
        "expected_output": "Structured CLI output; use the tool's JSON flags when available.",
        "common_errors": [],
        "workflow_context": [
          "documentation"
        ]
      },
      {
        "id": "confluence-cmd-2",
        "cli_slug": "confluence",
        "command": "confluence-cli doctor --profile cloud --space SPACEKEY",
        "description": "Validate the Confluence connection and space",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "confluence-cli doctor --profile cloud --space SPACEKEY"
        ],
        "expected_output": "Structured CLI output; use the tool's JSON flags when available.",
        "common_errors": [],
        "workflow_context": [
          "documentation"
        ]
      },
      {
        "id": "confluence-cmd-3",
        "cli_slug": "confluence",
        "command": "confluence-cli pull tree SPACE:ParentPage ./docs/parent-page",
        "description": "Pull tree",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "confluence-cli pull tree SPACE:ParentPage ./docs/parent-page"
        ],
        "expected_output": "Structured CLI output; use the tool's JSON flags when available.",
        "common_errors": [],
        "workflow_context": [
          "documentation"
        ]
      },
      {
        "id": "confluence-cmd-4",
        "cli_slug": "confluence",
        "command": "confluence-cli plan ./docs/parent-page",
        "description": "Preview markdown changes before sync",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "confluence-cli plan ./docs/parent-page"
        ],
        "expected_output": "Structured CLI output; use the tool's JSON flags when available.",
        "common_errors": [],
        "workflow_context": [
          "documentation"
        ]
      },
      {
        "id": "confluence-cmd-5",
        "cli_slug": "confluence",
        "command": "confluence-cli apply ./docs/parent-page",
        "description": "Apply ./docs/parent-page",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "confluence-cli apply ./docs/parent-page"
        ],
        "expected_output": "Structured CLI output; use the tool's JSON flags when available.",
        "common_errors": [],
        "workflow_context": [
          "documentation"
        ]
      },
      {
        "id": "confluence-cmd-help",
        "cli_slug": "confluence",
        "command": "confluence-cli --help",
        "description": "Show the available commands and flags",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "confluence-cli --help"
        ],
        "expected_output": "Usage text with subcommands and flags.",
        "common_errors": [],
        "workflow_context": [
          "documentation"
        ]
      }
    ],
    "listing_version": {
      "id": "lv_confluence_1",
      "cli_slug": "confluence",
      "version_number": 1,
      "changed_fields": [
        "identity",
        "install",
        "auth",
        "commands"
      ],
      "changelog": "Imported from an approved community submission and normalized into the live registry.",
      "updated_at": "2026-04-13T18:48:48Z"
    }
  },
  {
    "identity": {
      "slug": "jira",
      "name": "Jira CLI",
      "publisher": "rvben",
      "description": "Agent-friendly Jira CLI with JSON output, structured exit codes, and schema introspection",
      "category_tags": [
        "project-management",
        "jira",
        "atlassian",
        "issue-tracking",
        "community-submitted"
      ],
      "website": "https://github.com/rvben/jira-cli",
      "repository": "https://github.com/rvben/jira-cli",
      "verification_status": "community-curated",
      "latest_version": "0.3.9",
      "last_updated": "2026-04-13T18:48:48Z",
      "last_verified": "2026-04-13T18:48:48Z",
      "popularity_score": 12,
      "trust_score": 68,
      "permission_scope": [
        "network",
        "filesystem"
      ],
      "compatibility": []
    },
    "install": [
      {
        "os": "macos",
        "package_manager": "cargo",
        "command": "cargo install jira-cli",
        "dependencies": [
          "rust toolchain"
        ]
      },
      {
        "os": "linux",
        "package_manager": "cargo",
        "command": "cargo install jira-cli",
        "dependencies": [
          "rust toolchain"
        ]
      }
    ],
    "auth": {
      "auth_type": "api_key",
      "setup_steps": [
        {
          "order": 1,
          "instruction": "Set the Jira base URL and API token in your environment."
        },
        {
          "order": 2,
          "instruction": "List issues to confirm the project and token are valid.",
          "command": "jira issues list --project MYAPP --json"
        }
      ],
      "environment_variables": [
        "JIRA_BASE_URL",
        "JIRA_API_TOKEN"
      ],
      "token_refresh": "Rotate the provider token in the upstream dashboard when it expires or is revoked.",
      "scopes": []
    },
    "commands": [
      {
        "id": "jira-cmd-1",
        "cli_slug": "jira",
        "command": "jira issues list --project MYAPP --status \"In Progress\"",
        "description": "Issues list",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "jira issues list --project MYAPP --status \"In Progress\""
        ],
        "expected_output": "Structured CLI output; use the tool's JSON flags when available.",
        "common_errors": [],
        "workflow_context": [
          "project-management"
        ]
      },
      {
        "id": "jira-cmd-2",
        "cli_slug": "jira",
        "command": "jira issues list --project MYAPP --json",
        "description": "Issues list",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "jira issues list --project MYAPP --json"
        ],
        "expected_output": "Structured CLI output; use the tool's JSON flags when available.",
        "common_errors": [],
        "workflow_context": [
          "project-management"
        ]
      },
      {
        "id": "jira-cmd-help",
        "cli_slug": "jira",
        "command": "jira --help",
        "description": "Show the available commands and flags",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "jira --help"
        ],
        "expected_output": "Usage text with subcommands and flags.",
        "common_errors": [],
        "workflow_context": [
          "project-management"
        ]
      }
    ],
    "listing_version": {
      "id": "lv_jira_1",
      "cli_slug": "jira",
      "version_number": 1,
      "changed_fields": [
        "identity",
        "install",
        "auth",
        "commands"
      ],
      "changelog": "Imported from an approved community submission and normalized into the live registry.",
      "updated_at": "2026-04-13T18:48:48Z"
    }
  },
  {
    "identity": {
      "slug": "zoom",
      "name": "Zoom CLI",
      "publisher": "rvben",
      "description": "Agent-friendly Zoom CLI with JSON output, structured exit codes, and schema introspection",
      "category_tags": [
        "meetings",
        "video",
        "zoom",
        "productivity",
        "communication",
        "community-submitted"
      ],
      "website": "https://github.com/rvben/zoom-cli",
      "repository": "https://github.com/rvben/zoom-cli",
      "verification_status": "community-curated",
      "latest_version": "0.2.4",
      "last_updated": "2026-04-13T18:48:48Z",
      "last_verified": "2026-04-13T18:48:48Z",
      "popularity_score": 12,
      "trust_score": 68,
      "permission_scope": [
        "network",
        "filesystem"
      ],
      "compatibility": []
    },
    "install": [
      {
        "os": "macos",
        "package_manager": "cargo",
        "command": "cargo install zoom-cli",
        "dependencies": [
          "rust toolchain"
        ]
      },
      {
        "os": "linux",
        "package_manager": "cargo",
        "command": "cargo install zoom-cli",
        "dependencies": [
          "rust toolchain"
        ]
      }
    ],
    "auth": {
      "auth_type": "oauth",
      "setup_steps": [
        {
          "order": 1,
          "instruction": "Initialize the local CLI profile for this integration.",
          "command": "zoom init"
        },
        {
          "order": 2,
          "instruction": "Run a follow-up command to confirm credentials and connectivity.",
          "command": "zoom meetings list"
        }
      ],
      "environment_variables": [
        "ZOOM_CLIENT_ID",
        "ZOOM_CLIENT_SECRET"
      ],
      "token_refresh": "Refresh and rotation are handled by the provider login flow; rerun the CLI auth command if access expires.",
      "scopes": []
    },
    "commands": [
      {
        "id": "zoom-cmd-1",
        "cli_slug": "zoom",
        "command": "zoom init",
        "description": "Init",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "zoom init"
        ],
        "expected_output": "Structured CLI output; use the tool's JSON flags when available.",
        "common_errors": [],
        "workflow_context": [
          "meetings"
        ]
      },
      {
        "id": "zoom-cmd-2",
        "cli_slug": "zoom",
        "command": "zoom meetings list",
        "description": "Meetings list",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "zoom meetings list"
        ],
        "expected_output": "Structured CLI output; use the tool's JSON flags when available.",
        "common_errors": [],
        "workflow_context": [
          "meetings"
        ]
      },
      {
        "id": "zoom-cmd-3",
        "cli_slug": "zoom",
        "command": "zoom meetings create --topic \"Standup\" --duration 30",
        "description": "Meetings create",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "zoom meetings create --topic \"Standup\" --duration 30"
        ],
        "expected_output": "Structured CLI output; use the tool's JSON flags when available.",
        "common_errors": [],
        "workflow_context": [
          "meetings"
        ]
      },
      {
        "id": "zoom-cmd-4",
        "cli_slug": "zoom",
        "command": "zoom recordings list --from 2026-01-01",
        "description": "Recordings list",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "zoom recordings list --from 2026-01-01"
        ],
        "expected_output": "Structured CLI output; use the tool's JSON flags when available.",
        "common_errors": [],
        "workflow_context": [
          "meetings"
        ]
      },
      {
        "id": "zoom-cmd-5",
        "cli_slug": "zoom",
        "command": "zoom users me",
        "description": "Users me",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "zoom users me"
        ],
        "expected_output": "Structured CLI output; use the tool's JSON flags when available.",
        "common_errors": [],
        "workflow_context": [
          "meetings"
        ]
      },
      {
        "id": "zoom-cmd-help",
        "cli_slug": "zoom",
        "command": "zoom --help",
        "description": "Show the available commands and flags",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "zoom --help"
        ],
        "expected_output": "Usage text with subcommands and flags.",
        "common_errors": [],
        "workflow_context": [
          "meetings"
        ]
      }
    ],
    "listing_version": {
      "id": "lv_zoom_1",
      "cli_slug": "zoom",
      "version_number": 1,
      "changed_fields": [
        "identity",
        "install",
        "auth",
        "commands"
      ],
      "changelog": "Imported from an approved community submission and normalized into the live registry.",
      "updated_at": "2026-04-13T18:48:48Z"
    }
  },
  {
    "identity": {
      "slug": "ha",
      "name": "Home Assistant CLI",
      "publisher": "rvben",
      "description": "Agent-friendly Home Assistant CLI with JSON output, structured exit codes, and schema introspection",
      "category_tags": [
        "smart-home",
        "iot",
        "home-assistant",
        "automation",
        "community-submitted"
      ],
      "website": "https://github.com/rvben/homeassistant-cli",
      "repository": "https://github.com/rvben/homeassistant-cli",
      "verification_status": "community-curated",
      "latest_version": "0.1.14",
      "last_updated": "2026-04-13T18:48:48Z",
      "last_verified": "2026-04-13T18:48:48Z",
      "popularity_score": 12,
      "trust_score": 68,
      "permission_scope": [
        "network",
        "filesystem"
      ],
      "compatibility": []
    },
    "install": [
      {
        "os": "macos",
        "package_manager": "cargo",
        "command": "cargo install homeassistant-cli",
        "dependencies": [
          "rust toolchain"
        ]
      },
      {
        "os": "linux",
        "package_manager": "cargo",
        "command": "cargo install homeassistant-cli",
        "dependencies": [
          "rust toolchain"
        ]
      }
    ],
    "auth": {
      "auth_type": "api_key",
      "setup_steps": [
        {
          "order": 1,
          "instruction": "Initialize the local CLI profile for this integration.",
          "command": "ha init"
        },
        {
          "order": 2,
          "instruction": "Run a follow-up command to confirm credentials and connectivity.",
          "command": "ha entity list --domain light"
        }
      ],
      "environment_variables": [
        "HOMEASSISTANT_TOKEN",
        "HOMEASSISTANT_URL"
      ],
      "token_refresh": "Rotate the provider token in the upstream dashboard when it expires or is revoked.",
      "scopes": []
    },
    "commands": [
      {
        "id": "ha-cmd-1",
        "cli_slug": "ha",
        "command": "ha init",
        "description": "Init",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "ha init"
        ],
        "expected_output": "Structured CLI output; use the tool's JSON flags when available.",
        "common_errors": [],
        "workflow_context": [
          "smart-home"
        ]
      },
      {
        "id": "ha-cmd-2",
        "cli_slug": "ha",
        "command": "ha entity list --domain light",
        "description": "Entity list",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "ha entity list --domain light"
        ],
        "expected_output": "Structured CLI output; use the tool's JSON flags when available.",
        "common_errors": [],
        "workflow_context": [
          "smart-home"
        ]
      },
      {
        "id": "ha-cmd-3",
        "cli_slug": "ha",
        "command": "ha service call light.turn_on --entity light.living_room",
        "description": "Service call",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "ha service call light.turn_on --entity light.living_room"
        ],
        "expected_output": "Structured CLI output; use the tool's JSON flags when available.",
        "common_errors": [],
        "workflow_context": [
          "smart-home"
        ]
      },
      {
        "id": "ha-cmd-4",
        "cli_slug": "ha",
        "command": "ha entity get sensor.temperature",
        "description": "Entity get",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "ha entity get sensor.temperature"
        ],
        "expected_output": "Structured CLI output; use the tool's JSON flags when available.",
        "common_errors": [],
        "workflow_context": [
          "smart-home"
        ]
      },
      {
        "id": "ha-cmd-5",
        "cli_slug": "ha",
        "command": "ha entity watch sensor.temperature",
        "description": "Entity watch",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "ha entity watch sensor.temperature"
        ],
        "expected_output": "Structured CLI output; use the tool's JSON flags when available.",
        "common_errors": [],
        "workflow_context": [
          "smart-home"
        ]
      },
      {
        "id": "ha-cmd-help",
        "cli_slug": "ha",
        "command": "ha --help",
        "description": "Show the available commands and flags",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "ha --help"
        ],
        "expected_output": "Usage text with subcommands and flags.",
        "common_errors": [],
        "workflow_context": [
          "smart-home"
        ]
      }
    ],
    "listing_version": {
      "id": "lv_ha_1",
      "cli_slug": "ha",
      "version_number": 1,
      "changed_fields": [
        "identity",
        "install",
        "auth",
        "commands"
      ],
      "changelog": "Imported from an approved community submission and normalized into the live registry.",
      "updated_at": "2026-04-13T18:48:48Z"
    }
  },
  {
    "identity": {
      "slug": "unifi",
      "name": "UniFi CLI",
      "publisher": "rvben",
      "description": "Agent-friendly UniFi Network controller CLI with JSON output, structured exit codes, and schema introspection",
      "category_tags": [
        "networking",
        "unifi",
        "infrastructure",
        "monitoring",
        "community-submitted"
      ],
      "website": "https://github.com/rvben/unifi-cli",
      "repository": "https://github.com/rvben/unifi-cli",
      "verification_status": "community-curated",
      "latest_version": "0.1.6",
      "last_updated": "2026-04-13T18:48:48Z",
      "last_verified": "2026-04-13T18:48:48Z",
      "popularity_score": 12,
      "trust_score": 68,
      "permission_scope": [
        "network",
        "filesystem"
      ],
      "compatibility": []
    },
    "install": [
      {
        "os": "macos",
        "package_manager": "cargo",
        "command": "cargo install unifi-cli",
        "dependencies": [
          "rust toolchain"
        ]
      },
      {
        "os": "linux",
        "package_manager": "cargo",
        "command": "cargo install unifi-cli",
        "dependencies": [
          "rust toolchain"
        ]
      }
    ],
    "auth": {
      "auth_type": "api_key",
      "setup_steps": [
        {
          "order": 1,
          "instruction": "Initialize the local CLI profile for this integration.",
          "command": "unifi config init"
        },
        {
          "order": 2,
          "instruction": "Run a follow-up command to confirm credentials and connectivity.",
          "command": "unifi clients list"
        }
      ],
      "environment_variables": [
        "UNIFI_API_KEY",
        "UNIFI_HOST"
      ],
      "token_refresh": "Rotate the provider token in the upstream dashboard when it expires or is revoked.",
      "scopes": []
    },
    "commands": [
      {
        "id": "unifi-cmd-1",
        "cli_slug": "unifi",
        "command": "unifi config init",
        "description": "Config init",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "unifi config init"
        ],
        "expected_output": "Structured CLI output; use the tool's JSON flags when available.",
        "common_errors": [],
        "workflow_context": [
          "networking"
        ]
      },
      {
        "id": "unifi-cmd-2",
        "cli_slug": "unifi",
        "command": "unifi clients list",
        "description": "Clients list",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "unifi clients list"
        ],
        "expected_output": "Structured CLI output; use the tool's JSON flags when available.",
        "common_errors": [],
        "workflow_context": [
          "networking"
        ]
      },
      {
        "id": "unifi-cmd-3",
        "cli_slug": "unifi",
        "command": "unifi devices list",
        "description": "Devices list",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "unifi devices list"
        ],
        "expected_output": "Structured CLI output; use the tool's JSON flags when available.",
        "common_errors": [],
        "workflow_context": [
          "networking"
        ]
      },
      {
        "id": "unifi-cmd-4",
        "cli_slug": "unifi",
        "command": "unifi tui",
        "description": "Open the interactive dashboard",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "unifi tui"
        ],
        "expected_output": "Structured CLI output; use the tool's JSON flags when available.",
        "common_errors": [],
        "workflow_context": [
          "networking"
        ]
      },
      {
        "id": "unifi-cmd-help",
        "cli_slug": "unifi",
        "command": "unifi --help",
        "description": "Show the available commands and flags",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "unifi --help"
        ],
        "expected_output": "Usage text with subcommands and flags.",
        "common_errors": [],
        "workflow_context": [
          "networking"
        ]
      }
    ],
    "listing_version": {
      "id": "lv_unifi_1",
      "cli_slug": "unifi",
      "version_number": 1,
      "changed_fields": [
        "identity",
        "install",
        "auth",
        "commands"
      ],
      "changelog": "Imported from an approved community submission and normalized into the live registry.",
      "updated_at": "2026-04-13T18:48:48Z"
    }
  },
  {
    "identity": {
      "slug": "proxctl",
      "name": "proxctl CLI",
      "publisher": "rvben",
      "description": "Agent-friendly Proxmox VE CLI with JSON output, structured exit codes, and schema introspection",
      "category_tags": [
        "infrastructure",
        "virtualization",
        "proxmox",
        "homelab",
        "server-management",
        "community-submitted"
      ],
      "website": "https://github.com/rvben/proxctl",
      "repository": "https://github.com/rvben/proxctl",
      "verification_status": "community-curated",
      "latest_version": "0.2.7",
      "last_updated": "2026-04-13T18:48:48Z",
      "last_verified": "2026-04-13T18:48:48Z",
      "popularity_score": 12,
      "trust_score": 68,
      "permission_scope": [
        "network",
        "filesystem"
      ],
      "compatibility": []
    },
    "install": [
      {
        "os": "macos",
        "package_manager": "cargo",
        "command": "cargo install proxctl",
        "dependencies": [
          "rust toolchain"
        ]
      },
      {
        "os": "linux",
        "package_manager": "cargo",
        "command": "cargo install proxctl",
        "dependencies": [
          "rust toolchain"
        ]
      }
    ],
    "auth": {
      "auth_type": "api_key",
      "setup_steps": [
        {
          "order": 1,
          "instruction": "Initialize the local CLI profile for this integration.",
          "command": "proxctl config init"
        },
        {
          "order": 2,
          "instruction": "Run a follow-up command to confirm credentials and connectivity.",
          "command": "proxctl health"
        }
      ],
      "environment_variables": [
        "PROXMOX_TOKEN_ID",
        "PROXMOX_TOKEN_SECRET",
        "PROXMOX_URL"
      ],
      "token_refresh": "Rotate the provider token in the upstream dashboard when it expires or is revoked.",
      "scopes": []
    },
    "commands": [
      {
        "id": "proxctl-cmd-1",
        "cli_slug": "proxctl",
        "command": "proxctl config init",
        "description": "Config init",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "proxctl config init"
        ],
        "expected_output": "Structured CLI output; use the tool's JSON flags when available.",
        "common_errors": [],
        "workflow_context": [
          "infrastructure"
        ]
      },
      {
        "id": "proxctl-cmd-2",
        "cli_slug": "proxctl",
        "command": "proxctl health",
        "description": "Health",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "proxctl health"
        ],
        "expected_output": "Structured CLI output; use the tool's JSON flags when available.",
        "common_errors": [],
        "workflow_context": [
          "infrastructure"
        ]
      },
      {
        "id": "proxctl-cmd-3",
        "cli_slug": "proxctl",
        "command": "proxctl vm list",
        "description": "Vm list",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "proxctl vm list"
        ],
        "expected_output": "Structured CLI output; use the tool's JSON flags when available.",
        "common_errors": [],
        "workflow_context": [
          "infrastructure"
        ]
      },
      {
        "id": "proxctl-cmd-4",
        "cli_slug": "proxctl",
        "command": "proxctl vm start 100",
        "description": "Vm start",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "proxctl vm start 100"
        ],
        "expected_output": "Structured CLI output; use the tool's JSON flags when available.",
        "common_errors": [],
        "workflow_context": [
          "infrastructure"
        ]
      },
      {
        "id": "proxctl-cmd-5",
        "cli_slug": "proxctl",
        "command": "proxctl api get /nodes",
        "description": "Query the Proxmox API directly",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "proxctl api get /nodes"
        ],
        "expected_output": "Structured CLI output; use the tool's JSON flags when available.",
        "common_errors": [],
        "workflow_context": [
          "infrastructure"
        ]
      },
      {
        "id": "proxctl-cmd-help",
        "cli_slug": "proxctl",
        "command": "proxctl --help",
        "description": "Show the available commands and flags",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "proxctl --help"
        ],
        "expected_output": "Usage text with subcommands and flags.",
        "common_errors": [],
        "workflow_context": [
          "infrastructure"
        ]
      }
    ],
    "listing_version": {
      "id": "lv_proxctl_1",
      "cli_slug": "proxctl",
      "version_number": 1,
      "changed_fields": [
        "identity",
        "install",
        "auth",
        "commands"
      ],
      "changelog": "Imported from an approved community submission and normalized into the live registry.",
      "updated_at": "2026-04-13T18:48:48Z"
    }
  },
  {
    "identity": {
      "slug": "apify",
      "name": "Apify CLI",
      "publisher": "Apify",
      "description": "Apify command-line interface helps you create, develop, build and run Apify actors, and manage the Apify cloud platform.",
      "category_tags": [
        "deploy",
        "devtooling",
        "testing",
        "infra/cloud",
        "containers",
        "utilities",
        "community-submitted"
      ],
      "website": "https://apify.com/",
      "repository": "https://github.com/apify/apify-cli",
      "verification_status": "community-curated",
      "latest_version": "1.4.1",
      "last_updated": "2026-04-13T18:48:48Z",
      "last_verified": "2026-04-13T18:48:48Z",
      "popularity_score": 12,
      "trust_score": 68,
      "permission_scope": [
        "network",
        "filesystem"
      ],
      "compatibility": []
    },
    "install": [
      {
        "os": "macos",
        "package_manager": "npm",
        "command": "npm install -g apify-cli",
        "dependencies": [
          "node>=18"
        ]
      },
      {
        "os": "linux",
        "package_manager": "npm",
        "command": "npm install -g apify-cli",
        "dependencies": [
          "node>=18"
        ]
      }
    ],
    "auth": {
      "auth_type": "oauth",
      "setup_steps": [
        {
          "order": 1,
          "instruction": "Authenticate the CLI with your Apify account.",
          "command": "apify login"
        },
        {
          "order": 2,
          "instruction": "Pull or push an actor locally after login succeeds.",
          "command": "apify pull"
        }
      ],
      "environment_variables": [
        "APIFY_TOKEN"
      ],
      "token_refresh": "Refresh and rotation are handled by the provider login flow; rerun the CLI auth command if access expires.",
      "scopes": []
    },
    "commands": [
      {
        "id": "apify-cmd-1",
        "cli_slug": "apify",
        "command": "apify login",
        "description": "Login",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "apify login"
        ],
        "expected_output": "Structured CLI output; use the tool's JSON flags when available.",
        "common_errors": [],
        "workflow_context": [
          "deploy"
        ]
      },
      {
        "id": "apify-cmd-2",
        "cli_slug": "apify",
        "command": "apify pull",
        "description": "Pull",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "apify pull"
        ],
        "expected_output": "Structured CLI output; use the tool's JSON flags when available.",
        "common_errors": [],
        "workflow_context": [
          "deploy"
        ]
      },
      {
        "id": "apify-cmd-3",
        "cli_slug": "apify",
        "command": "apify push",
        "description": "Push",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "apify push"
        ],
        "expected_output": "Structured CLI output; use the tool's JSON flags when available.",
        "common_errors": [],
        "workflow_context": [
          "deploy"
        ]
      },
      {
        "id": "apify-cmd-4",
        "cli_slug": "apify",
        "command": "apify run",
        "description": "Run",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "apify run"
        ],
        "expected_output": "Structured CLI output; use the tool's JSON flags when available.",
        "common_errors": [],
        "workflow_context": [
          "deploy"
        ]
      },
      {
        "id": "apify-cmd-5",
        "cli_slug": "apify",
        "command": "apify call",
        "description": "Call",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "apify call"
        ],
        "expected_output": "Structured CLI output; use the tool's JSON flags when available.",
        "common_errors": [],
        "workflow_context": [
          "deploy"
        ]
      },
      {
        "id": "apify-cmd-help",
        "cli_slug": "apify",
        "command": "apify --help",
        "description": "Show the available commands and flags",
        "required_parameters": [],
        "optional_parameters": [],
        "examples": [
          "apify --help"
        ],
        "expected_output": "Usage text with subcommands and flags.",
        "common_errors": [],
        "workflow_context": [
          "deploy"
        ]
      }
    ],
    "listing_version": {
      "id": "lv_apify_1",
      "cli_slug": "apify",
      "version_number": 1,
      "changed_fields": [
        "identity",
        "install",
        "auth",
        "commands"
      ],
      "changelog": "Imported from an approved community submission and normalized into the live registry.",
      "updated_at": "2026-04-13T18:48:48Z"
    }
  }
];
