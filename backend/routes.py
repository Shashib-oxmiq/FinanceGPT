import io
import os
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
    return {"attachment_id": att["attachment_id"], "filename": att["filename"], "content_type": content_type, "size": att["size"]}


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
    # File attachments are only supported by Gemini; route multimodal messages accordingly.
    if file_contents:
        model_key = "gemini"
    system = build_system_prompt(user, history)
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
        if full.strip():
            await db.messages.insert_one({
                "message_id": str(uuid.uuid4()),
                "conversation_id": conversation_id,
                "user_id": user["user_id"],
                "role": "assistant",
                "content": full,
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
@router.post("/documents/upload")
async def upload_document(
    file: UploadFile = File(...),
    category: str = Form("other"),
    note: str = Form(""),
    user: dict = Depends(get_current_user),
):
    if category not in DOC_CATEGORIES:
        category = "other"
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else "bin"
    path = f"{APP_NAME}/uploads/{user['user_id']}/{uuid.uuid4().hex}.{ext}"
    data = await file.read()
    content_type = file.content_type or storage.MIME_TYPES.get(ext, "application/octet-stream")
    result = await run_in_threadpool(storage.put_object, path, data, content_type)
    doc = {
        "document_id": str(uuid.uuid4()),
        "user_id": user["user_id"],
        "storage_path": result["path"],
        "original_filename": file.filename,
        "content_type": content_type,
        "size": result.get("size", len(data)),
        "category": category,
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
    await db.documents.update_one(
        {"document_id": document_id, "user_id": user["user_id"]}, {"$set": {"is_deleted": True}}
    )
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
