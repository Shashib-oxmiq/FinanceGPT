#!/usr/bin/env bash
# Download MongoDB Community Server binaries for the FinanceGPT desktop app.
# Usage: ./download-mongodb.sh [--force]
set -euo pipefail

MONGODB_VERSION="7.0.14"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESOURCES_DIR="$(dirname "$SCRIPT_DIR")/resources"
FORCE=false

if [[ "${1:-}" == "--force" ]]; then
    FORCE=true
fi

detect_platform() {
    case "$(uname -s)" in
        Darwin) echo "darwin" ;;
        Linux)   echo "linux" ;;
        *)       echo "Unsupported platform: $(uname -s)" >&2; exit 1 ;;
    esac
}

download_darwin() {
    local url="https://fastdl.mongodb.org/osx/mongodb-macos-arm64-${MONGODB_VERSION}.tgz"
    local target="${RESOURCES_DIR}/darwin/mongod"
    local tmpdir
    tmpdir="$(mktemp -d)"
    trap 'rm -rf "$tmpdir"' EXIT

    if [[ -f "$target" ]] && ! $FORCE; then
        echo "mongod already exists at $target (use --force to re-download)"
        return 0
    fi

    echo "Downloading MongoDB ${MONGODB_VERSION} for macOS arm64..."
    curl -fSL -o "${tmpdir}/mongodb.tgz" "$url" || { echo "Download failed" >&2; exit 1; }

    echo "Extracting..."
    tar -xzf "${tmpdir}/mongodb.tgz" -C "$tmpdir" || { echo "Extraction failed" >&2; exit 1; }

    mkdir -p "${RESOURCES_DIR}/darwin"
    local bin
    bin="$(find "$tmpdir" -name 'mongod' -type f | head -1)"
    if [[ -z "$bin" ]]; then
        echo "mongod binary not found in archive" >&2; exit 1
    fi
    cp "$bin" "$target"
    chmod +x "$target"
    echo "Done: $target"
}

download_linux() {
    local url="https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-ubuntu2204-${MONGODB_VERSION}.tgz"
    local target="${RESOURCES_DIR}/linux/mongod"
    local tmpdir
    tmpdir="$(mktemp -d)"
    trap 'rm -rf "$tmpdir"' EXIT

    if [[ -f "$target" ]] && ! $FORCE; then
        echo "mongod already exists at $target (use --force to re-download)"
        return 0
    fi

    echo "Downloading MongoDB ${MONGODB_VERSION} for Linux x86_64..."
    curl -fSL -o "${tmpdir}/mongodb.tgz" "$url" || { echo "Download failed" >&2; exit 1; }

    echo "Extracting..."
    tar -xzf "${tmpdir}/mongodb.tgz" -C "$tmpdir" || { echo "Extraction failed" >&2; exit 1; }

    mkdir -p "${RESOURCES_DIR}/linux"
    local bin
    bin="$(find "$tmpdir" -name 'mongod' -type f | head -1)"
    if [[ -z "$bin" ]]; then
        echo "mongod binary not found in archive" >&2; exit 1
    fi
    cp "$bin" "$target"
    chmod +x "$target"
    echo "Done: $target"
}

PLATFORM="$(detect_platform)"
echo "Platform: $PLATFORM"

case "$PLATFORM" in
    darwin) download_darwin ;;
    linux)  download_linux ;;
esac