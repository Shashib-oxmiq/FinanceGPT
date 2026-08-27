"""
Gmail integration via IMAP + App Password.

Replaces the Google OAuth flow — no Cloud Console setup needed.
Users provide their Gmail address + a 16-character App Password.
Works with Gmail, Google Workspace, and any IMAP-capable provider.

Endpoints:
  POST /api/gmail/connect     — connect with email + app password
  GET  /api/gmail/status      — check connection status
  POST /api/gmail/disconnect   — remove stored credentials
  POST /api/gmail/scan         — scan inbox for financial attachments
  POST /api/gmail/import       — import selected attachments into the vault
"""

import os
import uuid
import base64
import imaplib
import email
import hashlib
from email import policy
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel
from typing import List, Optional

from deps import db, get_current_user, APP_NAME
import storage
from routes import classify_document, now_iso

router = APIRouter(prefix="/api")

# ── Provider IMAP settings ───────────────────────────────────────────────────
IMAP_PROVIDERS = {
    "gmail": {"host": "imap.gmail.com", "port": 993},
    "google": {"host": "imap.gmail.com", "port": 993},
    "outlook": {"host": "outlook.office365.com", "port": 993},
    "hotmail": {"host": "outlook.office365.com", "port": 993},
    "yahoo": {"host": "imap.mail.yahoo.com", "port": 993},
    "icloud": {"host": "imap.mail.me.com", "port": 993},
}

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


def _guess_category(subject: str, filename: str) -> str:
    text = f"{subject} {filename}".lower()
    for cat, kws in CATEGORY_KEYWORDS.items():
        if any(k in text for k in kws):
            return cat
    return ""


def _get_provider(email_addr: str) -> dict:
    """Determine IMAP host/port from email domain."""
    domain = (email_addr.split("@")[-1] or "").lower()
    if domain in IMAP_PROVIDERS:
        return IMAP_PROVIDERS[domain]
    if "gmail" in domain or "googlemail" in domain:
        return IMAP_PROVIDERS["gmail"]
    if "outlook" in domain or "hotmail" in domain or "live" in domain or "msn" in domain:
        return IMAP_PROVIDERS["outlook"]
    if "yahoo" in domain:
        return IMAP_PROVIDERS["yahoo"]
    if "icloud" in domain or "me.com" in domain or "mac.com" in domain:
        return IMAP_PROVIDERS["icloud"]
    # Default: try Gmail-style
    return {"host": f"imap.{domain}", "port": 993}


def _test_imap_login(email_addr: str, password: str) -> bool:
    """Try to log into IMAP — returns True on success, raises on failure."""
    provider = _get_provider(email_addr)
    conn = imaplib.IMAP4_SSL(provider["host"], provider["port"])
    conn.login(email_addr, password)
    conn.logout()
    return True


# ── Connect / Disconnect / Status ────────────────────────────────────────────

class ConnectBody(BaseModel):
    email: str
    password: str  # Gmail App Password (16 chars, no spaces)


@router.post("/gmail/connect")
async def gmail_connect(body: ConnectBody, user: dict = Depends(get_current_user)):
    email_addr = body.email.strip()
    password = body.password.strip().replace(" ", "")
    if not email_addr or not password:
        raise HTTPException(status_code=400, detail="Email and password are required")
    try:
        await run_in_threadpool(_test_imap_login, email_addr, password)
    except imaplib.IMAP4.error:
        raise HTTPException(status_code=401, detail="Login failed — check your email and App Password")
    except Exception as e:
        msg = str(e)
        if "authentication" in msg.lower() or "auth" in msg.lower() or "credentials" in msg.lower():
            raise HTTPException(status_code=401, detail="Authentication failed — check your App Password")
        raise HTTPException(status_code=502, detail=f"Could not connect: {msg[:120]}")
    await db.gmail_tokens.update_one(
        {"user_id": user["user_id"]},
        {"$set": {
            "user_id": user["user_id"],
            "email": email_addr,
            "password": password,
            "provider": _get_provider(email_addr)["host"],
            "updated_at": now_iso(),
        }},
        upsert=True,
    )
    return {"connected": True, "email": email_addr}


