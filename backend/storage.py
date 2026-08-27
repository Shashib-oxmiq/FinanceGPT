"""
Local filesystem object storage — replaces the cloud emergentagent.com storage.

Stores files under a local data directory (~/Library/Application Support/frontend/storage
on macOS). Preserves the same interface (init_storage, put_object, get_object) so
all routes work unchanged.
"""

import os
import pathlib
import logging

logger = logging.getLogger(__name__)

# ── Storage root ─────────────────────────────────────────────────────────────
# Use the app's Application Support directory (same parent as MongoDB data dir)
_home = pathlib.Path.home()
if _home.name == "shashib":
    _base = _home / "Library" / "Application Support" / "frontend" / "storage"
else:
    _base = pathlib.Path(os.environ.get("STORAGE_DIR", str(_home / ".everkin" / "storage")))

_base.mkdir(parents=True, exist_ok=True)
storage_key = "local"  # dummy key for interface compatibility


def init_storage(force: bool = False):
    """Initialize local storage. Returns a dummy key for compatibility."""
    global storage_key
    _base.mkdir(parents=True, exist_ok=True)
    return storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    """Store data at the given relative path. Returns a dict with storage info."""
    # Sanitize path — prevent directory traversal
    safe_path = _sanitize_path(path)
    full = _base / safe_path
    full.parent.mkdir(parents=True, exist_ok=True)
    full.write_bytes(data)
    return {"path": path, "size": len(data), "content_type": content_type}


def get_object(path: str):
    """Retrieve data from the given relative path. Returns (bytes, content_type)."""
    safe_path = _sanitize_path(path)
    full = _base / safe_path
    if not full.exists():
        raise FileNotFoundError(f"Object not found: {path}")
    data = full.read_bytes()
    # Guess content type from extension
    ext = full.suffix.lstrip(".").lower()
    content_type = MIME_TYPES.get(ext, "application/octet-stream")
    return data, content_type


def delete_object(path: str):
    """Delete an object from storage."""
    safe_path = _sanitize_path(path)
    full = _base / safe_path
    if full.exists():
        full.unlink()
        return True
    return False


def _sanitize_path(path: str) -> str:
    """Prevent directory traversal — only allow relative paths under _base."""
    # Strip leading slashes
    clean = path.lstrip("/\\")
    # Resolve and ensure it's under _base
    parts = pathlib.Path(clean).parts
    safe = pathlib.Path(*[p for p in parts if p not in ("..", ".", "/")])
    return str(safe)


MIME_TYPES = {
    "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
    "gif": "image/gif", "webp": "image/webp", "pdf": "application/pdf",
    "json": "application/json", "csv": "text/csv", "txt": "text/plain",
    "doc": "application/msword",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xls": "application/vnd.ms-excel",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}