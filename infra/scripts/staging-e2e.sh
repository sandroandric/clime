#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOG_DIR="${ROOT_DIR}/infra/generated"
SESSION_LOG="${LOG_DIR}/staging-e2e-session.log"
SUMMARY_JSON="${LOG_DIR}/staging-e2e-summary.json"
API_LOG="${LOG_DIR}/staging-api.log"
WEB_LOG="${LOG_DIR}/staging-web.log"
PG_LOG="${LOG_DIR}/staging-postgres.log"

API_PORT="${CLIME_STAGE_API_PORT:-4100}"
WEB_PORT="${CLIME_STAGE_WEB_PORT:-4101}"
PG_PORT="${CLIME_STAGE_PG_PORT:-54339}"
API_URL="http://127.0.0.1:${API_PORT}"
WEB_URL="http://127.0.0.1:${WEB_PORT}"
API_KEY="${CLIME_STAGE_API_KEY:-stage-api-key}"
WEB_KEY="${CLIME_STAGE_WEB_KEY:-stage-web-key}"
DB_NAME="clime_stage"
DATABASE_URL="postgresql://postgres@127.0.0.1:${PG_PORT}/${DB_NAME}"

mkdir -p "${LOG_DIR}"
: > "${SESSION_LOG}"
: > "${API_LOG}"
: > "${WEB_LOG}"
: > "${PG_LOG}"

if ! command -v initdb >/dev/null 2>&1 || ! command -v pg_ctl >/dev/null 2>&1; then
  echo "Postgres binaries (initdb, pg_ctl) are required for staging simulation." >&2
  exit 1
fi

PG_DATA_DIR="$(mktemp -d "${TMPDIR:-/tmp}/clime-stage-pg.XXXXXX")"
API_PID=""
WEB_PID=""

cleanup() {
  set +e
  if [[ -n "${WEB_PID}" ]] && kill -0 "${WEB_PID}" >/dev/null 2>&1; then
    kill "${WEB_PID}" >/dev/null 2>&1
    wait "${WEB_PID}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${API_PID}" ]] && kill -0 "${API_PID}" >/dev/null 2>&1; then
    kill "${API_PID}" >/dev/null 2>&1
    wait "${API_PID}" >/dev/null 2>&1 || true
  fi
  pg_ctl -D "${PG_DATA_DIR}" stop -m fast >/dev/null 2>&1 || true
  rm -rf "${PG_DATA_DIR}"
}
trap cleanup EXIT

initdb -D "${PG_DATA_DIR}" -U postgres --no-locale -E UTF8 >/dev/null
{
  echo "listen_addresses='127.0.0.1'"
  echo "port=${PG_PORT}"
} >> "${PG_DATA_DIR}/postgresql.conf"
echo "host all all 127.0.0.1/32 trust" >> "${PG_DATA_DIR}/pg_hba.conf"
pg_ctl -D "${PG_DATA_DIR}" -l "${PG_LOG}" start >/dev/null
createdb -h 127.0.0.1 -p "${PG_PORT}" -U postgres "${DB_NAME}"

(
  cd "${ROOT_DIR}"
  npm run build >/dev/null
)

(
  cd "${ROOT_DIR}"
  NODE_ENV=staging \
  HOST=127.0.0.1 \
  PORT="${API_PORT}" \
  CLIME_API_KEYS="${API_KEY},${WEB_KEY},dev-local-key" \
  CLIME_RATE_LIMIT_PER_MINUTE=500 \
  DATABASE_URL="${DATABASE_URL}" \
  "${ROOT_DIR}/node_modules/.bin/tsx" apps/api/src/server.ts >> "${API_LOG}" 2>&1
) &
API_PID=$!

for _ in {1..60}; do
  if curl -fsS "${API_URL}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -fsS "${API_URL}/health" >/dev/null 2>&1; then
  echo "API failed to become healthy." >&2
  exit 1
fi

(
  cd "${ROOT_DIR}/apps/web"
  NODE_ENV=staging \
  CLIME_API_BASE_URL="${API_URL}" \
  CLIME_WEB_API_KEY="${WEB_KEY}" \
  PORT="${WEB_PORT}" \
  npm run start >> "${WEB_LOG}" 2>&1
) &
WEB_PID=$!

for _ in {1..60}; do
  if curl -fsS "${WEB_URL}" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

CLI_BIN="${ROOT_DIR}/packages/cli/dist/index.js"

run_clime() {
  local label="$1"
  shift
  echo "\$ ${label}" >> "${SESSION_LOG}"
  local output
  output="$(node "${CLI_BIN}" --api-key "${API_KEY}" --base-url "${API_URL}" "$@" 2>&1)"
  printf '%s\n\n' "${output}" >> "${SESSION_LOG}"
  printf '%s' "${output}"
}

parse_top_slug() {
  node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{const p=JSON.parse(s);console.log(p?.data?.[0]?.cli?.slug ?? "");});'
}

parse_first_command_id() {
  node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{const p=JSON.parse(s);console.log(p?.data?.[0]?.id ?? "");});'
}

now_iso() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

deploy_search_output="$(run_clime "clime search 'deploy next.js app'" search "deploy next.js app")"
deploy_top_slug="$(printf '%s' "${deploy_search_output}" | parse_top_slug)"

vercel_install_output="$(run_clime "clime install vercel" install vercel)"
vercel_auth_output="$(run_clime "clime auth vercel" auth vercel)"
vercel_commands_output="$(run_clime "clime commands vercel --workflow=deploy" commands vercel --workflow deploy)"
vercel_command_id="$(printf '%s' "${vercel_commands_output}" | parse_first_command_id)"
if [[ -z "${vercel_command_id}" ]]; then
  echo "No deploy command returned for vercel workflow filter." >&2
  exit 1
