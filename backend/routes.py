import io
import os
import re
import json
import uuid
import hashlib
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

from routes_market import get_portfolio_market_context

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


async def _get_user_knowledge(user_id: str, limit: int = 20) -> str:
    """Build a knowledge-base summary from the user's uploaded documents and chat files.
    This gives the AI persistent context about what files the user has shared, without
    needing to re-read the raw files every time."""
    lines = []
    # Documents from the Vault (classified, with metadata)
    docs = await db.documents.find(
        {"user_id": user_id, "is_deleted": False}, {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    for d in docs:
        meta = d.get("metadata") or {}
        parts = [f"  - {d.get('original_filename', 'unknown')}"]
        if d.get("category"):
            parts.append(f"category={d['category']}")
        if meta.get("title"):
            parts.append(f"title=\"{meta['title']}\"")
        if meta.get("issuer"):
            parts.append(f"issuer=\"{meta['issuer']}\"")
        if meta.get("date"):
            parts.append(f"date={meta['date']}")
        if meta.get("expiry_date"):
            parts.append(f"expires={meta['expiry_date']}")
        if meta.get("summary"):
            parts.append(f"summary=\"{meta['summary'][:120]}\"")
        lines.append(", ".join(parts))
    # Chat file attachments (files shared in conversations)
    chat_files = await db.chat_files.find(
        {"user_id": user_id}, {"_id": 0, "filename": 1, "content_type": 1, "size": 1, "created_at": 1}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    for cf in chat_files:
        lines.append(f"  - {cf.get('filename', 'unknown')} (chat file, {cf.get('content_type', '?')}, {cf.get('size', 0)} bytes)")
    if not lines:
        return ""
    return (
        "\n\n=== USER KNOWLEDGE BASE ===\n"
        f"The user has shared {len(lines)} file(s) across their vault and conversations:\n"
        + "\n".join(lines)
        + "\n=== END KNOWLEDGE BASE ===\n"
        "Use this knowledge to reference the user's files when relevant. "
        "If the user asks about a document, check this list first before searching."
    )


def build_system_prompt(user: dict, history: list, knowledge: str = "") -> str:
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
    filename: str = ""
    content_type: Optional[str] = ""


class MessageBody(BaseModel):
    content: str
    model: Optional[str] = "claude"
    language: Optional[str] = "en"
    attachments: Optional[List[ChatAttachment]] = []


# ── Smart duplicate detection ────────────────────────────────────────────────

def _content_hash(data: bytes) -> str:
    """SHA-256 content hash for exact duplicate detection."""
    return hashlib.sha256(data).hexdigest()


def _normalize_filename(name: str) -> str:
    """Normalize a filename for fuzzy comparison — strip extensions, dates, common noise."""
    base = name.rsplit(".", 1)[0] if "." in name else name
    base = re.sub(r"[_\-\s]+", " ", base).strip().lower()
    # Remove common date patterns
    base = re.sub(r"\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b", "", base)
    base = re.sub(r"\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b", "", base)
    base = re.sub(r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*\d{0,4}\b", "", base)
    # Remove copy/duplicate indicators
    base = re.sub(r"\b(copy|duplicate|dup|final|latest|new|old|backup|v\d+)\b", "", base)
    # Remove trailing numbers that look like counters
    base = re.sub(r"\s*\(\d+\)\s*$", "", base)
    return re.sub(r"\s+", " ", base).strip()


def _name_similarity(a: str, b: str) -> float:
    """Token-overlap similarity score between two normalized filenames (0.0–1.0)."""
    na, nb = _normalize_filename(a), _normalize_filename(b)
    if not na or not nb:
        return 0.0
    if na == nb:
        return 1.0
    tokens_a = set(na.split())
    tokens_b = set(nb.split())
    if not tokens_a or not tokens_b:
        return 0.0
    overlap = len(tokens_a & tokens_b)
    union = len(tokens_a | tokens_b)
    # Jaccard similarity
    return overlap / union if union else 0.0


async def _check_duplicate(user_id: str, data: bytes, filename: str, content_type: str) -> dict:
    """
    Check if a file is a duplicate of an existing document in the user's vault.

    Returns one of:
      - {"is_duplicate": False}
      - {"is_duplicate": True, "match_type": "exact", "existing": {...}}
      - {"is_duplicate": True, "match_type": "similar", "similarity": 0.85, "existing": {...}}
    """
    if not data or len(data) < 10:
        return {"is_duplicate": False}

    chash = _content_hash(data)

    # 1. Exact match by content hash — check all existing documents
    existing = await db.documents.find(
        {"user_id": user_id, "is_deleted": False},
        {"_id": 0, "document_id": 1, "original_filename": 1, "content_type": 1,
         "size": 1, "category": 1, "created_at": 1, "content_hash": 1}
    ).to_list(500)

    # Check content hash match
    for doc in existing:
        doc_hash = doc.get("content_hash")
        if not doc_hash:
            # Legacy doc without hash — compute on the fly if size matches
            if doc.get("size") == len(data):
                try:
                    old_data, _ = await run_in_threadpool(storage.get_object, doc.get("storage_path", ""))
                    if _content_hash(old_data) == chash:
                        return {"is_duplicate": True, "match_type": "exact", "existing": doc}
                except Exception:
                    continue
        elif doc_hash == chash:
            return {"is_duplicate": True, "match_type": "exact", "existing": doc}

    # 2. Similar match — same file size + high filename similarity (renamed file)
    for doc in existing:
        size_match = doc.get("size") == len(data)
        name_sim = _name_similarity(filename, doc.get("original_filename", ""))
        if size_match and name_sim >= 0.6:
            return {"is_duplicate": True, "match_type": "similar", "similarity": round(name_sim, 2), "existing": doc}
        # High name similarity even without size match (slightly modified file)
        if name_sim >= 0.85 and doc.get("size", 0) and abs(doc.get("size", 0) - len(data)) < max(1024, len(data) * 0.05):
            return {"is_duplicate": True, "match_type": "similar", "similarity": round(name_sim, 2), "existing": doc}

    return {"is_duplicate": False}


@router.post("/chat/upload")
async def chat_upload(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else "bin"
    path = f"{APP_NAME}/chat/{user['user_id']}/{uuid.uuid4().hex}.{ext}"
    data = await file.read()
    content_type = file.content_type or storage.MIME_TYPES.get(ext, "application/octet-stream")

    # ── Smart duplicate check ──
    dup = await _check_duplicate(user["user_id"], data, file.filename, content_type)
    if dup["is_duplicate"]:
        existing = dup["existing"]
        match_desc = "exact same file" if dup["match_type"] == "exact" else f"{int(dup.get('similarity', 0) * 100)}% similar name"
        return {
            "duplicate": True,
            "match_type": dup["match_type"],
            "similarity": dup.get("similarity", 1.0),
            "message": f"This looks like a duplicate of \"{existing.get('original_filename', 'an existing file')}\" ({match_desc}). Already in your Vault.",
            "existing_document_id": existing.get("document_id"),
            "existing_filename": existing.get("original_filename"),
            "existing_category": existing.get("category"),
            "filename": file.filename,
            "content_type": content_type,
            "size": len(data),
        }

    await run_in_threadpool(storage.put_object, path, data, content_type)
    chash = _content_hash(data)
    att = {
        "attachment_id": str(uuid.uuid4()),
        "user_id": user["user_id"],
        "storage_path": path,
        "filename": file.filename,
        "content_type": content_type,
        "size": len(data),
        "content_hash": chash,
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
        "content_hash": chash,
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
    knowledge = await _get_user_knowledge(user["user_id"])
    market_ctx = await get_portfolio_market_context(user["user_id"])
    system = build_system_prompt(user, history, knowledge)
    system += "\n\n" + market_ctx

    # ── Investment list for chat-driven CRUD ──
    investments = await db.investments.find(
        {"user_id": user["user_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    if investments:
        inv_lines = []
        for inv in investments:
            inv_lines.append(
                f"  - id={inv.get('investment_id','')} | {inv.get('name','')} | "
                f"type={inv.get('asset_type','')} | invested={inv.get('amount_invested',0)} | "
                f"current={inv.get('current_value',0)} | ticker={inv.get('ticker','')} | "
                f"purchase_date={inv.get('purchase_date','')}"
            )
        system += (
            "\n\n=== USER'S INVESTMENTS (you can manage these via chat) ===\n"
            + "\n".join(inv_lines)
            + "\n\nTo ADD an investment, emit: [INV_ADD:{\"name\":\"...\",\"asset_type\":\"stock\",\"amount_invested\":1000,\"current_value\":1100,\"ticker\":\"AAPL\",\"market\":\"US\",\"purchase_date\":\"\",\"notes\":\"\"}]\n"
            "To EDIT an investment by name, emit: [INV_EDIT:{\"name\":\"Apple\",\"updates\":{\"current_value\":3200,\"notes\":\"updated\"}}]\n"
            "To DELETE an investment by name, emit: [INV_DELETE:Apple]\n"
            "Place the marker at the END of your response. Explain to the user what you did in plain language BEFORE the marker. "
            "The app will execute the action and confirm. You can emit multiple markers in one response if needed.\n"
            "=== END INVESTMENT ACTIONS ==="
        )

    # ── Document generation from chat ──
    system += (
        "\n\n=== DOCUMENT GENERATION (from chat) ===\n"
        "You can generate legal documents (PDF/DOCX) for the user directly from chat. "
        "Available templates: rental_agreement, nda, will, employment_contract, "
        "loan_agreement, power_of_attorney, partnership_deed, sale_deed.\n"
        "To generate a document, emit at the END of your response:\n"
        "[DOC_GEN:{\"template_id\":\"rental_agreement\",\"format\":\"pdf\",\"data\":{\"landlord_name\":\"...\",\"tenant_name\":\"...\",\"monthly_rent\":25000,\"city\":\"...\"}}]\n"
        "Fill in as many fields as you can from the user's profile and conversation context. "
        "Explain to the user what document you're generating and what details you used BEFORE the marker.\n"
        "=== END DOCUMENT GENERATION ==="
    )

    # ── Language instruction ──
    AI_LANG_NAMES = {
        "en": "English", "hi": "Hindi", "bn": "Bengali", "ta": "Tamil", "te": "Telugu",
        "mr": "Marathi", "gu": "Gujarati", "kn": "Kannada", "ml": "Malayalam", "pa": "Punjabi",
        "or": "Odia", "es": "Spanish", "fr": "French", "de": "German", "zh": "Chinese (Simplified)",
        "ja": "Japanese", "ko": "Korean", "pt": "Portuguese", "ru": "Russian", "ar": "Arabic",
        "it": "Italian", "nl": "Dutch", "tr": "Turkish", "pl": "Polish", "sv": "Swedish",
        "id": "Indonesian", "th": "Thai", "vi": "Vietnamese", "fa": "Persian", "he": "Hebrew",
        "uk": "Ukrainian", "el": "Greek", "cs": "Czech", "ro": "Romanian", "hu": "Hungarian",
        "fi": "Finnish", "da": "Danish", "no": "Norwegian", "ms": "Malay", "fil": "Filipino",
        "sw": "Swahili",
    }
    ai_lang = AI_LANG_NAMES.get(body.language or "en", "English")
    system += (
        f"\n\n=== LANGUAGE INSTRUCTION ===\n"
        f"You MUST respond in {ai_lang}. Always write your entire response in {ai_lang}, "
        f"regardless of the language the user writes in. "
        f"If the user explicitly asks you to change the app language (e.g. 'change language to Hindi', "
        f"'switch to Spanish', 'ਪੰਜਾਬੀ ਵਿੱਚ ਬਦਲੋ'), include this special marker at the very START of your "
        f"response: [LANG_CHANGE:CODE] where CODE is the ISO 639-1 code for that language "
        f"(e.g. [LANG_CHANGE:hi] for Hindi, [LANG_CHANGE:es] for Spanish). Then continue your "
        f"response normally in the requested language. The app will switch its UI language automatically.\n"
        f"=== END LANGUAGE INSTRUCTION ==="
    )

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


# ---------------- Panel Chat (embedded chat in non-chat pages) ----------------
class PanelChatBody(BaseModel):
    message: str
    system_prompt: str = ""
    language: Optional[str] = "en"


@router.post("/chat/panel")
async def panel_chat(body: PanelChatBody, user: dict = Depends(get_current_user)):
    """
    Lightweight chat endpoint for embedded panel chats (Vault, LoanPrep, etc.).
    Streams a response using the Yolo-Auto AI. Does NOT create a conversation
    or save messages — the frontend persists chat history in localStorage.
    """
    text = (body.message or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="No message provided")

    # Build a minimal system prompt with user context
    knowledge = await _get_user_knowledge(user["user_id"])
    market_ctx = await get_portfolio_market_context(user["user_id"])

    AI_LANG_NAMES = {
        "en": "English", "hi": "Hindi", "bn": "Bengali", "ta": "Tamil", "te": "Telugu",
        "mr": "Marathi", "gu": "Gujarati", "kn": "Kannada", "ml": "Malayalam", "pa": "Punjabi",
        "or": "Odia", "es": "Spanish", "fr": "French", "de": "German", "zh": "Chinese (Simplified)",
        "ja": "Japanese", "ko": "Korean", "pt": "Portuguese", "ru": "Russian", "ar": "Arabic",
        "it": "Italian", "nl": "Dutch", "tr": "Turkish", "pl": "Polish", "sv": "Swedish",
        "id": "Indonesian", "th": "Thai", "vi": "Vietnamese", "fa": "Persian", "he": "Hebrew",
        "uk": "Ukrainian", "el": "Greek", "cs": "Czech", "ro": "Romanian", "hu": "Hungarian",
        "fi": "Finnish", "da": "Danish", "no": "Norwegian", "ms": "Malay", "fil": "Filipino",
        "sw": "Swahili",
    }
    ai_lang = AI_LANG_NAMES.get(body.language or "en", "English")

    system = body.system_prompt or "You are a helpful AI assistant."
    system += f"\n\nUser knowledge base:\n{knowledge}"
    system += f"\n\n{market_ctx}"
    system += f"\n\nYou MUST respond in {ai_lang}. Be concise and helpful."

    chat = ai.make_chat(f"panel_{uuid.uuid4().hex}", system, "yolo")
    user_message = UserMessage(text=text)

    async def event_gen():
        try:
            async for token in ai.stream_message(chat, user_message):
                yield f"data: {json.dumps({'delta': token})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(
        event_gen(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Mobile AI proxy (bypasses CORS for web testing) ──────────────────────────
class MobileAIBody(BaseModel):
    system_prompt: str
    user_message: str
    model: str = "yolo"
    stream: bool = True


@router.post("/mobile/ai/chat")
async def mobile_ai_chat(body: MobileAIBody):
    """Proxy AI calls for the mobile app (web mode). No auth required —
    the mobile app manages its own auth locally via SQLite."""
    text = (body.user_message or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="No message provided")

    system = body.system_prompt or "You are a helpful AI assistant."
    chat = ai.make_chat(f"mobile_{uuid.uuid4().hex}", system, body.model or "yolo")
    user_message = UserMessage(text=text)

    async def event_gen():
        try:
            async for token in ai.stream_message(chat, user_message):
                yield f"data: {json.dumps({'delta': token})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(
        event_gen(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Mobile AI proxy (non-streaming, for SmartAddBar) ─────────────────────────
class MobileAICompleteBody(BaseModel):
    system_prompt: str
    user_message: str
    model: str = "yolo"


@router.post("/mobile/ai/complete")
async def mobile_ai_complete(body: MobileAICompleteBody):
    """Non-streaming AI completion proxy for the mobile app."""
    text = (body.user_message or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="No message provided")

    system = body.system_prompt or "You are a helpful AI assistant."
    chat = ai.make_chat(f"mobile_c_{uuid.uuid4().hex}", system, body.model or "yolo")
    user_message = UserMessage(text=text)

    try:
        result = await ai.complete(chat, text)
        return {"content": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------- Documents ----------------
async def classify_document(data: bytes, filename: str, content_type: str):
    """Use Gemini to classify a document and extract key metadata. Best-effort."""
    fc, tmp = ai.make_file_content(content_type, data, filename)
    system = (
        "You are a document classifier and extractor. Classify the document into EXACTLY one "
        "category from this list: " + ", ".join(DOC_CATEGORIES) + ". "
        "Also extract key metadata. Return ONLY JSON: {\"category\": <one-of-the-list>, "
        "\"metadata\": {\"title\": str, \"doc_type\": str, \"issuer\": str, \"date\": str, "
        "\"expiry_date\": str, \"identifiers\": [str], \"summary\": str}}. "
        "For expiry_date, extract any expiry / valid-until / renewal / due date as ISO YYYY-MM-DD if present, else empty. "
        "Use empty strings/arrays when unknown."
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

    # ── Smart duplicate check ──
    dup = await _check_duplicate(user["user_id"], data, file.filename, content_type)
    if dup["is_duplicate"]:
        existing = dup["existing"]
        match_desc = "exact same file" if dup["match_type"] == "exact" else f"{int(dup.get('similarity', 0) * 100)}% similar name"
        return {
            "duplicate": True,
            "match_type": dup["match_type"],
            "similarity": dup.get("similarity", 1.0),
            "message": f"This looks like a duplicate of \"{existing.get('original_filename', 'an existing file')}\" ({match_desc}). Already in your Vault.",
            "existing_document_id": existing.get("document_id"),
            "existing_filename": existing.get("original_filename"),
            "existing_category": existing.get("category"),
            "filename": file.filename,
            "size": len(data),
        }

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
        "content_hash": _content_hash(data),
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


@router.get("/form-copies")
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
    ticker: Optional[str] = ""
    market: Optional[str] = ""
    notes: Optional[str] = ""


class InvestmentUpdate(BaseModel):
    name: Optional[str] = None
    asset_type: Optional[str] = None
    amount_invested: Optional[float] = None
    current_value: Optional[float] = None
    purchase_date: Optional[str] = None
    ticker: Optional[str] = None
    market: Optional[str] = None
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


@router.post("/investments/chat-action")
async def investment_chat_action(body: dict, user: dict = Depends(get_current_user)):
    """
    Execute an investment action emitted by the AI chat.
    body: {"action": "add"|"edit"|"delete", ...}
    - add:    {"action":"add","data":{name,asset_type,amount_invested,...}}
    - edit:   {"action":"edit","name":"Apple","updates":{current_value:3200,...}}
    - delete: {"action":"delete","name":"Apple"}
    """
    action = body.get("action", "")

    if action == "add":
        data = body.get("data", {})
        if not data.get("name"):
            return {"ok": False, "error": "Name is required"}
        inv = {
            "investment_id": str(uuid.uuid4()),
            "user_id": user["user_id"],
            "created_at": now_iso(),
            "name": data.get("name", ""),
            "asset_type": data.get("asset_type", "stock"),
            "amount_invested": float(data.get("amount_invested", 0)),
            "current_value": float(data.get("current_value", 0)),
            "purchase_date": data.get("purchase_date", ""),
            "ticker": data.get("ticker", ""),
            "market": data.get("market", ""),
            "notes": data.get("notes", ""),
        }
        await db.investments.insert_one(dict(inv))
        inv.pop("_id", None)
        return {"ok": True, "action": "add", "investment": inv}

    elif action == "edit":
        name = body.get("name", "")
        updates = body.get("updates", {})
        if not name:
            return {"ok": False, "error": "Investment name is required"}
        # Find by name (case-insensitive)
        existing = await db.investments.find_one(
            {"user_id": user["user_id"], "name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}},
            {"_id": 0}
        )
        if not existing:
            return {"ok": False, "error": f"Investment '{name}' not found"}
        # Convert numeric fields
        clean_updates = {}
        for k, v in updates.items():
            if k in ("amount_invested", "current_value"):
                clean_updates[k] = float(v) if v else 0
            else:
                clean_updates[k] = v
        await db.investments.update_one(
            {"investment_id": existing["investment_id"], "user_id": user["user_id"]},
            {"$set": clean_updates}
        )
        updated = await db.investments.find_one(
            {"investment_id": existing["investment_id"]}, {"_id": 0}
        )
        return {"ok": True, "action": "edit", "investment": updated}

    elif action == "delete":
        name = body.get("name", "")
        if not name:
            return {"ok": False, "error": "Investment name is required"}
        res = await db.investments.delete_one(
            {"user_id": user["user_id"], "name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}}
        )
        if res.deleted_count == 0:
            return {"ok": False, "error": f"Investment '{name}' not found"}
        return {"ok": True, "action": "delete", "name": name}

    return {"ok": False, "error": f"Unknown action: {action}"}


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


class TrackEventBody(BaseModel):
    event: str
    title: str = ""
    checklist: List[dict] = []
    recommended_categories: List[str] = []


@router.post("/life-events/track")
async def track_life_event(body: TrackEventBody, user: dict = Depends(get_current_user)):
    ev = LIFE_EVENTS.get(body.event)
    if not ev:
        raise HTTPException(status_code=404, detail="Unknown life event")
    doc = {
        "user_id": user["user_id"],
        "event": body.event,
        "title": body.title or ev["title"],
        "checklist": body.checklist,
        "recommended_categories": body.recommended_categories or ev["categories"],
        "updated_at": now_iso(),
    }
    await db.life_event_trackers.update_one(
        {"user_id": user["user_id"], "event": body.event},
        {"$set": doc, "$setOnInsert": {"created_at": now_iso()}},
        upsert=True,
    )
    return {"ok": True, **doc}


@router.get("/life-events/tracked")
async def tracked_life_events(user: dict = Depends(get_current_user)):
    trackers = await db.life_event_trackers.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    out = []
    for t in trackers:
        cats = t.get("recommended_categories", [])
        have = await db.documents.distinct(
            "category", {"user_id": user["user_id"], "is_deleted": False, "category": {"$in": cats}}
        )
        out.append({**t, "missing_categories": [c for c in cats if c not in have]})
    return out


@router.delete("/life-events/track/{event}")
async def untrack_life_event(event: str, user: dict = Depends(get_current_user)):
    await db.life_event_trackers.delete_one({"user_id": user["user_id"], "event": event})
    return {"ok": True}


# ---------------- Reminders ----------------
def _parse_date(s):
    if not s or not isinstance(s, str):
        return None
    s = s.strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%Y/%m/%d", "%d %b %Y", "%d %B %Y", "%b %d, %Y", "%B %d, %Y"):
        try:
            return datetime.strptime(s[:len(fmt) + 4], fmt).date()
        except Exception:
            continue
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).date()
    except Exception:
        return None


@router.get("/reminders")
async def get_reminders(window_days: int = 90, user: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).date()
    items = []

    # 1. Expiring documents (from extracted metadata)
    docs = await db.documents.find(
        {"user_id": user["user_id"], "is_deleted": False}, {"_id": 0, "storage_path": 0}
    ).to_list(2000)
    for d in docs:
        exp = _parse_date((d.get("metadata") or {}).get("expiry_date"))
        if not exp:
            continue
        days = (exp - today).days
        if days <= window_days:
            items.append({
                "id": f"doc-{d['document_id']}",
                "type": "document_expiry",
                "title": f"{d['original_filename']} expires",
                "detail": ("Expired" if days < 0 else f"Expires in {days} day{'s' if days != 1 else ''}") + f" · {exp.isoformat()}",
                "due_date": exp.isoformat(),
                "days": days,
                "severity": "high" if days < 14 else "medium",
                "link": "/vault",
            })

    # 2. Insurance renewals / maturity
    policies = await db.insurance_policies.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(500)
    for p in policies:
        mat = _parse_date(p.get("maturity_date"))
        if not mat:
            continue
        days = (mat - today).days
        if 0 <= days <= window_days or (days < 0 and days > -30):
            items.append({
                "id": f"ins-{p.get('policy_id')}",
                "type": "insurance_renewal",
                "title": f"{p.get('provider', 'Policy')} — {p.get('policy_type', '').replace('_', ' ')} matures",
                "detail": (f"Due in {days} days" if days >= 0 else "Recently due") + f" · {mat.isoformat()}",
                "due_date": mat.isoformat(),
                "days": days,
                "severity": "high" if days < 14 else "medium",
                "link": "/insurance",
            })

    # 3. Tracked life-event milestones with missing documents
    trackers = await db.life_event_trackers.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(100)
    for t in trackers:
        cats = t.get("recommended_categories", [])
        have = await db.documents.distinct(
            "category", {"user_id": user["user_id"], "is_deleted": False, "category": {"$in": cats}}
        )
        missing = [c for c in cats if c not in have]
        if missing:
            items.append({
                "id": f"life-{t['event']}",
                "type": "milestone_task",
                "title": f"{t.get('title', 'Milestone')} — {len(missing)} document{'s' if len(missing) != 1 else ''} still needed",
                "detail": "Missing: " + ", ".join(missing[:6]) + ("…" if len(missing) > 6 else ""),
                "due_date": None,
                "days": 9999,
                "severity": "low",
                "link": "/life-events",
            })

    order = {"high": 0, "medium": 1, "low": 2}
    items.sort(key=lambda x: (order.get(x["severity"], 3), x.get("days", 9999)))
    return {"count": len(items), "reminders": items}


# ---------------- Smart Add (AI-powered natural-language data entry) ----------------
class SmartAddBody(BaseModel):
    text: str
    target: str = "auto"  # "auto" | "investment" | "insurance" | "contact" | "profile" | "life_event"
                         # | "loan_prep" | "bundle" | "form_fill"  (action targets — return params, don't save)


@router.post("/chat/smart-add")
async def smart_add(body: SmartAddBody, user: dict = Depends(get_current_user)):
    """
    Accept natural-language text, use AI to extract structured data, and save
    it to the appropriate MongoDB collection. Lets users chat their information
    instead of filling out forms field-by-field.

    Targets:
      - investment:  name, asset_type, amount_invested, current_value, purchase_date, notes
      - insurance:   policy_type, provider, policy_number, sum_assured, premium_amount, ...
      - contact:     name, relationship, email, phone, access_level, notes
      - profile:     any profile fields (personal, contact, identity, financial, etc.)
      - life_event:  event key from LIFE_EVENTS
      - auto:        AI decides which target based on the text content
    """
    text = (body.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="No text provided")

    target = body.target
    if target == "auto":
        # Let AI decide the target from the text
        target_prompt = (
            "Classify this user message into exactly one category: "
            "'investment', 'insurance', 'contact', 'profile', 'life_event'. "
            "Return ONLY the category word, nothing else.\n\n"
            f"Message: {text[:500]}"
        )
        try:
            chat_cls = ai.make_chat(f"cls_{uuid.uuid4().hex}", "You are a classifier. Return only one word.", "yolo")
            raw = await ai.complete(chat_cls, target_prompt)
            target = (raw or "").strip().lower().replace(".", "").replace(",", "")
            if target not in ("investment", "insurance", "contact", "profile", "life_event"):
                target = "investment"  # safe fallback
        except Exception:
            target = "investment"

    # Build extraction prompt per target
    if target == "investment":
        schema_desc = (
            '{"name": str, "asset_type": str (one of: stock, mutual_fund, etf, crypto, '
            'real_estate, gold, bond, fixed_deposit, ppf, ulip, other), '
            '"amount_invested": number, "current_value": number, '
            '"purchase_date": "YYYY-MM-DD" or "", "ticker": str (stock symbol like AAPL, '
            'RELIANCE.NS, BTC-USD — empty if not a publicly traded asset), '
            '"market": str (US, NSE, BSE, Crypto — empty if unknown), '
            '"notes": str}'
        )
        collection = db.investments
        id_field = "investment_id"
    elif target == "insurance":
        schema_desc = (
            '{"policy_type": str (one of: life_term, life_whole, ulip, health, '
            'critical_illness, disability, personal_accident, vehicle, home, travel, '
            'pension_annuity, other), "provider": str, "policy_number": str, '
            '"sum_assured": str, "premium_amount": str, "premium_frequency": str '
            '(monthly, quarterly, half_yearly, yearly), "start_date": "YYYY-MM-DD", '
            '"maturity_date": "YYYY-MM-DD", "nominee_name": str, '
            '"nominee_relationship": str, "riders": str, "claim_contact": str, '
            '"agent_contact": str, "notes": str}'
        )
        collection = db.insurance_policies
        id_field = "policy_id"
    elif target == "contact":
        schema_desc = (
            '{"name": str, "relationship": str (spouse, child, parent, sibling, '
            'friend, lawyer, accountant, other), "email": str, "phone": str, '
            '"access_level": str (full, financial, insurance), "notes": str}'
        )
        collection = db.legacy_contacts
        id_field = "contact_id"
    elif target == "profile":
        schema_desc = (
            'A JSON object with any of these sections: '
            '{"personal": {"full_name": str, "date_of_birth": str, "gender": str, '
            '"nationality": str, "marital_status": str}, '
            '"contact": {"email": str, "phone": str, "address_line": str, "city": str, '
            '"state": str, "postal_code": str, "country": str}, '
            '"financial": {"annual_income": str, "employer": str, "occupation": str, '
            '"bank_name": str, "account_number": str}, '
            '"family": {"spouse_name": str, "children": str, '
            '"emergency_contact_name": str, "emergency_contact_phone": str}}. '
            'Only include fields explicitly mentioned in the message.'
        )
    elif target == "life_event":
        schema_desc = (
            '{"event": str (one of: marriage, new_baby, new_home, new_job, retirement, '
            'medical_event, immigration, education, inheritance, other)}'
        )
    elif target == "loan_prep":
        schema_desc = (
            '{"bank": str, "loan_type": str (e.g. Home Loan, Personal Loan, Car Loan, '
            'Education Loan, Business Loan), "employment_type": str (Salaried, '
            'Self-Employed Professional, Self-Employed Non-Professional), '
            '"purchase_type": str (New home, Resale home, "Plot / construction", '
            '"Not applicable")}'
        )
    elif target == "bundle":
        schema_desc = (
            '{"purpose": str, "suggested_name": str}'
        )
    elif target == "form_fill":
        schema_desc = (
            '{"form_title": str, "purpose": str, "form_content": str}'
        )
    else:
        raise HTTPException(status_code=400, detail=f"Unknown target: {target}")

    system = (
        f"You are a data extraction assistant. Extract structured data from the user's "
        f"natural-language message and return ONLY valid JSON matching this schema:\n"
        f"{schema_desc}\n"
        f"Use empty strings for unknown fields. Use numbers for amounts (strip currency symbols). "
        f"Dates must be YYYY-MM-DD format. Do not include any text outside the JSON."
    )

    try:
        chat = ai.make_chat(f"smart_{uuid.uuid4().hex}", system, "yolo")
        raw = await ai.complete(chat, f"Extract data from this message:\n{text}")
        parsed = ai.parse_json(raw) or {}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI extraction failed: {str(e)[:100]}")

    if not parsed:
        raise HTTPException(status_code=422, detail="Could not extract structured data from your message")

    # ── Action targets: return extracted params, don't save to DB ──
    if target in ("loan_prep", "bundle", "form_fill"):
        return {"target": target, "saved": False, "params": parsed}

    # Save to the appropriate collection
    record_id = str(uuid.uuid4())
    now = now_iso()

    if target == "profile":
        # Merge extracted fields into the user's existing profile
        profile = user.get("profile", {}) or {}
        for section, fields in parsed.items():
            if not isinstance(fields, dict):
                continue
            if section not in profile:
                profile[section] = {}
            profile[section].update({k: v for k, v in fields.items() if v})
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"profile": profile, "updated_at": now}}
        )
        return {"target": "profile", "saved": True, "profile": profile}

    elif target == "life_event":
        event_key = parsed.get("event", "other")
        ev = LIFE_EVENTS.get(event_key)
        title = ev["title"] if ev else parsed.get("event", "Life Event")
        doc = {
            "user_id": user["user_id"],
            "event": event_key,
            "title": title,
            "checklist": [],
            "recommended_categories": ev["categories"] if ev else [],
            "updated_at": now,
        }
        await db.life_event_trackers.update_one(
            {"user_id": user["user_id"], "event": event_key},
            {"$set": doc, "$setOnInsert": {"created_at": now}},
            upsert=True,
        )
        return {"target": "life_event", "saved": True, "event": event_key, "title": title}

    else:
        # investment, insurance, contact — insert a new record
        record = {id_field: record_id, "user_id": user["user_id"], "created_at": now}
        record.update({k: v for k, v in parsed.items() if v is not None})
        await collection.insert_one(dict(record))
        record.pop("_id", None)
        return {"target": target, "saved": True, "record": record}


# ---------------- AI-powered UI translation ----------------
class TranslateBody(BaseModel):
    language: str
    language_name: str  # e.g. "Hindi"
    keys: dict  # {"key": "English text", ...}


@router.post("/i18n/translate")
async def translate_ui(body: TranslateBody, user: dict = Depends(get_current_user)):
    """
    Translate UI keys into the target language using AI.
    Caches results in MongoDB so repeated requests are instant.
    Returns {"language": "hi", "translations": {"key": "translated text", ...}}
    """
    if not body.keys:
        return {"language": body.language, "translations": {}}

    # Check cache
    cached = await db.i18n_cache.find_one({"language": body.language}, {"_id": 0})
    if cached and cached.get("translations"):
        # Return cached translations for all requested keys
        cached_tr = cached["translations"]
        result = {}
        missing = {}
        for k, v in body.keys.items():
            if k in cached_tr:
                result[k] = cached_tr[k]
            else:
                missing[k] = v
        if not missing:
            return {"language": body.language, "translations": result}
        # Translate only missing keys
        body.keys = missing

    # Build a single batch translation prompt — translate in chunks of 20 to avoid AI timeout
    import json as _json
    all_keys = list(body.keys.items())
    chunk_size = 20
    parsed = {}
    for i in range(0, len(all_keys), chunk_size):
        chunk = dict(all_keys[i:i + chunk_size])
        keys_json = _json.dumps(chunk, ensure_ascii=False)
        system = (
            f"You are a professional UI translator. Translate the following JSON object of UI strings "
            f"into {body.language_name}. Keep the same JSON keys. Translate ONLY the values. "
            f"Return ONLY valid JSON with the same keys. Do not add any explanation. "
            f"Preserve any placeholders like {{name}} or %s. Keep brand names like 'Everkin' untranslated."
        )
        try:
            chat = ai.make_chat(f"i18n_{uuid.uuid4().hex}", system, "yolo")
            raw = await ai.complete(chat, f"Translate these UI strings to {body.language_name}:\n{keys_json}")
            chunk_parsed = ai.parse_json(raw) or {}
            parsed.update(chunk_parsed)
        except Exception:
            pass  # continue with next chunk even if one fails

    # Merge with existing cache
    existing = cached.get("translations", {}) if cached else {}
    existing.update({k: v for k, v in parsed.items() if v})
    await db.i18n_cache.update_one(
        {"language": body.language},
        {"$set": {"translations": existing, "updated_at": now_iso()}},
        upsert=True,
    )

    # Return translations for the requested keys (fall back to English)
    result = {}
    for k in body.keys:
        result[k] = existing.get(k, body.keys[k])
    return {"language": body.language, "translations": result}


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


# ── Web Search proxy (for mobile + web app — avoids CORS) ──
class WebSearchBody(BaseModel):
    query: str
    max_results: int = 5
    safe_search: str = "moderate"


@router.post("/web/search")
async def web_search(body: WebSearchBody):
    """Proxy web search requests. Uses DuckDuckGo Instant Answer API + HTML scrape fallback.
    No API key required."""
    import urllib.request
    import urllib.parse
    import html

    query = body.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="No query provided")

    results = []

    # 1. Try DuckDuckGo Instant Answer API
    try:
        ddg_url = f"https://api.duckduckgo.com/?q={urllib.parse.quote(query)}&format=json&no_html=1&no_redirect=1&skip_disambig=1"
        req = urllib.request.Request(ddg_url, headers={"User-Agent": "Everkin/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())

        if data.get("AbstractText"):
            results.append({
                "title": data.get("Heading", query),
                "snippet": data["AbstractText"],
                "url": data.get("AbstractURL", ""),
                "source": data.get("AbstractSource", "DuckDuckGo"),
            })

        for topic in (data.get("RelatedTopics") or [])[:body.max_results - len(results)]:
            if isinstance(topic, dict) and topic.get("Text") and topic.get("FirstURL"):
                results.append({
                    "title": topic["Text"].split(" - ")[0][:120],
                    "snippet": topic["Text"],
                    "url": topic["FirstURL"],
                    "source": "DuckDuckGo",
                })
    except Exception as e:
        print(f"DDG search error: {e}")

    # 2. If DDG didn't return enough, try DuckDuckGo HTML scrape
    if len(results) < body.max_results:
        try:
            html_url = f"https://html.duckduckgo.com/html/?q={urllib.parse.quote(query)}"
            req = urllib.request.Request(html_url, headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                raw = resp.read().decode("utf-8", errors="replace")

            # Parse result links and snippets from HTML
            import re as _re
            link_pattern = _re.compile(r'<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>', _re.DOTALL)
            snippet_pattern = _re.compile(r'<a[^>]+class="result__snippet"[^>]*>(.*?)</a>', _re.DOTALL)

            links = link_pattern.findall(raw)
            snippets = snippet_pattern.findall(raw)

            for i, (url, title) in enumerate(links):
                if len(results) >= body.max_results:
                    break
                # Clean URL (DuckDuckGo wraps in redirect)
                if "uddg=" in url:
                    from urllib.parse import parse_qs, urlparse
                    parsed = urlparse(url)
                    qs = parse_qs(parsed.query)
                    url = qs.get("uddg", [url])[0]

                title_clean = _re.sub(r"<[^>]+>", "", title).strip()
                snippet_clean = _re.sub(r"<[^>]+>", "", snippets[i]).strip() if i < len(snippets) else ""
                snippet_clean = html.unescape(snippet_clean)

                if title_clean:
                    results.append({
                        "title": html.unescape(title_clean),
                        "snippet": snippet_clean[:300],
                        "url": url,
                        "source": "DuckDuckGo",
                    })
        except Exception as e:
            print(f"DDG HTML scrape error: {e}")

    # 3. If still no results, try Wikipedia API
    if not results:
        try:
            wiki_url = f"https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={urllib.parse.quote(query)}&format=json&srlimit={body.max_results}"
            req = urllib.request.Request(wiki_url, headers={"User-Agent": "Everkin/1.0"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode())

            for item in data.get("query", {}).get("search", []):
                results.append({
                    "title": item.get("title", ""),
                    "snippet": _re.sub(r"<[^>]+>", "", item.get("snippet", ""))[:300],
                    "url": f"https://en.wikipedia.org/wiki/{urllib.parse.quote(item.get('title', ''))}",
                    "source": "Wikipedia",
                })
        except Exception as e:
            print(f"Wikipedia search error: {e}")

    return {"query": query, "results": results[:body.max_results]}
