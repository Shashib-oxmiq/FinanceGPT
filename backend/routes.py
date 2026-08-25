import io
import os
import re
import json
import uuid
import zipfile
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Header, Query, Response
from fastapi.responses import StreamingResponse
from starlette.concurrency import run_in_threadpool
from emergentintegrations.llm.chat import UserMessage
from pydantic import BaseModel
from typing import Optional, List

from deps import db, get_current_user, PROFILE_SCHEMA, DOC_CATEGORIES, APP_NAME, profile_completeness
import storage
import ai

router = APIRouter(prefix="/api")


def now_iso():
    return datetime.now(timezone.utc).isoformat()


async def user_from_token(authorization: Optional[str], auth_q: Optional[str]):
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
    elif auth_q:
        token = auth_q
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    expires_at = session["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    return session["user_id"]


# ---------------- Profile ----------------
class ProfileBody(BaseModel):
    profile: dict


@router.get("/profile")
async def get_profile(user: dict = Depends(get_current_user)):
    profile = user.get("profile", {}) or {}
    return {"profile": profile, "schema": PROFILE_SCHEMA, "completeness": profile_completeness(profile)}


@router.put("/profile")
async def update_profile(body: ProfileBody, user: dict = Depends(get_current_user)):
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"profile": body.profile}})
    return {"profile": body.profile, "completeness": profile_completeness(body.profile)}


class ExtractBody(BaseModel):
    conversation_id: str


@router.post("/profile/extract")
async def extract_profile(body: ExtractBody, user: dict = Depends(get_current_user)):
    msgs = await db.messages.find(
        {"conversation_id": body.conversation_id, "user_id": user["user_id"]}, {"_id": 0}
    ).sort("created_at", 1).to_list(500)
    if not msgs:
        raise HTTPException(status_code=404, detail="No conversation messages found")
    transcript = "\n".join(f"{m['role'].upper()}: {m['content']}" for m in msgs)
    schema_txt = json.dumps(PROFILE_SCHEMA)
    system = (
        "You extract structured personal profile data from a conversation. "
        "Return ONLY valid JSON matching this schema of sections->fields: " + schema_txt +
        ". Only include fields you can confidently determine from the transcript. "
        "Omit unknown fields. Values must be strings."
    )
    chat = ai.make_chat(f"extract_{uuid.uuid4().hex}", system, ai.TASK_MODEL["extract"])
    raw = await ai.complete(chat, "Transcript:\n" + transcript + "\n\nReturn the JSON now.")
    extracted = ai.parse_json(raw) or {}

    current = user.get("profile", {}) or {}
    for section, fields in extracted.items():
        if section not in PROFILE_SCHEMA or not isinstance(fields, dict):
            continue
        current.setdefault(section, {})
        for k, v in fields.items():
            if k in PROFILE_SCHEMA[section] and v not in (None, ""):
                current[section][k] = v
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"profile": current}})
    return {"profile": current, "completeness": profile_completeness(current), "extracted": extracted}


# ---------------- Chat ----------------
class ConvBody(BaseModel):
    title: Optional[str] = "New conversation"