@router.get("/gmail/status")
async def gmail_status(user: dict = Depends(get_current_user)):
    tok = await db.gmail_tokens.find_one({"user_id": user["user_id"]}, {"_id": 0, "password": 0})
    return {"connected": bool(tok), "email": (tok or {}).get("email", "")}


@router.post("/gmail/disconnect")
async def gmail_disconnect(user: dict = Depends(get_current_user)):
    await db.gmail_tokens.delete_one({"user_id": user["user_id"]})
    return {"ok": True}


# ── Scan & Import ────────────────────────────────────────────────────────────

class ScanBody(BaseModel):
    scope: str = "recent"  # "recent" = last 12 months, "older" = 1-10 years ago
    max_messages: int = 60


def _walk_parts(msg, out):
    """Extract attachment info from an email message."""
    for part in msg.walk():
        if part.get_content_disposition() == "attachment":
            filename = part.get_filename()
            if not filename:
                continue
            payload = part.get_payload(decode=True)
            size = len(payload) if payload else 0
            out.append({
                "filename": filename,
                "mime_type": part.get_content_type() or "application/octet-stream",
                "payload": payload,
                "size": size,
            })


def _do_scan(email_addr: str, password: str, scope: str, max_messages: int):
    """Scan inbox for financial attachments via IMAP."""
    provider = _get_provider(email_addr)
    conn = imaplib.IMAP4_SSL(provider["host"], provider["port"])
    conn.login(email_addr, password)
    conn.select("INBOX", readonly=True)

    # Build date range for search
    now = datetime.now(timezone.utc)
    if scope == "older":
        since_date = (now - timedelta(days=365 * 10)).strftime("%d-%b-%Y")
        before_date = (now - timedelta(days=365)).strftime("%d-%b-%Y")
        search_criteria = f'(SINCE {since_date} BEFORE {before_date})'
    else:
        since_date = (now - timedelta(days=365)).strftime("%d-%b-%Y")
        search_criteria = f'(SINCE {since_date})'

    # Search for messages with attachments
    status, msg_nums = conn.search(None, search_criteria)
    if status != "OK" or not msg_nums[0]:
        conn.logout()
        return []

    msg_ids = msg_nums[0].split()
    # Limit to most recent N messages
    msg_ids = msg_ids[-max_messages:] if len(msg_ids) > max_messages else msg_ids

    candidates = []
    for mid in msg_ids:
        status, msg_data = conn.fetch(mid, "(RFC822)")
        if status != "OK":
            continue
        raw = msg_data[0][1]
        msg = email.message_from_bytes(raw, policy=policy.default)

        subject = str(msg.get("Subject", ""))[:140]
        sender = str(msg.get("From", ""))[:140]
        date = str(msg.get("Date", ""))

        atts = []
        _walk_parts(msg, atts)

        for a in atts:
            mt = (a["mime_type"] or "").lower()
            fn = (a["filename"] or "").lower()
            # Only include PDFs and images (same filter as before)
            if not (mt.startswith("image/") or "pdf" in mt or fn.endswith((".pdf", ".png", ".jpg", ".jpeg"))):
                continue
            # Keyword filter — only keep financial/important attachments
            text_for_search = f"{subject} {a['filename']}".lower()
            finance_keywords = [
                "statement", "invoice", "policy", "insurance", "premium", "tax", "receipt",
                "passport", "aadhaar", "pan", "mortgage", "loan", "salary", "payslip",
                "mutual", "portfolio", "account", "credit card",
            ]
            if not any(kw in text_for_search for kw in finance_keywords):
                continue

            candidates.append({
                "message_id": mid.decode() if isinstance(mid, bytes) else str(mid),
                "attachment_id": str(uuid.uuid4().hex[:12]),
                "filename": a["filename"],
                "mime_type": a["mime_type"],
                "size": a["size"],
                "subject": subject,
                "sender": sender,
                "date": date,
                "guessed_category": _guess_category(subject, a["filename"]),
            })
        if len(candidates) >= 80:
            break

    conn.logout()
    return candidates


