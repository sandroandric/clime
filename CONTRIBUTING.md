# Contributing to clime

Thanks for contributing to clime.

## Before You Start

- Read `README.md` for product goals and architecture.
- For product-impacting changes, append a short entry to `LOG.md`.
- Keep claims honest: no fake telemetry, no fake checksums, no fake verification labels.

## Development Setup

```bash
npm ci
cp .env.example .env
```

Run services:

```bash
npm run dev:api
npm run dev:web
```

## Quality Gates

Before opening a PR, run:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

For benchmark updates:

```bash
CLIME_BENCHMARK_API_KEY=<api-key> npm run benchmark:context
```

## Pull Requests

- Keep PRs focused and scoped.
- Include screenshots for user-facing UI changes.
- Include test coverage for behavior changes.
- Update docs in the same PR when behavior changes.

## Commit Hooks

This repo uses `husky` + `lint-staged`.

- TS/JS files: ESLint autofix on staged files
- JSON/Markdown/YAML: Prettier on staged files

If hooks fail, fix issues and re-commit; avoid `--no-verify`.

## Security and Sensitive Data

- Never commit credentials, tokens, or private keys.
- Never add generated local artifacts from `infra/generated/`.
- Follow `SECURITY.md` for vulnerability reporting.