@router.post("/chat/conversations")
async def create_conversation(body: ConvBody, user: dict = Depends(get_current_user)):
    conv = {
        "conversation_id": str(uuid.uuid4()),
        "user_id": user["user_id"],
        "title": body.title or "New conversation",
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.conversations.insert_one(dict(conv))
    return conv


@router.get("/chat/conversations")
async def list_conversations(user: dict = Depends(get_current_user)):
    convs = await db.conversations.find({"user_id": user["user_id"]}, {"_id": 0}).sort("updated_at", -1).to_list(200)
    return convs


@router.get("/chat/conversations/{conversation_id}/messages")
async def get_messages(conversation_id: str, user: dict = Depends(get_current_user)):
    msgs = await db.messages.find(
        {"conversation_id": conversation_id, "user_id": user["user_id"]}, {"_id": 0}
    ).sort("created_at", 1).to_list(1000)
    return msgs


@router.delete("/chat/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str, user: dict = Depends(get_current_user)):
    await db.conversations.delete_one({"conversation_id": conversation_id, "user_id": user["user_id"]})
    await db.messages.delete_many({"conversation_id": conversation_id, "user_id": user["user_id"]})
    return {"ok": True}


def build_system_prompt(user: dict, history: list) -> str:
    profile = user.get("profile", {}) or {}
    base = (
        "You are Everkin — the personal AI assistant that matters most in someone's life. "
        "You help with EVERYTHING important: not just money, but health, insurance (life and "
        "health), property, vehicles, education, legal/estate matters, employment, immigration and "
        "family. You keep the user's important documents organized, answer questions about ROI and "
        "investments, help with credit and expense management, review bank and credit-card statements, "
        "explain insurance corner cases (nominee vs beneficiary, riders, grace periods, lapsed/paid-up "
        "policies, claim documentation, term vs whole life, ULIPs, critical-illness waiting periods, "
        "and how nominees actually file claims), and guide them through major life steps (buying a "
        "home, marriage, a new baby, a new job, medical events, retirement, and estate planning). "
        "You also help plan a clean handover to a spouse or next-of-kin so benefits and assets pass "
        "on correctly if they are ever unavailable. "
        "Goals: (1) warm, trustworthy, concise conversation, (2) proactively ask for missing profile, "
        "insurance and next-of-kin details one topic at a time, (3) give practical, jurisdiction-aware "
        "guidance while reminding them to confirm legal/tax/medical decisions with a licensed "
        "professional. Never invent data. No emojis.\n\n"
        f"Known profile data (JSON): {json.dumps(profile)}\n\n"
    )
    if history:
        convo = "\n".join(f"{m['role']}: {m['content']}" for m in history[-12:])
        base += "Conversation so far:\n" + convo
    return base


class ChatAttachment(BaseModel):
    attachment_id: str
    filename: str
    content_type: Optional[str] = ""


class MessageBody(BaseModel):
    content: str
    model: Optional[str] = "claude"
    attachments: Optional[List[ChatAttachment]] = []


@router.post("/chat/upload")
async def chat_upload(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else "bin"
    path = f"{APP_NAME}/chat/{user['user_id']}/{uuid.uuid4().hex}.{ext}"
    data = await file.read()
    content_type = file.content_type or storage.MIME_TYPES.get(ext, "application/octet-stream")
    await run_in_threadpool(storage.put_object, path, data, content_type)
    att = {
        "attachment_id": str(uuid.uuid4()),
        "user_id": user["user_id"],
        "storage_path": path,
        "filename": file.filename,
        "content_type": content_type,
        "size": len(data),
        "created_at": now_iso(),
    }
    await db.chat_files.insert_one(dict(att))

    # Files uploaded through chat are also saved to the vault (auto-classified).
    detected, metadata = await classify_document(data, file.filename, content_type)
    doc = {
        "document_id": str(uuid.uuid4()),
        "user_id": user["user_id"],
        "storage_path": path,
        "original_filename": file.filename,
        "content_type": content_type,
        "size": len(data),
        "category": detected or "other",
        "auto_classified": bool(detected or metadata),
        "metadata": metadata,
        "note": "Uploaded via chat",
        "is_deleted": False,
        "created_at": now_iso(),
    }
    await db.documents.insert_one(dict(doc))

    return {"attachment_id": att["attachment_id"], "document_id": doc["document_id"], "filename": att["filename"], "content_type": content_type, "size": att["size"]}


MAX_DOC_BYTES = 12 * 1024 * 1024

_STOPWORDS = {
    "the", "and", "for", "are", "was", "were", "you", "your", "with", "have", "has", "had",
    "about", "what", "when", "where", "which", "how", "many", "much", "them", "they", "this",
    "that", "from", "into", "can", "could", "would", "should", "please", "tell", "give", "show",
    "list", "there", "here", "some", "any", "all", "one", "two", "than", "then", "over", "under",
    "more", "less", "get", "got", "does", "did", "will", "just", "like", "know", "want", "need",
}

# Only ground answers in documents when the query clearly refers to the user's documents/records.
_DOC_INTENT = {
    "document", "documents", "doc", "docs", "file", "files", "upload", "uploaded",
    "passport", "visa", "visas", "immigration", "citizenship",
    "statement", "statements", "expense", "expenses", "spend", "spending", "transaction", "transactions",
    "bank", "card", "credit", "salary", "slip", "payslip", "invoice", "receipt",
    "policy", "policies", "insurance", "nominee", "premium",
    "tax", "return", "returns", "identity", "aadhaar", "aadhar", "pan", "license", "licence",
    "loan", "mortgage", "property", "vehicle", "warranty", "medical", "prescription", "report",
    "certificate", "degree", "transcript", "employment", "offer", "contract", "travel", "ticket",
    "purchase", "bill", "utility", "address", "proof",
}


async def select_relevant_docs(user_id: str, query: str, limit: int = 3):
    """Ground answers in the user's vault ONLY when the query clearly references their
    documents/records. Uses whole-word matching and skips generic questions for privacy."""
    words = re.findall(r"[a-z0-9]{3,}", (query or "").lower())
    tokens = {w for w in words if w not in _STOPWORDS}
    if not tokens or not (tokens & _DOC_INTENT):
        return []  # No document intent -> never attach private files.

    synonyms = {
        "visa": ["passport", "immigration", "identity"], "visas": ["passport", "immigration"],
        "passport": ["passport", "identity", "immigration"],
        "expense": ["bank_statement", "credit_card_statement", "statement"],
        "expenses": ["bank_statement", "credit_card_statement", "statement"],
        "spend": ["bank_statement", "credit_card_statement"], "spending": ["bank_statement", "credit_card_statement"],
        "statement": ["bank_statement", "credit_card_statement"], "card": ["credit_card_statement"],
        "tax": ["tax"], "insurance": ["insurance"], "policy": ["insurance"], "premium": ["insurance"],
        "vehicle": ["vehicle"], "car": ["vehicle"], "medical": ["medical"], "health": ["medical", "insurance"],
        "salary": ["employment", "bank_statement"], "slip": ["employment"], "payslip": ["employment"],
        "travel": ["travel"], "ticket": ["travel"], "purchase": ["purchase"],
    }
    expanded = set(tokens)
    for t in list(tokens):
        for s in synonyms.get(t, []):
            expanded.add(s)

    docs = await db.documents.find(
        {"user_id": user_id, "is_deleted": False}, {"_id": 0}
    ).sort("created_at", -1).to_list(300)
    if not docs:
        return []

    scored = []
    for d in docs:
        if d.get("size", 0) > MAX_DOC_BYTES:
            continue
        hay = f"{d.get('original_filename','')} {d.get('category','')} {json.dumps(d.get('metadata',{}))}".lower()
        score = sum(1 for t in expanded if re.search(rf"\b{re.escape(t)}\b", hay))
        if score > 0:
            scored.append((score, d))
    scored.sort(key=lambda x: -x[0])
    return [d for _, d in scored[:limit]]


@router.post("/chat/conversations/{conversation_id}/message")
async def send_message(conversation_id: str, body: MessageBody, user: dict = Depends(get_current_user)):
    conv = await db.conversations.find_one(
        {"conversation_id": conversation_id, "user_id": user["user_id"]}, {"_id": 0}
    )
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    history = await db.messages.find(
        {"conversation_id": conversation_id, "user_id": user["user_id"]}, {"_id": 0}
    ).sort("created_at", 1).to_list(1000)

    attachments = [a.model_dump() for a in (body.attachments or [])]

    # Build multimodal file contents from stored attachments.
    file_contents = []
    temp_paths = []
    for a in attachments:
        rec = await db.chat_files.find_one(
            {"attachment_id": a["attachment_id"], "user_id": user["user_id"]}, {"_id": 0}
        )
        if not rec:
            continue
        try:
            data, ctype = await run_in_threadpool(storage.get_object, rec["storage_path"])
            fc, tmp = ai.make_file_content(rec.get("content_type") or ctype, data, rec["filename"])
            if fc:
                file_contents.append(fc)
                if tmp:
                    temp_paths.append(tmp)
        except Exception:
            continue

    # Ground the answer in the user's vault: pull in relevant documents as readable context.
    sources_meta = []
    for d in await select_relevant_docs(user["user_id"], body.content):
        try:
            data, ctype = await run_in_threadpool(storage.get_object, d["storage_path"])
            fc, tmp = ai.make_file_content(d.get("content_type") or ctype, data, d["original_filename"])
            if fc:
                file_contents.append(fc)
                if tmp:
                    temp_paths.append(tmp)
                sources_meta.append({
                    "document_id": d["document_id"],
                    "filename": d["original_filename"],
                    "category": d.get("category"),
                    "content_type": d.get("content_type"),
                })
        except Exception:
            continue

    await db.messages.insert_one({
        "message_id": str(uuid.uuid4()),
        "conversation_id": conversation_id,
        "user_id": user["user_id"],
        "role": "user",
        "content": body.content,
        "attachments": attachments,
        "created_at": now_iso(),
    })

    model_key = body.model if body.model in ai.MODELS else "claude"
    # File attachments/vault docs are only supported by Gemini; route multimodal messages accordingly.
    if file_contents:
        model_key = "gemini"
    system = build_system_prompt(user, history)
    if sources_meta:
        doc_list = "\n".join(f"- [doc:{s['document_id']}] {s['filename']} ({s['category']})" for s in sources_meta)
        system += (
            "\n\nThe user's own documents are attached and listed below. When you use information "
            "from one, CITE it inline using its exact marker [doc:ID]. When the user asks to find "
            "specific entries (e.g. how many visas, expenses over an amount), QUOTE the exact "
            "matching lines/rows verbatim from the document, one per line, then give a short summary. "
            "Do not invent data that is not in the documents.\nDOCUMENTS:\n" + doc_list
        )
    chat = ai.make_chat(conversation_id, system, model_key)
    user_message = UserMessage(text=body.content, file_contents=file_contents or None)

    async def event_gen():
        full = ""
        try:
            async for token in ai.stream_message(chat, user_message):
                full += token
                yield f"data: {json.dumps({'delta': token})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        finally:
            for p in temp_paths:
                try:
                    os.remove(p)
                except Exception:
                    pass
        # Show the documents we actually read as sources (transparency), even if the
        # model didn't emit an explicit [doc:ID] marker.
        used_sources = sources_meta
        if used_sources:
            yield f"data: {json.dumps({'sources': used_sources})}\n\n"
        if full.strip():
            await db.messages.insert_one({
                "message_id": str(uuid.uuid4()),
                "conversation_id": conversation_id,
                "user_id": user["user_id"],
                "role": "assistant",
                "content": full,
                "sources": used_sources,
                "model": model_key,
                "created_at": now_iso(),
            })
        update = {"updated_at": now_iso()}
        if len(history) == 0:
            update["title"] = body.content[:50] or "New conversation"
        await db.conversations.update_one({"conversation_id": conversation_id}, {"$set": update})
        yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(
        event_gen(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ---------------- Documents ----------------
async def classify_document(data: bytes, filename: str, content_type: str):
    """Use Gemini to classify a document and extract key metadata. Best-effort."""
    fc, tmp = ai.make_file_content(content_type, data, filename)
    system = (
        "You are a document classifier and extractor. Classify the document into EXACTLY one "
        "category from this list: " + ", ".join(DOC_CATEGORIES) + ". "
        "Also extract key metadata. Return ONLY JSON: {\"category\": <one-of-the-list>, "
        "\"metadata\": {\"title\": str, \"doc_type\": str, \"issuer\": str, \"date\": str, "
        "\"identifiers\": [str], \"summary\": str}}. Use empty strings/arrays when unknown."
    )
    prompt = f"Filename: {filename}. Classify this document and extract metadata. Return the JSON now."
    try:
        chat = ai.make_chat(f"classify_{uuid.uuid4().hex}", system, "gemini")
        raw = await ai.complete_with_files(chat, prompt, [fc] if fc else None)
        parsed = ai.parse_json(raw) or {}
    except Exception:
        parsed = {}
    finally:
        if tmp:
            try:
                os.remove(tmp)
            except Exception:
                pass
    category = parsed.get("category")
    if category not in DOC_CATEGORIES:
        category = None
    metadata = parsed.get("metadata") if isinstance(parsed.get("metadata"), dict) else {}
    return category, metadata


@router.post("/documents/upload")
async def upload_document(
    file: UploadFile = File(...),
    category: str = Form("auto"),
    note: str = Form(""),
    auto_classify: bool = Form(True),
    user: dict = Depends(get_current_user),
):
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else "bin"
    path = f"{APP_NAME}/uploads/{user['user_id']}/{uuid.uuid4().hex}.{ext}"
    data = await file.read()
    content_type = file.content_type or storage.MIME_TYPES.get(ext, "application/octet-stream")
    result = await run_in_threadpool(storage.put_object, path, data, content_type)

    metadata = {}
    detected = None
    final_category = category if category in DOC_CATEGORIES else "other"
    if auto_classify or category == "auto":
        detected, metadata = await classify_document(data, file.filename, content_type)
        if detected:
            final_category = category if category in DOC_CATEGORIES else detected

    doc = {
        "document_id": str(uuid.uuid4()),
        "user_id": user["user_id"],
        "storage_path": result["path"],
        "original_filename": file.filename,
        "content_type": content_type,
        "size": result.get("size", len(data)),
        "category": final_category,
        "auto_classified": bool((auto_classify or category == "auto") and (detected or metadata)),
        "metadata": metadata,
        "note": note,
        "is_deleted": False,
        "created_at": now_iso(),
    }
    await db.documents.insert_one(dict(doc))
    doc.pop("storage_path", None)
    return doc


@router.get("/documents")
async def list_documents(category: Optional[str] = None, user: dict = Depends(get_current_user)):
    query = {"user_id": user["user_id"], "is_deleted": False}
    if category and category in DOC_CATEGORIES:
        query["category"] = category
    docs = await db.documents.find(query, {"_id": 0, "storage_path": 0}).sort("created_at", -1).to_list(1000)
    return docs


@router.get("/documents/categories")
async def categories(user: dict = Depends(get_current_user)):
    return {"categories": DOC_CATEGORIES}


@router.get("/documents/{document_id}/download")
async def download_document(
    document_id: str,
    authorization: Optional[str] = Header(None),
    auth: Optional[str] = Query(None),
):
    user_id = await user_from_token(authorization, auth)
    record = await db.documents.find_one(
        {"document_id": document_id, "user_id": user_id, "is_deleted": False}, {"_id": 0}
    )
    if not record:
        raise HTTPException(status_code=404, detail="Document not found")
    data, content_type = await run_in_threadpool(storage.get_object, record["storage_path"])
    return Response(
        content=data, media_type=record.get("content_type", content_type),
        headers={"Content-Disposition": f'inline; filename="{record["original_filename"]}"'},
    )


@router.delete("/documents/{document_id}")
async def delete_document(document_id: str, user: dict = Depends(get_current_user)):
    res = await db.documents.update_one(
        {"document_id": document_id, "user_id": user["user_id"], "is_deleted": False}, {"$set": {"is_deleted": True}}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"ok": True}


# ---------------- Form Filler ----------------
class FormBody(BaseModel):
    form_title: str
    form_content: str  # pasted fields / description of the form
    purpose: Optional[str] = ""


@router.post("/forms/fill")
async def fill_form(body: FormBody, user: dict = Depends(get_current_user)):
    profile = user.get("profile", {}) or {}
    system = (
        "You are a form-filling engine. Given a user's profile and a target form, produce a digital "
        "copy of the form with each field mapped to the best value from the profile. "
        "Return ONLY JSON of the shape: {\"form_title\": str, \"fields\": [{\"label\": str, "
        "\"value\": str, \"source\": str, \"confidence\": \"high\"|\"medium\"|\"low\"|\"missing\"}], "
        "\"notes\": str}. If a value is unknown, set value to \"\" and confidence to \"missing\". "
        "source describes which profile field was used."
    )
    prompt = (
        f"USER PROFILE (JSON):\n{json.dumps(profile)}\n\n"
        f"FORM TITLE: {body.form_title}\nPURPOSE: {body.purpose}\n"
        f"FORM FIELDS / CONTENT:\n{body.form_content}\n\nReturn the JSON now."
    )
    chat = ai.make_chat(f"form_{uuid.uuid4().hex}", system, ai.TASK_MODEL["form"])
    raw = await ai.complete(chat, prompt)
    parsed = ai.parse_json(raw) or {"form_title": body.form_title, "fields": [], "notes": raw[:500]}
    record = {
        "form_id": str(uuid.uuid4()),
        "user_id": user["user_id"],
        "form_title": body.form_title,
        "purpose": body.purpose,
        "result": parsed,
        "created_at": now_iso(),
    }
    await db.form_copies.insert_one(dict(record))
    record.pop("_id", None)
    return record


@router.get("/forms")
async def list_forms(user: dict = Depends(get_current_user)):
    forms = await db.form_copies.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return forms


# ---------------- Document Bundler ----------------
class SuggestBody(BaseModel):
    purpose: str


@router.post("/bundle/suggest")
async def suggest_bundle(body: SuggestBody, user: dict = Depends(get_current_user)):
    system = (
        "You are a documentation advisor. Given a purpose (e.g. applying to a company, visa, loan, "
        "university), recommend which document categories the user should include. "
        "Available categories: " + ", ".join(DOC_CATEGORIES) + ". "
        "Return ONLY JSON: {\"summary\": str, \"recommended_categories\": [str], "
        "\"checklist\": [{\"item\": str, \"category\": str, \"required\": bool}]}."
    )
    chat = ai.make_chat(f"bundle_{uuid.uuid4().hex}", system, ai.TASK_MODEL["bundle"])
    raw = await ai.complete(chat, f"PURPOSE: {body.purpose}\n\nReturn the JSON now.")
    parsed = ai.parse_json(raw) or {"summary": raw[:500], "recommended_categories": [], "checklist": []}
    return parsed


class CreateBundleBody(BaseModel):
    name: str
    document_ids: List[str]


@router.post("/bundle/create")
async def create_bundle(body: CreateBundleBody, user: dict = Depends(get_current_user)):
    if not body.document_ids:
        raise HTTPException(status_code=400, detail="Select at least one document")
    docs = await db.documents.find(
        {"document_id": {"$in": body.document_ids}, "user_id": user["user_id"], "is_deleted": False},
        {"_id": 0},
    ).to_list(1000)
    if not docs:
        raise HTTPException(status_code=404, detail="No documents found")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        used = {}
        for d in docs:
            data, _ = await run_in_threadpool(storage.get_object, d["storage_path"])
            folder = d["category"]
            name = d["original_filename"]
            key = f"{folder}/{name}"
            if key in used:
                used[key] += 1
                stem, dot, ext = name.rpartition(".")
                name = f"{stem}_{used[key]}{dot}{ext}" if dot else f"{name}_{used[key]}"
                key = f"{folder}/{name}"
            else:
                used[key] = 0
            zf.writestr(f"{folder}/{name}", data)
    buf.seek(0)
    zip_bytes = buf.getvalue()

    await db.bundles.insert_one({
        "bundle_id": str(uuid.uuid4()),
        "user_id": user["user_id"],
        "name": body.name,
        "document_ids": body.document_ids,
        "count": len(docs),
        "size": len(zip_bytes),
        "created_at": now_iso(),
    })

    safe = "".join(c for c in body.name if c.isalnum() or c in (" ", "-", "_")).strip() or "bundle"
    return Response(
        content=zip_bytes, media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{safe}.zip"'},
    )


@router.get("/bundle/history")
async def bundle_history(user: dict = Depends(get_current_user)):
    bundles = await db.bundles.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return bundles


# ---------------- Insights (statement & expense review) ----------------
class StatementBody(BaseModel):
    document_id: str
    question: Optional[str] = ""


@router.post("/insights/statement")
async def analyze_statement(body: StatementBody, user: dict = Depends(get_current_user)):
    doc = await db.documents.find_one(
        {"document_id": body.document_id, "user_id": user["user_id"], "is_deleted": False}, {"_id": 0}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    data, ctype = await run_in_threadpool(storage.get_object, doc["storage_path"])
    fc, tmp = ai.make_file_content(doc.get("content_type") or ctype, data, doc["original_filename"])

    system = (
        "You are a meticulous personal-finance analyst reviewing a bank or credit-card statement. "
        "Analyze the attached statement and return ONLY JSON with this shape: "
        "{\"currency\": str, \"period\": str, \"total_spend\": number, \"total_income\": number, "
        "\"net\": number, \"summary\": str, "
        "\"by_category\": [{\"category\": str, \"amount\": number, \"pct\": number}], "
        "\"recurring\": [{\"merchant\": str, \"amount\": number, \"frequency\": str}], "
        "\"largest_expenses\": [{\"merchant\": str, \"amount\": number}], "
        "\"red_flags\": [str], \"advice\": [str], \"savings_potential\": number}. "
        "Categorize spending sensibly (groceries, dining, transport, utilities, rent/mortgage, "
        "subscriptions, shopping, health, entertainment, fees/interest, transfers, other). "
        "Identify recurring subscriptions and any concerning fees or interest charges. "
        "If the document is not a financial statement, return {\"error\":\"not a statement\"}."
    )
    prompt = (
        f"Statement file: {doc['original_filename']}. "
        f"User question: {body.question or 'Give a full review with expense breakdown and advice.'}\n"
        "Return the JSON now."
    )
    chat = ai.make_chat(f"stmt_{uuid.uuid4().hex}", system, "gemini")
    try:
        raw = await ai.complete_with_files(chat, prompt, [fc] if fc else None)
    finally:
        if tmp:
            try:
                os.remove(tmp)
            except Exception:
                pass

    parsed = ai.parse_json(raw)
    if not parsed or parsed.get("error"):
        raise HTTPException(status_code=422, detail="Could not analyze this file as a statement. Try a clearer bank/credit-card statement (PDF or CSV).")

    record = {
        "insight_id": str(uuid.uuid4()),
        "user_id": user["user_id"],
        "document_id": body.document_id,
        "filename": doc["original_filename"],
        "result": parsed,
        "created_at": now_iso(),
    }
    await db.insights.insert_one(dict(record))
    record.pop("_id", None)
    return record


@router.get("/insights")
async def list_insights(user: dict = Depends(get_current_user)):
    return await db.insights.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)


# ---------------- Investments ----------------
INVESTMENT_TYPES = [
    "stock", "mutual_fund", "etf", "crypto", "real_estate", "gold",
    "fixed_deposit", "bond", "pension", "other",
]


class InvestmentBody(BaseModel):
    name: str
    asset_type: str = "stock"
    amount_invested: float = 0
    current_value: float = 0
    purchase_date: Optional[str] = ""
    notes: Optional[str] = ""


class InvestmentUpdate(BaseModel):
    name: Optional[str] = None
    asset_type: Optional[str] = None
    amount_invested: Optional[float] = None
    current_value: Optional[float] = None
    purchase_date: Optional[str] = None
    notes: Optional[str] = None


@router.get("/investments/meta")
async def investments_meta(user: dict = Depends(get_current_user)):
    return {"types": INVESTMENT_TYPES}


@router.post("/investments")
async def add_investment(body: InvestmentBody, user: dict = Depends(get_current_user)):
    inv = {"investment_id": str(uuid.uuid4()), "user_id": user["user_id"], "created_at": now_iso()}
    inv.update(body.model_dump())
    await db.investments.insert_one(dict(inv))
    inv.pop("_id", None)
    return inv


@router.get("/investments")
async def list_investments(user: dict = Depends(get_current_user)):
    return await db.investments.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)


@router.get("/investments/summary")
async def investments_summary(user: dict = Depends(get_current_user)):
    items = await db.investments.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(500)
    invested = sum(float(i.get("amount_invested") or 0) for i in items)
    current = sum(float(i.get("current_value") or 0) for i in items)
    gain = current - invested
    roi = round((gain / invested) * 100, 2) if invested else 0
    by_type = {}
    for i in items:
        t = i.get("asset_type", "other")
        by_type[t] = by_type.get(t, 0) + float(i.get("current_value") or 0)
    return {
        "count": len(items),
        "total_invested": round(invested, 2),
        "total_current": round(current, 2),
        "total_gain": round(gain, 2),
        "roi_pct": roi,
        "by_type": by_type,
        "net_worth": round(current, 2),
    }


@router.put("/investments/{investment_id}")
async def update_investment(investment_id: str, body: InvestmentUpdate, user: dict = Depends(get_current_user)):
    res = await db.investments.update_one(
        {"investment_id": investment_id, "user_id": user["user_id"]},
        {"$set": body.model_dump(exclude_unset=True)},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Investment not found")
    return await db.investments.find_one({"investment_id": investment_id}, {"_id": 0})


@router.delete("/investments/{investment_id}")
async def delete_investment(investment_id: str, user: dict = Depends(get_current_user)):
    res = await db.investments.delete_one({"investment_id": investment_id, "user_id": user["user_id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Investment not found")
    return {"ok": True}


# ---------------- Life Event Guides ----------------
LIFE_EVENTS = {
    "buy_home": {
        "title": "Buying a home",
        "categories": ["identity", "financial", "bank_statement", "tax", "employment", "property", "insurance"],
    },
    "new_baby": {
        "title": "Welcoming a new baby",
        "categories": ["identity", "medical", "insurance", "financial", "legal_estate"],
    },
    "retirement": {
        "title": "Planning retirement",
        "categories": ["investment", "insurance", "financial", "tax", "legal_estate", "medical"],
    },
    "marriage": {
        "title": "Getting married",
        "categories": ["identity", "legal_estate", "insurance", "financial", "property"],
    },
    "new_job": {
        "title": "Starting a new job",
        "categories": ["employment", "identity", "tax", "education", "financial"],
    },
    "bereavement": {
        "title": "Loss of a loved one",
        "categories": ["legal_estate", "insurance", "financial", "identity", "property"],
    },
    "moving_abroad": {
        "title": "Moving abroad",
        "categories": ["identity", "immigration", "financial", "tax", "medical", "education"],
    },
}


class LifeEventBody(BaseModel):
    event: str


@router.get("/life-events")
async def list_life_events(user: dict = Depends(get_current_user)):
    return {"events": [{"key": k, "title": v["title"], "categories": v["categories"]} for k, v in LIFE_EVENTS.items()]}


@router.post("/life-events/guide")
async def life_event_guide(body: LifeEventBody, user: dict = Depends(get_current_user)):
    ev = LIFE_EVENTS.get(body.event)
    if not ev:
        raise HTTPException(status_code=404, detail="Unknown life event")

    system = (
        "You are a life-admin concierge. Given a major life event, produce a clear, practical "
        "checklist of the documents and steps the person needs to prepare. "
        "Available document categories: " + ", ".join(DOC_CATEGORIES) + ". "
        "Return ONLY JSON: {\"summary\": str, "
        "\"checklist\": [{\"item\": str, \"category\": str, \"required\": bool, \"why\": str}], "
        "\"tips\": [str]}. "
        "Each checklist item's category MUST be one of the available categories. "
        "Keep it specific and actionable (8-14 items)."
    )
    chat = ai.make_chat(f"life_{uuid.uuid4().hex}", system, "claude")
    raw = await ai.complete(chat, f"LIFE EVENT: {ev['title']}\n\nReturn the JSON now.")
    parsed = ai.parse_json(raw) or {"summary": raw[:400], "checklist": [], "tips": []}

    # Recommended categories = union of curated + AI-suggested (valid only)
    rec = list(ev["categories"])
    for item in parsed.get("checklist", []):
        c = item.get("category")
        if c in DOC_CATEGORIES and c not in rec:
            rec.append(c)

    docs = await db.documents.find(
        {"user_id": user["user_id"], "is_deleted": False, "category": {"$in": rec}},
        {"_id": 0, "document_id": 1, "original_filename": 1, "category": 1},
    ).to_list(1000)
    by_cat = {}
    for d in docs:
        by_cat.setdefault(d["category"], []).append({"document_id": d["document_id"], "filename": d["original_filename"]})

    matched = [{"category": c, "documents": by_cat.get(c, [])} for c in rec if by_cat.get(c)]
    missing = [c for c in rec if not by_cat.get(c)]
    have_ids = [d["document_id"] for d in docs]

    return {
        "event": body.event,
        "title": ev["title"],
        "summary": parsed.get("summary", ""),
        "checklist": parsed.get("checklist", []),
        "tips": parsed.get("tips", []),
        "recommended_categories": rec,
        "matched_documents": matched,
        "missing_categories": missing,
        "have_document_ids": have_ids,
    }


# ---------------- Dashboard ----------------
@router.get("/dashboard/stats")
async def dashboard_stats(user: dict = Depends(get_current_user)):
    profile = user.get("profile", {}) or {}
    docs = await db.documents.find(
        {"user_id": user["user_id"], "is_deleted": False}, {"_id": 0, "storage_path": 0}
    ).to_list(2000)
    by_category = {}
    for d in docs:
        by_category[d["category"]] = by_category.get(d["category"], 0) + 1
    conv_count = await db.conversations.count_documents({"user_id": user["user_id"]})
    bundle_count = await db.bundles.count_documents({"user_id": user["user_id"]})
    form_count = await db.form_copies.count_documents({"user_id": user["user_id"]})
    insight_count = await db.insights.count_documents({"user_id": user["user_id"]})
    recent_docs = sorted(docs, key=lambda x: x["created_at"], reverse=True)[:5]
    return {
        "completeness": profile_completeness(profile),
        "document_count": len(docs),
        "by_category": by_category,
        "conversation_count": conv_count,
        "bundle_count": bundle_count,
        "form_count": form_count,
        "insight_count": insight_count,
        "recent_documents": recent_docs,
    }
