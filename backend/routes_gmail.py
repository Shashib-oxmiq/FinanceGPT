import os
import uuid
import base64
import warnings
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel
from typing import List, Optional

from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleRequest
from googleapiclient.discovery import build

from deps import db, get_current_user, APP_NAME
import storage
from routes import classify_document, now_iso

router = APIRouter(prefix="/api")

CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
REDIRECT_URI = os.environ.get("GMAIL_REDIRECT_URI", "")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "")
TOKEN_URI = "https://oauth2.googleapis.com/token"

SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
]

# Keyword → category heuristics for the review screen.
CATEGORY_KEYWORDS = {
    "insurance": ["insurance", "policy", "premium", "coverage", "nominee", "mediclaim"],
    "tax": ["tax", "itr", "1099", "w-2", "w2", "form 16", "form-16", "irs", "gst"],
    "bank_statement": ["bank statement", "account statement", "savings account", "e-statement"],
    "credit_card_statement": ["credit card", "card statement", "creditcard"],
    "investment": ["mutual fund", "portfolio", "demat", "folio", "nav", "stocks", "equity", "sip"],
    "identity": ["passport", "aadhaar", "aadhar", "pan card", "driver", "licence", "license", "national id", "voter"],
    "property": ["mortgage", "rent agreement", "lease", "property", "deed", "sale agreement"],
    "vehicle": ["rc book", "vehicle", "registration certificate", "car loan", "insurance policy vehicle"],
    "medical": ["medical", "prescription", "lab report", "diagnos", "hospital", "discharge"],
    "employment": ["salary", "payslip", "offer letter", "appointment", "relieving", "payroll"],
    "education": ["marksheet", "transcript", "degree", "certificate", "admission"],
    "travel": ["ticket", "boarding", "itinerary", "booking", "visa"],
}

FINANCE_QUERY_TERMS = (
    'statement OR invoice OR policy OR insurance OR premium OR tax OR receipt OR '
    'passport OR aadhaar OR pan OR mortgage OR loan OR salary OR payslip OR mutual OR portfolio OR '
    '"account statement" OR "credit card"'
)


def _flow():
    return Flow.from_client_config(
        {
            "web": {
                "client_id": CLIENT_ID,
                "client_secret": CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": TOKEN_URI,
                "redirect_uris": [REDIRECT_URI],
            }
        },
        scopes=SCOPES,
        redirect_uri=REDIRECT_URI,
    )


def _guess_category(subject: str, filename: str) -> str:
    text = f"{subject} {filename}".lower()
    for cat, kws in CATEGORY_KEYWORDS.items():
        if any(k in text for k in kws):
            return cat
    return ""


async def _get_creds(user_id: str) -> Credentials:
    tok = await db.gmail_tokens.find_one({"user_id": user_id}, {"_id": 0})
    if not tok:
        raise HTTPException(status_code=401, detail="Gmail not connected")
    creds = Credentials(
        token=tok.get("access_token"),
        refresh_token=tok.get("refresh_token"),
        token_uri=tok.get("token_uri", TOKEN_URI),
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET,
        scopes=SCOPES,
    )
    exp = tok.get("expires_at")
    if isinstance(exp, str):
        try:
            exp = datetime.fromisoformat(exp)
        except Exception:
            exp = None
    if exp and exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if not exp or datetime.now(timezone.utc) >= exp - timedelta(seconds=60):
        if not creds.refresh_token:
            raise HTTPException(status_code=401, detail="Gmail session expired — reconnect")
        await run_in_threadpool(creds.refresh, GoogleRequest())
        await db.gmail_tokens.update_one(
            {"user_id": user_id},
            {"$set": {"access_token": creds.token, "expires_at": (creds.expiry.replace(tzinfo=timezone.utc) if creds.expiry else None).isoformat() if creds.expiry else None}},
        )
    return creds


def _service(creds):
    return build("gmail", "v1", credentials=creds, cache_discovery=False)


