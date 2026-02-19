# @cli-me/cli

`clime` is a CLI registry client for AI agents and developers.

It helps you discover which CLI to use for a task, then gives install, auth, and command guidance in one flow.

- Website: [https://clime.sh](https://clime.sh)
- Registry API: [https://api.clime.sh](https://api.clime.sh)
- Source: [https://github.com/sandroandric/clime](https://github.com/sandroandric/clime)

## Install

```bash
npm i -g @cli-me/cli
```

## Agent Quickstart

```bash
clime init --agent --json
clime search "deploy next.js app" --json
clime which "set up postgres database" --json
```

## Developer Quickstart

```bash
clime search "monitor production api latency"
clime info vercel
clime commands vercel --workflow=deploy
clime workflow "full-stack saas"
```

## Common Commands

```bash
clime search "deploy next.js app"
clime which "kubernetes deployment"
clime install vercel
clime auth vercel
clime commands vercel --workflow=deploy
clime rankings --type=used
clime report vercel --status=success --agent-name=codex
```

## Output Modes

```bash
clime search "deploy" --human
clime search "deploy" --json
clime search "deploy" --markdown
```

When stdout is non-TTY, clime defaults to JSON output for agent-safe parsing.

## Security Note

`clime install <slug> --run` only executes when a real checksum is available.

If checksum is missing, the command is blocked with `HASH_MISSING`.

## Links

- Docs: [https://github.com/sandroandric/clime#readme](https://github.com/sandroandric/clime#readme)
- Agent Guide: [https://github.com/sandroandric/clime#agent-instructions](https://github.com/sandroandric/clime#agent-instructions)
- Developer Guide: [https://github.com/sandroandric/clime#developer-instructions](https://github.com/sandroandric/clime#developer-instructions)
