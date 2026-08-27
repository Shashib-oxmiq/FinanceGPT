"""
PyInstaller entry point for the FinanceGPT FastAPI backend.

When packaged with PyInstaller, this script starts uvicorn programmatically
with the FastAPI app from server.py. It accepts --port as a CLI argument
(injected by the Electron sidecar manager) and handles graceful shutdown
on SIGTERM/SIGINT.
"""
import sys
import os
import signal
import uvicorn

# Ensure the bundle directory is on the path so PyInstaller can find modules
if getattr(sys, "frozen", False):
    bundle_dir = os.path.dirname(sys.executable)
    sys.path.insert(0, bundle_dir)

from server import app


def parse_port():
    """Parse --port from CLI args, defaulting to 8000."""
    port = 8000
    for i, arg in enumerate(sys.argv):
        if arg == "--port" and i + 1 < len(sys.argv):
            try:
                port = int(sys.argv[i + 1])
            except ValueError:
                pass
    return port


def main():
    port = parse_port()

    config = uvicorn.Config(
        app,
        host="127.0.0.1",
        port=port,
        log_level="info",
        workers=1,
        reload=False,
    )
    server = uvicorn.Server(config)

    # Graceful shutdown on SIGTERM (sent by Electron's sidecar manager)
    def handle_signal(signum, frame):
        server.should_exit = True

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    server.run()


if __name__ == "__main__":
    main()