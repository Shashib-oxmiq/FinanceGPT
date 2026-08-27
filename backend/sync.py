"""
Cloud sync engine — bidirectional sync between local MongoDB and MongoDB Atlas.

Architecture:
  - Local DB: bundled MongoDB (sidecar), always available
  - Cloud DB: MongoDB Atlas (optional, set ATLAS_MONGO_URL in .env)
  - Sync strategy: last-write-wins by `updated_at` / `created_at` timestamp
  - Trigger: auto-sync every 60 seconds when online; manual via API
  - Offline: gracefully skip, retry on next cycle

Collections synced:
  users, user_sessions, documents, conversations, messages, chat_files,
  insurance_policies, policy_analyses, legacy_contacts, life_event_trackers,
  investments, insights, bundles, form_copies, shares, gmail_oauth_states,
  gmail_tokens

Usage:
  from sync import sync_engine
  await sync_engine.start()   # called on app startup
  await sync_engine.stop()    # called on app shutdown
  status = sync_engine.status  # {enabled, online, last_sync, ...}
  await sync_engine.sync_now() # manual trigger
"""

import os
import asyncio
import logging
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient

logger = logging.getLogger(__name__)

# ── Collections to sync (exclude ephemeral/local-only) ───────────────────────
SYNC_COLLECTIONS = [
    "users",
    "user_sessions",
    "documents",
    "conversations",
    "messages",
    "chat_files",
    "insurance_policies",
    "policy_analyses",
    "legacy_contacts",
    "life_event_trackers",
    "investments",
    "insights",
    "bundles",
    "form_copies",
    "shares",
    "gmail_oauth_states",
    "gmail_tokens",
]

SYNC_INTERVAL = 60  # seconds between auto-sync cycles


def _get_timestamp(doc: dict) -> datetime:
    """Extract the best available timestamp from a document."""
    for field in ("updated_at", "created_at", "timestamp"):
        val = doc.get(field)
        if val:
            if isinstance(val, datetime):
                if val.tzinfo is None:
                    return val.replace(tzinfo=timezone.utc)
                return val
            if isinstance(val, str):
                try:
                    dt = datetime.fromisoformat(val)
                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=timezone.utc)
                    return dt
                except Exception:
                    pass
    # Fallback to epoch — very old, so any real timestamp wins
    return datetime(2000, 1, 1, tzinfo=timezone.utc)


def _doc_id(doc: dict) -> str:
    """Get a stable string ID for comparison."""
    oid = doc.get("_id")
    if oid:
        return str(oid)
    for field in ("user_id", "conversation_id", "message_id", "document_id",
                  "session_token", "attachment_id", "share_token", "policy_id"):
        val = doc.get(field)
        if val:
            return str(val)
    return str(oid)