@router.post("/gmail/scan")
async def gmail_scan(body: ScanBody, user: dict = Depends(get_current_user)):
    tok = await db.gmail_tokens.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not tok:
        raise HTTPException(status_code=401, detail="Gmail not connected")
    try:
        candidates = await run_in_threadpool(
            _do_scan, tok["email"], tok["password"], body.scope, min(body.max_messages, 100)
        )
    except imaplib.IMAP4.error as e:
        raise HTTPException(status_code=401, detail=f"IMAP error: {str(e)[:120]}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Scan failed: {str(e)[:120]}")

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


def _fetch_attachment_by_msgid(email_addr: str, password: str, message_id: str, filename: str):
    """Re-fetch a specific message and extract the attachment by filename."""
    provider = _get_provider(email_addr)
    conn = imaplib.IMAP4_SSL(provider["host"], provider["port"])
    conn.login(email_addr, password)
    conn.select("INBOX", readonly=True)
    status, msg_data = conn.fetch(message_id.encode() if isinstance(message_id, str) else message_id, "(RFC822)")
    conn.logout()
    if status != "OK" or not msg_data or not msg_data[0]:
        raise Exception(f"Could not fetch message {message_id}")
    raw = msg_data[0][1]
    msg = email.message_from_bytes(raw, policy=policy.default)
    for part in msg.walk():
        if part.get_content_disposition() == "attachment":
            fn = part.get_filename()
            if fn == filename:
                payload = part.get_payload(decode=True)
                if payload:
                    return payload
    raise Exception(f"Attachment '{filename}' not found in message {message_id}")


@router.post("/gmail/import")
async def gmail_import(body: ImportBody, user: dict = Depends(get_current_user)):
    if not body.items:
        raise HTTPException(status_code=400, detail="No items selected")
    tok = await db.gmail_tokens.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not tok:
        raise HTTPException(status_code=401, detail="Gmail not connected")
    imported, skipped = [], 0
    for item in body.items:
        source_key = f"{item.message_id}:{item.attachment_id}"
        dup = await db.documents.find_one(
            {"user_id": user["user_id"], "gmail_source": source_key, "is_deleted": False},
            {"_id": 0, "document_id": 1}
        )
        if dup:
            skipped += 1
            continue
        try:
            data = await run_in_threadpool(
                _fetch_attachment_by_msgid, tok["email"], tok["password"], item.message_id, item.filename
            )
        except Exception:
            skipped += 1
            continue
        ext = item.filename.split(".")[-1].lower() if "." in item.filename else "bin"
        path = f"{APP_NAME}/uploads/{user['user_id']}/{uuid.uuid4().hex}.{ext}"
        content_type = item.mime_type or storage.MIME_TYPES.get(ext, "application/octet-stream")

        # ── Content-hash duplicate check ──
        chash = hashlib.sha256(data).hexdigest()
        existing_dup = await db.documents.find_one(
            {"user_id": user["user_id"], "is_deleted": False, "content_hash": chash},
            {"_id": 0, "document_id": 1, "original_filename": 1}
        )
        if existing_dup:
            skipped += 1
            continue

        result = await run_in_threadpool(storage.put_object, path, data, content_type)

        detected, metadata = await classify_document(data, item.filename, content_type)
        category = detected if detected else "other"

        doc = {
            "document_id": str(uuid.uuid4()),
            "user_id": user["user_id"],
            "storage_path": path,
            "original_filename": item.filename,
            "content_type": content_type,
            "size": len(data),
            "content_hash": chash,
            "category": category,
            "auto_classified": bool(detected),
            "metadata": metadata,
            "gmail_source": source_key,
            "is_deleted": False,
            "created_at": now_iso(),
        }
        await db.documents.insert_one(dict(doc))
        doc.pop("_id", None)
        imported.append(doc)
    return {"imported": len(imported), "skipped": skipped, "duplicates": skipped}