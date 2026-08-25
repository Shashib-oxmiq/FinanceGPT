import io
import os
import re
import json
import uuid
import random
import secrets
import zipfile
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from deps import db, get_current_user, DOC_CATEGORIES, PROFILE_SCHEMA, profile_completeness
import storage
import ai

router = APIRouter(prefix="/api")


def now():
    return datetime.now(timezone.utc)


def now_iso():
    return now().isoformat()


# ---------------- Profile auto-fill from documents ----------------
@router.post("/profile/from-documents")
async def profile_from_documents(user: dict = Depends(get_current_user)):
    cats = ["identity", "financial", "tax", "employment", "immigration", "insurance"]
    docs = await db.documents.find(
        {"user_id": user["user_id"], "is_deleted": False, "category": {"$in": cats}}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    if not docs:
        raise HTTPException(status_code=404, detail="Upload identity/financial documents first, then try again")

    file_contents, temp_paths = [], []
    for d in docs[:4]:
        try:
            data, ctype = await run_in_threadpool(storage.get_object, d["storage_path"])
            fc, tmp = ai.make_file_content(d.get("content_type") or ctype, data, d["original_filename"])
            if fc:
                file_contents.append(fc)
                if tmp:
                    temp_paths.append(tmp)
        except Exception:
            continue

    system = (
        "Extract the user's personal profile from the attached documents. Return ONLY JSON matching "
        "this schema of sections->fields: " + json.dumps(PROFILE_SCHEMA) +
        ". Only include fields you can confidently read. Values must be strings. Omit unknowns."
    )
    try:
        chat = ai.make_chat(f"pfd_{uuid.uuid4().hex}", system, "gemini")
        raw = await ai.complete_with_files(chat, "Extract the profile JSON now.", file_contents or None)
        extracted = ai.parse_json(raw) or {}
    finally:
        for p in temp_paths:
            try:
                os.remove(p)
            except Exception:
                pass

    current = user.get("profile", {}) or {}
    filled = 0
    for section, fields in extracted.items():
        if section not in PROFILE_SCHEMA or not isinstance(fields, dict):
            continue
        current.setdefault(section, {})
        for k, v in fields.items():
            if k in PROFILE_SCHEMA[section] and v and not current[section].get(k):
                current[section][k] = v
                filled += 1
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"profile": current}})
    return {"profile": current, "extracted": extracted, "filled": filled, "completeness": profile_completeness(current)}


# ---------------- Loan document checklist ----------------
class LoanBody(BaseModel):
    bank: str
    loan_type: str
    employment_type: Optional[str] = "Salaried"
    purchase_type: Optional[str] = ""


_LOAN_STOP = {
    "with", "and", "for", "the", "any", "all", "last", "recent", "months", "month", "years",
    "year", "copy", "copies", "proof", "document", "documents", "form", "card", "letter",
    "statement", "statements", "along", "computation", "size", "affixed", "signed", "case",
    "least", "assessment", "individual", "entity", "business", "favouring", "processing",
}


@router.post("/loans/checklist")
async def loan_checklist(body: LoanBody, user: dict = Depends(get_current_user)):
    system = (
        "You are a loan documentation expert for banks in India and worldwide. For the given bank, "
        "loan type, applicant employment type and purchase type, produce a COMPREHENSIVE, practical "
        "checklist of every document typically required — grouped into sections. Return ONLY JSON: "
        "{\"summary\": str, \"items\": [{\"section\": one of [\"Identity & KYC\", \"Income Documents\", "
        "\"Property Documents\", \"Other Requirements\"], \"name\": str, "
        "\"category\": <one of: " + ", ".join(DOC_CATEGORIES) + ">, \"required\": bool}]}. "
        "Tailor income documents to the employment type (Salaried vs Self-Employed Professional vs "
        "Self-Employed Non-Professional) and property documents to the purchase type (new home, "
        "resale, plot/construction). Be specific like a real bank checklist (e.g. 'Last 3 months' "
        "salary slips', 'Form-16 and IT returns', 'PAN Card', 'Passport / Voter ID / Driving licence "
        "as OVD', 'Title deeds and chain of property documents', 'Passport-size photographs', "
        "'Cheque for processing fee'). Include 12-25 items."
    )
    prompt = (
        f"BANK: {body.bank}\nLOAN TYPE: {body.loan_type}\n"
        f"EMPLOYMENT TYPE: {body.employment_type}\nPURCHASE TYPE: {body.purchase_type or 'not specified'}\n\n"
        "Return the JSON now."
    )
    chat = ai.make_chat(f"loan_{uuid.uuid4().hex}", system, "claude")
    raw = await ai.complete(chat, prompt)
    parsed = ai.parse_json(raw) or {"summary": raw[:400], "items": []}

    docs = await db.documents.find(
        {"user_id": user["user_id"], "is_deleted": False}, {"_id": 0, "storage_path": 0}
    ).to_list(500)

    def doc_haystack(d):
        m = d.get("metadata", {}) or {}
        parts = [d.get("original_filename", ""), d.get("category", "")]
        for k in ("title", "doc_type", "issuer", "summary"):
            if m.get(k):
                parts.append(str(m[k]))
        ids = m.get("identifiers")
        if isinstance(ids, list):
            parts.extend(str(x) for x in ids)
        return " ".join(parts).lower()

    items = []
    for it in parsed.get("items", []):
        cat = it.get("category") if it.get("category") in DOC_CATEGORIES else None
        name = it.get("name", "")
        name_tokens = [t for t in re.findall(r"[a-z0-9]{4,}", name.lower()) if t not in _LOAN_STOP]
        matched = []
        for d in docs:
            hay = doc_haystack(d)
            overlap = sum(1 for t in set(name_tokens) if re.search(rf"\b{re.escape(t)}\b", hay))
            # Require 2+ token overlap, or a single distinctive token backed by matching category.
            if overlap >= 2 or (overlap == 1 and cat and d.get("category") == cat):
                matched.append({"document_id": d["document_id"], "filename": d["original_filename"]})
        items.append({
            "section": it.get("section") or "Other Requirements",
            "name": name, "category": cat or "other", "required": bool(it.get("required", True)),
            "status": "have" if matched else "missing", "matched": matched[:5],
        })
    return {
        "bank": body.bank, "loan_type": body.loan_type,
        "employment_type": body.employment_type, "purchase_type": body.purchase_type,
        "summary": parsed.get("summary", ""), "items": items,
    }


