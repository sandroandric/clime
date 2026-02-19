# clime

![clime hero](docs/assets/readme_clime.png)

**clime is a CLI registry for AI agents, developers (humans) can use it too.**

One command to discover the right CLI for a task, get install/auth guidance, and execute with predictable output.

- Website: [https://clime.sh](https://clime.sh)
- API: [https://api.clime.sh](https://api.clime.sh)
- npm package: [https://www.npmjs.com/package/@cli-me/cli](https://www.npmjs.com/package/@cli-me/cli)

## Why clime

Agents (like OpenClaw friendly 🦞) already know shell commands, but they still struggle with:

- tool discovery (`which CLI should I use?`)
- setup (`how do I install/auth safely?`)
- command fluency (`which commands/flags matter for this workflow?`)

clime provides a shell-first registry so one integration can work across many tools (and save you tokens).

## Who this is for

### AI agents

Use clime as a discovery/control plane via shell commands.

- deterministic JSON for non-TTY and explicit `--json`
- workflow chaining (`clime workflow ...`)
- install/auth/command references in one place
- optional MCP server package for tighter integration

### Developers

Use clime to compare and execute CLIs faster.

- browse rankings, workflows, categories, and CLI profiles
- copy install/auth commands quickly
- submit missing CLIs and report execution outcomes

### Publishers

Claim listings, verify ownership, and track real usage telemetry.

- claim via DNS TXT or repo-file verification
- review discovery impressions / install serves / reports
- maintain listing metadata and quality signals

## Quickstart

### Run once (no global install)

```bash
npx -y @cli-me/cli search "deploy a next.js app"
```

### Install globally

```bash
npm i -g @cli-me/cli
```

### Agent bootstrap (recommended first run)

```bash
clime init --agent --json
```

### Configure (optional)

```bash
clime configure --api-key <your-key> --base-url https://api.clime.sh
```

If no API key is configured, clime auto-generates a local key at `~/.clime/config.json` on first use.

## Agent Instructions

Start here if you are configuring an AI agent workflow.

- Install: [`npm i -g @cli-me/cli`](https://www.npmjs.com/package/@cli-me/cli)
- Bootstrap: `clime init --agent --json`
- Discover: `clime search "deploy next.js app" --json`
- Pick best CLI slug fast: `clime which "set up postgres database" --json`
- Get executable guidance: `clime info <slug>`, `clime auth <slug>`, `clime commands <slug> --workflow=<tag>`

Website references for agents:

- Registry home: [https://clime.sh](https://clime.sh)
- Rankings: [https://clime.sh/rankings](https://clime.sh/rankings)
- Workflows: [https://clime.sh/workflows](https://clime.sh/workflows)

## Developer Instructions

Start here if you are using clime manually as a developer.

- Install: [`npm i -g @cli-me/cli`](https://www.npmjs.com/package/@cli-me/cli)
- Search by task: `clime search "monitor production api latency"`
- Explore command references: `clime info <slug>` and `clime commands <slug>`
- Find workflow chains: `clime workflow "full-stack saas"`
- Report outcome to improve data: `clime report <slug> --status=success|fail`

Website references for developers:

- Browse catalog: [https://clime.sh/explore](https://clime.sh/explore)
- Compare categories: [https://clime.sh/categories](https://clime.sh/categories)
- Submit new CLI: [https://clime.sh/submissions](https://clime.sh/submissions)

## Core CLI commands

```bash
clime search "deploy next.js app"
clime which "postgres database for a node api"
clime info vercel
clime install vercel
clime auth vercel
clime commands vercel --workflow=deploy
clime workflow "full-stack saas"
clime rankings --type=used
clime report vercel --status=success --command-id=vercel-deploy --agent-name=codex
clime submit --name "mycli" --repo "https://github.com/org/mycli" --description "What it does"
clime claim vercel --publisher "Vercel" --domain vercel.com --evidence "DNS TXT added"
```

## Output modes

- Human-readable output by default in interactive terminals
- JSON by default when stdout is non-TTY
- Explicit modes:

```bash
clime search "deploy" --json
clime search "deploy" --human
clime search "deploy" --markdown
```

Pipe-friendly selectors via `--format`:

```bash
clime which "deploy static site" --format slug --json
clime search "payments" --format install-command --json
```

## Security behavior

`clime install <slug> --run` executes **only** when the install instruction has a real persisted checksum (`sha256:<64-hex>`).

If checksum is unavailable, execution is blocked with `HASH_MISSING`.

This is intentional: no unverified auto-execution.

## Admin and moderation model

Submission and claim creation are public.
Approval/rejection/verification are admin-only.

Admin-gated endpoints:

- `POST /v1/submissions/:id/review`
- `POST /v1/publishers/claim/:id/review`
- `POST /v1/publishers/claim/:id/verify`

Configure admin keys:

```bash
CLIME_ADMIN_KEYS=<comma-separated-admin-keys>
```

## Repository structure

- `/apps/api` - Fastify API
- `/apps/web` - Next.js app (`clime.sh`)
- `/packages/cli` - `@cli-me/cli`
- `/packages/shared-types` - shared schemas/contracts
- `/packages/mcp-server` - MCP integration
- `/packages/openclaw-skill` - OpenClaw integration
- `/workers/indexer` - discovery/index pipelines
- `/workers/verifier` - verification jobs
- `/workers/analytics` - rankings/analytics jobs
- `/infra` - migrations, scripts, distribution assets

## Local development

### Prerequisites

- Node.js `>=22`
- npm workspaces
- Optional for persistence: Postgres + Redis

### Setup

```bash
npm ci
cp .env.example .env
```

### Run

```bash
npm run dev:api
npm run dev:web
```

### Validate

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

## Benchmarks

Context benchmark artifacts are generated from the API and published to web data:

```bash
CLIME_BENCHMARK_API_KEY=<api-key> npm run benchmark:context
```

## Environment notes

- Set `NEXT_PUBLIC_GA_MEASUREMENT_ID` to enable GA on the web app.
- Keep CORS restricted with `CLIME_CORS_ORIGINS`.
- Keep rate limiting enabled (`CLIME_RATE_LIMIT_PER_MINUTE`, `CLIME_SEARCH_RATE_LIMIT_PER_MINUTE`, `CLIME_REPORT_LIMIT_PER_HOUR`).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE)
