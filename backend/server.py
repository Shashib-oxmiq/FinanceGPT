from deps import db  # loads .env first
import os
import logging

from fastapi import FastAPI, Depends
from starlette.middleware.cors import CORSMiddleware

import storage
from auth import router as auth_router
from routes import router as api_router
from routes_legacy import router as legacy_router
from routes_share import router as share_router
from routes_voice import router as voice_router
from routes_gmail import router as gmail_router
from routes_market import router as market_router
from routes_forms import router as forms_router
from routes_docs import router as docs_router
from sync import init_sync_engine
from deps import get_current_user

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="Secure Document Vault & AI Advisor")

app.include_router(auth_router)
app.include_router(api_router)
app.include_router(legacy_router)
app.include_router(share_router)
app.include_router(voice_router)
app.include_router(gmail_router)
app.include_router(market_router)
app.include_router(forms_router)
app.include_router(docs_router)

cors_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins or ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_origin_regex=r"http://127\.0\.0\.1:\d+|http://localhost:\d+",
)


@app.get("/api/")
async def root():
    return {"status": "ok", "service": "Secure Document Vault & AI Advisor"}


@app.on_event("startup")
async def startup():
    try:
        storage.init_storage()
        logger.info("Local storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
    try:
        await db.users.create_index("email", unique=True)
        await db.users.create_index("user_id", unique=True)
        await db.user_sessions.create_index("session_token", unique=True)
        await db.documents.create_index("user_id")
        await db.conversations.create_index("user_id")
        await db.messages.create_index("conversation_id")
        await db.insurance_policies.create_index("user_id")
        await db.legacy_contacts.create_index("user_id")
        logger.info("Indexes ensured")
    except Exception as e:
        logger.error(f"Index creation failed: {e}")

    # Start cloud sync engine (if Atlas configured)
    global sync_engine
    sync_engine = init_sync_engine(db)
    await sync_engine.start()


@app.on_event("shutdown")
async def shutdown():
    if sync_engine:
        await sync_engine.stop()
    db.client if False else None


# ── Cloud sync API ──────────────────────────────────────────────────────────
@app.get("/api/sync/status")
async def sync_status(user: dict = Depends(get_current_user)):
    return sync_engine.status if sync_engine else {"enabled": False, "online": False}


@app.post("/api/sync/now")
async def sync_now(user: dict = Depends(get_current_user)):
    if not sync_engine:
        return {"error": "Sync engine not initialized"}
    return await sync_engine.sync_now()