# ---------------- Secure shares (password + expiry) ----------------
class ShareBody(BaseModel):
    name: str
    document_ids: List[str]
    expiry_days: Optional[int] = 15


def public_share(s: dict) -> dict:
    return {
        "share_id": s["share_id"], "token": s["token"], "password": s["password"],
        "name": s["name"], "count": len(s.get("document_ids", [])),
        "expires_at": s["expires_at"], "revoked": s.get("revoked", False),
        "path": f"/share/{s['token']}", "created_at": s["created_at"],
    }


@router.post("/shares")
async def create_share(body: ShareBody, user: dict = Depends(get_current_user)):
    if not body.document_ids:
        raise HTTPException(status_code=400, detail="Select at least one document to share")
    days = body.expiry_days if body.expiry_days and body.expiry_days > 0 else 15
    share = {
        "share_id": str(uuid.uuid4()),
        "user_id": user["user_id"],
        "token": secrets.token_urlsafe(9),
        "password": f"{random.randint(0, 99999999):08d}",
        "name": body.name or "Shared documents",
        "document_ids": body.document_ids,
        "expires_at": (now() + timedelta(days=days)).isoformat(),
        "revoked": False,
        "created_at": now_iso(),
    }
    await db.shares.insert_one(dict(share))
    return public_share(share)


@router.get("/shares")
async def list_shares(user: dict = Depends(get_current_user)):
    items = await db.shares.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [public_share(s) for s in items]


@router.delete("/shares/{share_id}")
async def revoke_share(share_id: str, user: dict = Depends(get_current_user)):
    res = await db.shares.update_one(
        {"share_id": share_id, "user_id": user["user_id"]}, {"$set": {"revoked": True}}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Share not found")
    return {"ok": True}


async def _validate_share(token: str, password: str):
    s = await db.shares.find_one({"token": token}, {"_id": 0})
    if not s or s.get("revoked"):
        raise HTTPException(status_code=404, detail="This share link is invalid or was revoked")
    exp = datetime.fromisoformat(s["expires_at"])
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < now():
        raise HTTPException(status_code=410, detail="This share link has expired")
    if (password or "") != s["password"]:
        raise HTTPException(status_code=403, detail="Incorrect password")
    return s


class AccessBody(BaseModel):
    password: str


@router.post("/shares/{token}/access")
async def access_share(token: str, body: AccessBody):
    s = await _validate_share(token, body.password)
    docs = await db.documents.find(
        {"document_id": {"$in": s["document_ids"]}, "user_id": s["user_id"], "is_deleted": False},
        {"_id": 0, "storage_path": 0},
    ).to_list(500)
    owner = await db.users.find_one({"user_id": s["user_id"]}, {"_id": 0, "name": 1})
    return {
        "name": s["name"], "owner": (owner or {}).get("name", "A user"),
        "expires_at": s["expires_at"],
        "documents": [
            {"document_id": d["document_id"], "filename": d["original_filename"],
             "category": d.get("category"), "content_type": d.get("content_type"), "size": d.get("size")}
            for d in docs
        ],
    }


@router.get("/shares/{token}/file/{document_id}")
async def share_file(token: str, document_id: str, password: str = Query(...)):
    s = await _validate_share(token, password)
    if document_id not in s["document_ids"]:
        raise HTTPException(status_code=404, detail="Not in this share")
    rec = await db.documents.find_one(
        {"document_id": document_id, "user_id": s["user_id"], "is_deleted": False}, {"_id": 0}
    )
    if not rec:
        raise HTTPException(status_code=404, detail="Document not found")
    data, ctype = await run_in_threadpool(storage.get_object, rec["storage_path"])
    return Response(
        content=data, media_type=rec.get("content_type", ctype),
        headers={"Content-Disposition": f'inline; filename="{rec["original_filename"]}"'},
    )


@router.get("/shares/{token}/zip")
async def share_zip(token: str, password: str = Query(...)):
    s = await _validate_share(token, password)
    docs = await db.documents.find(
        {"document_id": {"$in": s["document_ids"]}, "user_id": s["user_id"], "is_deleted": False}, {"_id": 0}
    ).to_list(500)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        seen = {}
        for d in docs:
            try:
                data, _ = await run_in_threadpool(storage.get_object, d["storage_path"])
            except Exception:
                continue
            name = d["original_filename"]
            if name in seen:
                seen[name] += 1
                name = f"{seen[name]}_{name}"
            else:
                seen[name] = 0
            zf.writestr(f"{d.get('category','other')}/{name}", data)
    buf.seek(0)
    safe = "".join(c for c in s["name"] if c.isalnum() or c in (" ", "-", "_")).strip() or "documents"
    return Response(
        content=buf.getvalue(), media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{safe}.zip"'},
    )