# ---------------- OAuth ----------------
@router.get("/oauth/gmail/login")
async def gmail_login(user: dict = Depends(get_current_user)):
    if not CLIENT_ID or not CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Gmail is not configured")
    flow = _flow()
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        url, state = flow.authorization_url(access_type="offline", prompt="consent", include_granted_scopes="true")
    await db.gmail_oauth_states.insert_one({
        "state": state, "user_id": user["user_id"],
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
    })
    return {"url": url}


@router.get("/oauth/gmail/callback")
async def gmail_callback(code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None):
    dest = f"{FRONTEND_URL}/gmail"
    if error or not code or not state:
        return RedirectResponse(f"{dest}?error=1")
    st = await db.gmail_oauth_states.find_one({"state": state}, {"_id": 0})
    if not st:
        return RedirectResponse(f"{dest}?error=state")
    await db.gmail_oauth_states.delete_one({"state": state})
    user_id = st["user_id"]
    flow = _flow()
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            await run_in_threadpool(flow.fetch_token, code=code)
    except Exception:
        return RedirectResponse(f"{dest}?error=token")
    creds = flow.credentials
    email = ""
    try:
        info = await run_in_threadpool(lambda: build("oauth2", "v2", credentials=creds, cache_discovery=False).userinfo().get().execute())
        email = info.get("email", "")
    except Exception:
        pass
    await db.gmail_tokens.update_one(
        {"user_id": user_id},
        {"$set": {
            "user_id": user_id,
            "access_token": creds.token,
            "refresh_token": creds.refresh_token,
            "token_uri": TOKEN_URI,
            "email": email,
            "expires_at": (creds.expiry.replace(tzinfo=timezone.utc).isoformat() if creds.expiry else None),
            "updated_at": now_iso(),
        }},
        upsert=True,
    )
    return RedirectResponse(f"{dest}?connected=1")


@router.get("/gmail/status")
async def gmail_status(user: dict = Depends(get_current_user)):
    tok = await db.gmail_tokens.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return {"connected": bool(tok), "email": (tok or {}).get("email", "")}


@router.post("/gmail/disconnect")
async def gmail_disconnect(user: dict = Depends(get_current_user)):
    await db.gmail_tokens.delete_one({"user_id": user["user_id"]})
    return {"ok": True}


# ---------------- Scan & Import ----------------
class ScanBody(BaseModel):
    scope: str = "recent"  # "recent" = last 12 months, "older" = 1-10 years ago
    max_messages: int = 60


def _walk_parts(payload, out):
    for part in payload.get("parts", []) or []:
        filename = part.get("filename")
        body = part.get("body", {}) or {}
        if filename and body.get("attachmentId"):
            out.append({
                "filename": filename,
                "mime_type": part.get("mimeType", "application/octet-stream"),
                "attachment_id": body["attachmentId"],
                "size": body.get("size", 0),
            })
        if part.get("parts"):
            _walk_parts(part, out)


def _header(msg, name):
    for h in msg.get("payload", {}).get("headers", []) or []:
        if h.get("name", "").lower() == name.lower():
            return h.get("value", "")
    return ""


def _do_scan(creds, scope, max_messages):
    svc = _service(creds)
    if scope == "older":
        q = f"has:attachment older_than:1y newer_than:10y ({FINANCE_QUERY_TERMS})"
    else:
        q = f"has:attachment newer_than:1y ({FINANCE_QUERY_TERMS})"
    res = svc.users().messages().list(userId="me", q=q, maxResults=max_messages).execute()
    msgs = res.get("messages", [])
    candidates = []
    for m in msgs:
        full = svc.users().messages().get(userId="me", id=m["id"], format="full").execute()
        subject = _header(full, "Subject")
        sender = _header(full, "From")
        date = _header(full, "Date")
        atts = []
        _walk_parts(full.get("payload", {}), atts)
        for a in atts:
            mt = (a["mime_type"] or "").lower()
            fn = (a["filename"] or "").lower()
            if not (mt.startswith("image/") or "pdf" in mt or fn.endswith((".pdf", ".png", ".jpg", ".jpeg"))):
                continue
            candidates.append({
                "message_id": m["id"],
                "attachment_id": a["attachment_id"],
                "filename": a["filename"],
                "mime_type": a["mime_type"],
                "size": a["size"],
                "subject": subject[:140],
                "sender": sender[:140],
                "date": date,
                "guessed_category": _guess_category(subject, a["filename"]),
            })
        if len(candidates) >= 80:
            break
    return candidates


