#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SUMMARY_PATH="${ROOT_DIR}/infra/generated/railway-production-summary.json"
PROJECT_NAME="${RAILWAY_PROJECT_NAME:-clime-registry}"
API_SERVICE="${RAILWAY_API_SERVICE:-api}"
WEB_SERVICE="${RAILWAY_WEB_SERVICE:-web}"
WORKERS_SERVICE="${RAILWAY_WORKERS_SERVICE:-workers}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd railway
require_cmd jq
require_cmd openssl

cd "${ROOT_DIR}"

if ! railway whoami >/dev/null 2>&1; then
  echo "Railway CLI is not authenticated. Run 'railway login' and retry." >&2
  exit 1
fi

if ! railway status >/dev/null 2>&1; then
  railway init --name "${PROJECT_NAME}"
fi

# Services/plugins are idempotent in Railway; ignore duplicate-name failures.
railway add --database postgres || true
railway add --database redis || true
railway add --service "${API_SERVICE}" || true
railway add --service "${WEB_SERVICE}" || true
railway add --service "${WORKERS_SERVICE}" || true

API_SECRET_KEY="${CLIME_PROD_API_KEY:-$(openssl rand -hex 16)}"

railway variable set --service "${API_SERVICE}" \
  NODE_ENV=production \
  PORT=3000 \
  API_SECRET_KEY="${API_SECRET_KEY}" \
  CLIME_API_KEYS="${API_SECRET_KEY}" \
  CLIME_RATE_LIMIT_PER_MINUTE=240 \
  CLIME_SEARCH_RATE_LIMIT_PER_MINUTE=60 \
  CLIME_REPORT_LIMIT_PER_HOUR=10 \
  CLIME_CORS_ORIGINS='https://clime.sh,https://www.clime.sh' \
  CLIME_API_LOGGER=true \
  DATABASE_URL='${{Postgres.DATABASE_URL}}' \
  REDIS_URL='${{Redis.REDIS_URL}}' \
  NIXPACKS_INSTALL_CMD='npm ci --include=dev' \
  NIXPACKS_BUILD_CMD='npm run build:api' \
  NIXPACKS_START_CMD='npm run start:api'

railway variable set --service "${WEB_SERVICE}" \
  NODE_ENV=production \
  PORT=3000 \
  CLIME_WEB_API_KEY="${API_SECRET_KEY}" \
  NIXPACKS_INSTALL_CMD='npm ci --include=dev' \
  NIXPACKS_BUILD_CMD='npm run build:web' \
  NIXPACKS_START_CMD='npm run start:web'

railway variable set --service "${WORKERS_SERVICE}" \
  NODE_ENV=production \
  WORKER_MODE=all \
  DATABASE_URL='${{Postgres.DATABASE_URL}}' \
  REDIS_URL='${{Redis.REDIS_URL}}' \
  NIXPACKS_INSTALL_CMD='npm ci --include=dev' \
  NIXPACKS_BUILD_CMD='npm run build:workers' \
  NIXPACKS_START_CMD='npm run start:workers'

railway up --service "${API_SERVICE}" --ci
railway up --service "${WEB_SERVICE}" --ci
railway up --service "${WORKERS_SERVICE}" --ci

railway run --service "${API_SERVICE}" npm run migrate
railway run --service "${API_SERVICE}" npm run seed

api_domain_json="$(railway domain --service "${API_SERVICE}" --json)"
web_domain_json="$(railway domain --service "${WEB_SERVICE}" --json)"

extract_domain() {
  jq -r '.domain // .hostname // .url // .serviceDomain // .service_domain // (.domains[0].domain // empty)' <<<"$1"
}

api_domain="$(extract_domain "${api_domain_json}")"
web_domain="$(extract_domain "${web_domain_json}")"

if [[ -z "${api_domain}" ]]; then
  echo "Failed to resolve API domain from Railway output." >&2
  exit 1
fi

if [[ "${api_domain}" != http* ]]; then
  api_base_url="https://${api_domain}"
else
  api_base_url="${api_domain}"
fi

if [[ -n "${web_domain}" ]] && [[ "${web_domain}" != http* ]]; then
  web_url="https://${web_domain}"
else
  web_url="${web_domain}"
fi

railway variable set --service "${WEB_SERVICE}" \
  CLIME_API_BASE_URL="${api_base_url}" \
  NEXT_PUBLIC_API_URL="${api_base_url}" \
  --skip-deploys

railway up --service "${WEB_SERVICE}" --ci

mkdir -p "$(dirname "${SUMMARY_PATH}")"
jq -n \
  --arg generated_at "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
  --arg project "${PROJECT_NAME}" \
  --arg api_service "${API_SERVICE}" \
  --arg web_service "${WEB_SERVICE}" \
  --arg workers_service "${WORKERS_SERVICE}" \
  --arg api_base_url "${api_base_url}" \
  --arg web_url "${web_url}" \
  --arg api_secret_key "${API_SECRET_KEY}" \
  '{
    generated_at: $generated_at,
    project: $project,
    services: {
      api: { name: $api_service, url: $api_base_url },
      web: { name: $web_service, url: $web_url },
      workers: { name: $workers_service }
    },
    env_mapping: {
      API_SECRET_KEY: "api.API_SECRET_KEY, api.CLIME_API_KEYS, web.CLIME_WEB_API_KEY",
      DATABASE_URL: "api.DATABASE_URL, workers.DATABASE_URL",
      REDIS_URL: "api.REDIS_URL, workers.REDIS_URL",
      NEXT_PUBLIC_API_URL: "web.NEXT_PUBLIC_API_URL",
      CLIME_API_BASE_URL: "web.CLIME_API_BASE_URL"
    },
    healthcheck_key: $api_secret_key,
    rollback: "railway rollback --service <name>"
  }' > "${SUMMARY_PATH}"

echo "Deployment complete. Summary: ${SUMMARY_PATH}"
