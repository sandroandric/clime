#!/usr/bin/env bash
set -euo pipefail

REPO_OWNER="clime-registry"
REPO_NAME="clime"
VERSION="${CLIME_VERSION:-latest}"
EXPECTED_SHA256="${CLIME_EXPECTED_SHA256:-}"
INSTALL_DIR="${CLIME_INSTALL_DIR:-$HOME/.local/bin}"
DEFAULT_API_URL="${CLIME_API_BASE_URL:-https://api.clime.sh}"
CONFIG_DIR="${CLIME_CONFIG_DIR:-$HOME/.clime}"
CONFIG_PATH="${CONFIG_DIR}/config.json"

if [[ "${1:-}" == "--sha256" ]]; then
  EXPECTED_SHA256="$2"
fi

if [[ "${VERSION}" == "latest" ]]; then
  DOWNLOAD_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest/download/clime"
else
  DOWNLOAD_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/download/${VERSION}/clime"
fi

mkdir -p "$INSTALL_DIR"
TMP_FILE="$(mktemp)"

curl -fsSL "$DOWNLOAD_URL" -o "$TMP_FILE"

if [[ ! -s "$TMP_FILE" ]]; then
  echo "Error: Download failed or file is empty"
  rm -f "$TMP_FILE"
  exit 1
fi

if [[ -n "$EXPECTED_SHA256" ]]; then
  ACTUAL_SHA256="$(shasum -a 256 "$TMP_FILE" | awk '{print $1}')"
  if [[ "$ACTUAL_SHA256" != "$EXPECTED_SHA256" ]]; then
    echo "Checksum mismatch"
    echo "Expected: $EXPECTED_SHA256"
    echo "Actual:   $ACTUAL_SHA256"
    rm -f "$TMP_FILE"
    exit 1
  fi
fi

install -m 0755 "$TMP_FILE" "$INSTALL_DIR/clime"
rm -f "$TMP_FILE"

if [[ ! -f "$CONFIG_PATH" ]]; then
  mkdir -p "$CONFIG_DIR"
  cat > "$CONFIG_PATH" <<EOF
{
  "baseUrl": "$DEFAULT_API_URL"
}
EOF
fi

echo "clime installed to $INSTALL_DIR/clime"
echo "Add to PATH if needed: export PATH=\"$INSTALL_DIR:\$PATH\""
echo "Default API URL: $DEFAULT_API_URL"
