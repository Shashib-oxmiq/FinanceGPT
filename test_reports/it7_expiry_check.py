"""Insert an already-expired share directly in Mongo and assert 410 from the public API."""
import asyncio, os, uuid, secrets
from datetime import datetime, timezone, timedelta
import requests
from dotenv import dotenv_values
from motor.motor_asyncio import AsyncIOMotorClient

be = dotenv_values("/app/backend/.env")
fe = dotenv_values("/app/frontend/.env")
BASE = fe["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"


async def main():
    cli = AsyncIOMotorClient(be["MONGO_URL"])
    db = cli[be["DB_NAME"]]
    u = await db.users.find_one({"email": "demo@example.com"}, {"_id": 0, "user_id": 1})
    token = secrets.token_urlsafe(9)
    share = {
        "share_id": str(uuid.uuid4()), "user_id": u["user_id"], "token": token,
        "password": "12345678", "name": "TEST_it7 expired", "document_ids": [],
        "expires_at": (datetime.now(timezone.utc) - timedelta(days=1)).isoformat(),
        "revoked": False, "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.shares.insert_one(dict(share))
    r = requests.post(f"{BASE}/shares/{token}/access", json={"password": "12345678"}, timeout=60)
    print("expired share access status:", r.status_code, r.text[:120])
    assert r.status_code == 410, "expected 410 for expired share"
    await db.shares.delete_one({"share_id": share["share_id"]})
    print("cleanup done; PASS")


asyncio.run(main())
