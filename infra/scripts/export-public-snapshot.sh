#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEST="${1:-}"

if [[ -z "$DEST" ]]; then
  echo "Usage: $0 /absolute/path/to/public-repo-checkout"
  exit 1
fi

if [[ ! -d "$DEST" ]]; then
  echo "Destination does not exist: $DEST"
  exit 1
fi

if [[ ! -d "$DEST/.git" ]]; then
  echo "Destination must be a git checkout (missing .git): $DEST"
  exit 1
fi

echo "[export] cleaning destination working tree (preserving .git)"
find "$DEST" -mindepth 1 -maxdepth 1 ! -name '.git' -exec rm -rf {} +

copy_file() {
  local rel="$1"
  mkdir -p "$DEST/$(dirname "$rel")"
  cp "$ROOT/$rel" "$DEST/$rel"
}

copy_dir() {
  local rel="$1"
  mkdir -p "$DEST/$rel"
  rsync -a --delete \
    --exclude '.next/' \
    --exclude 'node_modules/' \
    --exclude '.turbo/' \
    --exclude 'coverage/' \
    --exclude 'dist/' \
    --exclude '*.tsbuildinfo' \
    --exclude '.DS_Store' \
    "$ROOT/$rel/" "$DEST/$rel/"
}

# Root files
copy_file ".env.example"
copy_file ".gitignore"
copy_file "README.md"
copy_file "LICENSE"
copy_file "CONTRIBUTING.md"
copy_file "CODE_OF_CONDUCT.md"
copy_file "SECURITY.md"
copy_file "LOG.md"
copy_file "eslint.config.js"
copy_file "lint-staged.config.js"
copy_file "package.json"
copy_file "package-lock.json"
copy_file "tsconfig.base.json"

# Tooling hooks/templates/workflows
copy_file ".husky/pre-commit"
copy_file ".github/pull_request_template.md"
copy_file ".github/workflows/ci.yml"
copy_file ".github/ISSUE_TEMPLATE/bug_report.yml"
copy_file ".github/ISSUE_TEMPLATE/feature_request.yml"
copy_file ".github/ISSUE_TEMPLATE/config.yml"

# Docs/assets
copy_dir "docs"

# Product source
copy_dir "apps"
copy_dir "packages"
copy_dir "workers"

# Infra (explicit allowlist only)
copy_dir "infra/distribution"
copy_dir "infra/environments"
copy_dir "infra/migrations"
copy_dir "infra/quality"
copy_dir "infra/scripts"

# Remove any generated artifacts that may come from copied dirs
rm -rf "$DEST/infra/generated"
rm -f "$DEST/apps/api/scratch-import.ts"
rm -rf "$DEST/apps/web/.next"

echo "[export] complete: $DEST"