class SyncEngine:
    """Bidirectional sync between local and cloud MongoDB (last-write-wins)."""

    def __init__(self, local_db):
        self.local_db = local_db
        self.atlas_url = os.environ.get("ATLAS_MONGO_URL", "").strip()
        self.atlas_db_name = os.environ.get("ATLAS_DB_NAME", "").strip()
        self.enabled = bool(self.atlas_url)
        self.cloud_client = None
        self.cloud_db = None
        self._task = None
        self._running = False
        self._syncing = False
        self.last_sync = None
        self.last_error = None
        self.sync_count = 0
        self.online = False

    async def start(self):
        """Start the background sync loop (if Atlas is configured)."""
        if not self.enabled:
            logger.info("Cloud sync disabled — ATLAS_MONGO_URL not set")
            return

        try:
            self.cloud_client = AsyncIOMotorClient(self.atlas_url, serverSelectionTimeoutMS=5000)
            # Use same DB name as local if ATLAS_DB_NAME not specified
            cloud_name = self.atlas_db_name or self.local_db.name
            self.cloud_db = self.cloud_client[cloud_name]
            # Test connection
            await self.cloud_client.admin.command("ping")
            self.online = True
            logger.info(f"Cloud sync enabled — connected to Atlas (db: {cloud_name})")
        except Exception as e:
            self.online = False
            logger.warning(f"Atlas connection failed: {e}")
            # Still start the loop — it will retry
            self.cloud_client = None
            self.cloud_db = None

        self._running = True
        self._task = asyncio.create_task(self._sync_loop())
        logger.info("Background sync loop started")

    async def stop(self):
        """Stop the background sync loop."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        if self.cloud_client:
            self.cloud_client.close()
        logger.info("Cloud sync stopped")

    async def _sync_loop(self):
        """Background loop that syncs every SYNC_INTERVAL seconds."""
        while self._running:
            try:
                await self._do_sync()
            except Exception as e:
                self.last_error = str(e)
                logger.error(f"Sync error: {e}")
            await asyncio.sleep(SYNC_INTERVAL)

    async def _ensure_cloud_connection(self) -> bool:
        """Try to (re)connect to Atlas if not connected."""
        if self.cloud_db is not None:
            try:
                await self.cloud_client.admin.command("ping")
                self.online = True
                return True
            except Exception:
                self.online = False
                self.cloud_db = None
                self.cloud_client = None

        if not self.atlas_url:
            return False

        try:
            self.cloud_client = AsyncIOMotorClient(self.atlas_url, serverSelectionTimeoutMS=5000)
            cloud_name = self.atlas_db_name or self.local_db.name
            self.cloud_db = self.cloud_client[cloud_name]
            await self.cloud_client.admin.command("ping")
            self.online = True
            logger.info("Reconnected to Atlas")
            return True
        except Exception as e:
            self.online = False
            self.last_error = str(e)
            return False

    async def _do_sync(self):
        """Perform one full bidirectional sync cycle."""
        if self._syncing:
            return  # avoid re-entrancy

        if not await self._ensure_cloud_connection():
            return  # offline — skip

        self._syncing = True
        pushed = 0
        pulled = 0
        conflicts = 0

        for coll_name in SYNC_COLLECTIONS:
            try:
                p, pl, c = await self._sync_collection(coll_name)
                pushed += p
                pulled += pl
                conflicts += c
            except Exception as e:
                logger.error(f"Sync error on {coll_name}: {e}")

        self.last_sync = datetime.now(timezone.utc).isoformat()
        self.sync_count += 1
        self.last_error = None
        logger.info(f"Sync #{self.sync_count} complete: pushed={pushed}, pulled={pulled}, conflicts={conflicts}")
        self._syncing = False

    async def _sync_collection(self, coll_name: str):
        """Sync one collection bidirectionally. Returns (pushed, pulled, conflicts)."""
        local_coll = self.local_db[coll_name]
        cloud_coll = self.cloud_db[coll_name]
        pushed = pulled = conflicts = 0

        # ── Push: local → cloud (local is newer) ────────────────────────────
        async for doc in local_coll.find({}):
            doc_id = _doc_id(doc)
            local_ts = _get_timestamp(doc)

            # Find matching cloud doc by _id or secondary key
            query = {"_id": doc.get("_id")}
            if not doc.get("_id"):
                # Try secondary key lookup
                for field in ("user_id", "conversation_id", "message_id",
                              "document_id", "session_token", "share_token"):
                    if doc.get(field):
                        query = {field: doc[field]}
                        break

            cloud_doc = await cloud_coll.find_one(query)

            if cloud_doc is None:
                # Push new doc to cloud
                await cloud_coll.insert_one(dict(doc))
                pushed += 1
            else:
                cloud_ts = _get_timestamp(cloud_doc)
                if local_ts > cloud_ts:
                    # Local is newer — update cloud
                    await cloud_coll.replace_one(query, dict(doc))
                    pushed += 1
                elif local_ts < cloud_ts:
                    # Cloud is newer — will be pulled below
                    conflicts += 1

        # ── Pull: cloud → local (cloud is newer) ─────────────────────────────
        async for doc in cloud_coll.find({}):
            doc_id = _doc_id(doc)
            cloud_ts = _get_timestamp(doc)

            query = {"_id": doc.get("_id")}
            if not doc.get("_id"):
                for field in ("user_id", "conversation_id", "message_id",
                              "document_id", "session_token", "share_token"):
                    if doc.get(field):
                        query = {field: doc[field]}
                        break

            local_doc = await local_coll.find_one(query)

            if local_doc is None:
                # Pull new doc from cloud
                await local_coll.insert_one(dict(doc))
                pulled += 1
            else:
                local_ts = _get_timestamp(local_doc)
                if cloud_ts > local_ts:
                    # Cloud is newer — update local
                    await local_coll.replace_one(query, dict(doc))
                    pulled += 1

        return pushed, pulled, conflicts

    async def sync_now(self):
        """Manually trigger a sync cycle."""
        if not self.enabled:
            return {"error": "Cloud sync not configured"}
        await self._do_sync()
        return self.status

    @property
    def status(self) -> dict:
        """Return current sync status for the API."""
        return {
            "enabled": self.enabled,
            "online": self.online,
            "syncing": self._syncing,
            "last_sync": self.last_sync,
            "last_error": self.last_error,
            "sync_count": self.sync_count,
            "interval_seconds": SYNC_INTERVAL,
            "collections": len(SYNC_COLLECTIONS),
        }


# ── Singleton ───────────────────────────────────────────────────────────────
# Initialized in server.py startup after local_db is available
sync_engine: "SyncEngine | None" = None

def init_sync_engine(local_db):
    """Create the global sync engine singleton."""
    global sync_engine
    sync_engine = SyncEngine(local_db)
    return sync_engine