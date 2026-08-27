#!/usr/bin/env bash
# Launcher for the FinanceGPT Electron desktop app.
# Starts a tiny HTTP server on $PORT for readiness probing,
# then launches Electron. On SIGTERM, kills Electron (triggers
# before-quit → sidecar cleanup).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$FRONTEND_DIR"

# Critical: must be unset BEFORE the Electron binary starts
unset ELECTRON_RUN_AS_NODE 2>/dev/null || true
export ELECTRON_DEV_SERVER="${ELECTRON_DEV_SERVER:-0}"

ELECTRON_BIN="node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
if [ ! -f "$ELECTRON_BIN" ]; then
    echo "ERROR: Electron binary not found" >&2
    exit 1
fi

# Start a minimal HTTP server on $PORT for readiness probing (Node.js)
node -e '
const http = require("http");
const port = parseInt(process.env.PORT || "0", 10);
const s = http.createServer((req, res) => { res.writeHead(200); res.end("ok"); });
s.listen(port, "127.0.0.1", () => console.log("Probe server on", port));
' &
PROBE_PID=$!

# Give the probe server a moment to bind
sleep 1

ELECTRON_PID=""
cleanup() {
    if [ -n "$ELECTRON_PID" ] && kill -0 "$ELECTRON_PID" 2>/dev/null; then
        kill "$ELECTRON_PID" 2>/dev/null || true
        sleep 3
        kill -9 "$ELECTRON_PID" 2>/dev/null || true
    fi
    kill "$PROBE_PID" 2>/dev/null || true
}
trap cleanup EXIT TERM INT

# Launch Electron in the foreground
"$ELECTRON_BIN" . &
ELECTRON_PID=$!

# Wait for Electron to exit
wait "$ELECTRON_PID" 2>/dev/null || true
cleanup