@router.post("/gmail/scan")
async def gmail_scan(body: ScanBody, user: dict = Depends(get_current_user)):
    creds = await _get_creds(user["user_id"])
    try:
        candidates = await run_in_threadpool(_do_scan, creds, body.scope, min(body.max_messages, 100))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Gmail scan failed: {str(e)[:120]}")
    # Flag already-imported attachments
    keys = [f"{c['message_id']}:{c['attachment_id']}" for c in candidates]
    existing = await db.documents.distinct(
        "gmail_source", {"user_id": user["user_id"], "gmail_source": {"$in": keys}}
    )
    exset = set(existing)
    for c in candidates:
        c["already_imported"] = f"{c['message_id']}:{c['attachment_id']}" in exset
    return {"count": len(candidates), "candidates": candidates}


class ImportItem(BaseModel):
    message_id: str
    attachment_id: str
    filename: str
    mime_type: str = "application/octet-stream"


class ImportBody(BaseModel):
    items: List[ImportItem]


def _fetch_attachment(creds, message_id, attachment_id):
    svc = _service(creds)
    att = svc.users().messages().attachments().get(userId="me", messageId=message_id, id=attachment_id).execute()
    data = att.get("data", "")
    return base64.urlsafe_b64decode(data.encode("utf-8"))


@router.post("/gmail/import")
async def gmail_import(body: ImportBody, user: dict = Depends(get_current_user)):
    if not body.items:
        raise HTTPException(status_code=400, detail="No items selected")
    creds = await _get_creds(user["user_id"])
    imported, skipped = [], 0
    for item in body.items:
        source_key = f"{item.message_id}:{item.attachment_id}"
        dup = await db.documents.find_one(
            {"user_id": user["user_id"], "gmail_source": source_key, "is_deleted": False}, {"_id": 0, "document_id": 1}
        )
        if dup:
            skipped += 1
            continue
        try:
            data = await run_in_threadpool(_fetch_attachment, creds, item.message_id, item.attachment_id)
        except Exception:
            skipped += 1
            continue
        ext = item.filename.split(".")[-1].lower() if "." in item.filename else "bin"
        path = f"{APP_NAME}/uploads/{user['user_id']}/{uuid.uuid4().hex}.{ext}"
        content_type = item.mime_type or storage.MIME_TYPES.get(ext, "application/octet-stream")
        result = await run_in_threadpool(storage.put_object, path, data, content_type)

        detected, metadata = await classify_document(data, item.filename, content_type)
        category = detected if detected else "other"

        doc = {
            "document_id": str(uuid.uuid4()),
            "user_id": user["user_id"],
            "storage_path": result["path"],
            "original_filename": item.filename,
            "content_type": content_type,
            "size": result.get("size", len(data)),
            "category": category,
            "auto_classified": bool(detected or metadata),
            "metadata": metadata,
            "note": "Imported from Gmail",
            "gmail_source": source_key,
            "is_deleted": False,
            "created_at": now_iso(),
        }
        await db.documents.insert_one(dict(doc))
        doc.pop("storage_path", None)
        imported.append({"document_id": doc["document_id"], "filename": item.filename, "category": category})
    return {"imported": imported, "imported_count": len(imported), "skipped": skipped}
