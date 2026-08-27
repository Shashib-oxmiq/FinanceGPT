#!/usr/bin/env bash
# Build the Electron desktop app for the current platform.
# Prerequisites:
#   1. MongoDB binary in electron/resources/<platform>/mongod
#   2. Backend executable in electron/resources/<platform>/backend
#   3. npm install
# Usage: ./scripts/build-app.sh [--no-sidecar]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(dirname "$SCRIPT_DIR")"
INCLUDE_SIDECAR=true

if [[ "${1:-}" == "--no-sidecar" ]]; then
    INCLUDE_SIDECAR=false
fi

PLATFORM="$(uname -s)"
case "$PLATFORM" in
    Darwin) PLATFORM_DIR="darwin" ;;
    Linux)  PLATFORM_DIR="linux" ;;
    *)      echo "Use build-app.ps1 on Windows" >&2; exit 1 ;;
esac

echo "=== Building FinanceGPT Desktop App ($PLATFORM_DIR) ==="

# Check sidecar binaries
if $INCLUDE_SIDECAR; then
    MONGOD="${FRONTEND_DIR}/electron/resources/${PLATFORM_DIR}/mongod"
    BACKEND="${FRONTEND_DIR}/electron/resources/${PLATFORM_DIR}/backend"

    if [[ ! -f "$MONGOD" ]]; then
        echo "WARNING: mongod not found at $MONGOD"
        echo "Run: electron/scripts/download-mongodb.sh"
        echo "Continuing without MongoDB sidecar..."
    fi
    if [[ ! -f "$BACKEND" ]]; then
        echo "WARNING: backend executable not found at $BACKEND"
        echo "See: backend/BUILD.md for build instructions"
        echo "Continuing without backend sidecar..."
    fi
fi

# Step 1: Install dependencies
echo "=== Installing npm dependencies ==="
cd "$FRONTEND_DIR"
npm install

# Step 2: Build the Vite frontend
echo "=== Building frontend (Vite) ==="
npm run build

# Step 3: Build the Electron app
echo "=== Building Electron app ==="
npx electron-builder --config electron-builder.yml

echo ""
echo "=== Build complete ==="
echo "Output: ${FRONTEND_DIR}/release/"