fi
vercel_report_output="$(
  run_clime \
    "clime report vercel --status=success --command-id=${vercel_command_id}" \
    report vercel \
    --status success \
    --cli-version latest \
    --command-id "${vercel_command_id}" \
    --duration-ms 1800 \
    --exit-code 0 \
    --agent-name "staging-agent-sim" \
    --agent-version "1.0.0" \
    --os linux \
    --arch x64 \
    --request-id "stage-vercel-$(date +%s)" \
    --timestamp "$(now_iso)"
)"

db_search_output="$(run_clime "clime search 'postgres database cli'" search "postgres database cli")"
db_top_slug="$(printf '%s' "${db_search_output}" | parse_top_slug)"

supabase_install_output="$(run_clime "clime install supabase" install supabase)"
supabase_auth_output="$(run_clime "clime auth supabase" auth supabase)"
supabase_commands_output="$(run_clime "clime commands supabase --workflow=database" commands supabase --workflow database)"
supabase_command_id="$(printf '%s' "${supabase_commands_output}" | parse_first_command_id)"
if [[ -z "${supabase_command_id}" ]]; then
  echo "No database command returned for supabase workflow filter." >&2
  exit 1
fi
supabase_report_output="$(
  run_clime \
    "clime report supabase --status=success --command-id=${supabase_command_id}" \
    report supabase \
    --status success \
    --cli-version latest \
    --command-id "${supabase_command_id}" \
    --duration-ms 2200 \
    --exit-code 0 \
    --agent-name "staging-agent-sim" \
    --agent-version "1.0.0" \
    --os linux \
    --arch x64 \
    --request-id "stage-supabase-$(date +%s)" \
    --timestamp "$(now_iso)"
)"

payments_search_output="$(run_clime "clime search 'payments cli webhooks'" search "payments cli webhooks")"
payments_top_slug="$(printf '%s' "${payments_search_output}" | parse_top_slug)"

stripe_install_output="$(run_clime "clime install stripe" install stripe)"
stripe_auth_output="$(run_clime "clime auth stripe" auth stripe)"
stripe_commands_output="$(run_clime "clime commands stripe --workflow=payments" commands stripe --workflow payments)"
stripe_command_id="$(printf '%s' "${stripe_commands_output}" | parse_first_command_id)"
if [[ -z "${stripe_command_id}" ]]; then
  echo "No payments command returned for stripe workflow filter." >&2
  exit 1
fi
stripe_report_output="$(
  run_clime \
    "clime report stripe --status=success --command-id=${stripe_command_id}" \
    report stripe \
    --status success \
    --cli-version latest \
    --command-id "${stripe_command_id}" \
    --duration-ms 1600 \
    --exit-code 0 \
    --agent-name "staging-agent-sim" \
    --agent-version "1.0.0" \
    --os linux \
    --arch x64 \
    --request-id "stage-stripe-$(date +%s)" \
    --timestamp "$(now_iso)"
)"

workflow_output="$(run_clime "clime workflow 'full-stack saas'" workflow "full-stack saas")"
ranking_output="$(run_clime "clime rankings --type=used" rankings --type used)"

WORKFLOW_JSON="${workflow_output}" \
RANKING_JSON="${ranking_output}" \
DEPLOY_TOP="${deploy_top_slug}" \
DB_TOP="${db_top_slug}" \
PAYMENTS_TOP="${payments_top_slug}" \
SUMMARY_JSON_PATH="${SUMMARY_JSON}" \
node <<'NODE'
const fs = require("node:fs");

const workflowPayload = JSON.parse(process.env.WORKFLOW_JSON ?? "{}");
const rankingPayload = JSON.parse(process.env.RANKING_JSON ?? "{}");

const workflow = workflowPayload?.data?.[0];
if (!workflow || !Array.isArray(workflow.steps) || workflow.steps.length < 3) {
  throw new Error("Workflow search did not return a valid multi-step chain.");
}

const ordered = workflow.steps.every((step, index) => Number(step.step_number) === index + 1);
if (!ordered) {
  throw new Error("Workflow steps are not ordered.");
}

const entries = rankingPayload?.data?.entries ?? [];
const rankBySlug = new Map(entries.map((entry, index) => [entry.id, index + 1]));
for (const slug of ["vercel", "supabase", "stripe"]) {
  if (!rankBySlug.has(slug)) {
    throw new Error(`Expected ${slug} to appear in used rankings.`);
  }
}

const summary = {
  generated_at: new Date().toISOString(),
  stage: {
    deploy_search_top: process.env.DEPLOY_TOP ?? "",
    database_search_top: process.env.DB_TOP ?? "",
    payments_search_top: process.env.PAYMENTS_TOP ?? ""
  },
  workflow: {
    id: workflow.id,
    slug: workflow.slug,
    step_count: workflow.steps.length,
    ordered
  },
  rankings: {
    vercel_rank: rankBySlug.get("vercel"),
    supabase_rank: rankBySlug.get("supabase"),
    stripe_rank: rankBySlug.get("stripe")
  }
};

fs.writeFileSync(process.env.SUMMARY_JSON_PATH, JSON.stringify(summary, null, 2));
NODE

echo "Staging E2E session log: ${SESSION_LOG}"
echo "Staging E2E summary: ${SUMMARY_JSON}"
