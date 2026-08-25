import io
import os
import json
import uuid
import zipfile
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Header, Query, Response
from fastapi.responses import Response as FastResponse
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel
from typing import Optional, List

from deps import db, get_current_user, INSURANCE_FIELDS, INSURANCE_TYPES
import storage
import ai

router = APIRouter(prefix="/api")


def now_iso():
    return datetime.now(timezone.utc).isoformat()


# ---------------- Insurance ----------------
class InsuranceBody(BaseModel):
    policy_type: str
    provider: str
    policy_number: Optional[str] = ""
    sum_assured: Optional[str] = ""
    premium_amount: Optional[str] = ""
    premium_frequency: Optional[str] = ""
    start_date: Optional[str] = ""
    maturity_date: Optional[str] = ""
    nominee_name: Optional[str] = ""
    nominee_relationship: Optional[str] = ""
    riders: Optional[str] = ""
    claim_contact: Optional[str] = ""
    agent_contact: Optional[str] = ""
    notes: Optional[str] = ""


@router.get("/insurance/meta")
async def insurance_meta():
    return {"types": INSURANCE_TYPES, "fields": INSURANCE_FIELDS}


@router.post("/insurance")
async def add_insurance(body: InsuranceBody, user: dict = Depends(get_current_user)):
    policy = {"policy_id": str(uuid.uuid4()), "user_id": user["user_id"], "created_at": now_iso()}
    policy.update(body.model_dump())
    await db.insurance_policies.insert_one(dict(policy))
    policy.pop("_id", None)
    return policy


@router.get("/insurance")
async def list_insurance(user: dict = Depends(get_current_user)):
    return await db.insurance_policies.find(
        {"user_id": user["user_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)


class InsuranceUpdate(BaseModel):
    policy_type: Optional[str] = None
    provider: Optional[str] = None
    policy_number: Optional[str] = None
    sum_assured: Optional[str] = None
    premium_amount: Optional[str] = None
    premium_frequency: Optional[str] = None
    start_date: Optional[str] = None
    maturity_date: Optional[str] = None
    nominee_name: Optional[str] = None
    nominee_relationship: Optional[str] = None
    riders: Optional[str] = None
    claim_contact: Optional[str] = None
    agent_contact: Optional[str] = None
    notes: Optional[str] = None


@router.put("/insurance/{policy_id}")
async def update_insurance(policy_id: str, body: InsuranceUpdate, user: dict = Depends(get_current_user)):
    res = await db.insurance_policies.update_one(
        {"policy_id": policy_id, "user_id": user["user_id"]},
        {"$set": body.model_dump(exclude_unset=True)},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Policy not found")
    return await db.insurance_policies.find_one({"policy_id": policy_id}, {"_id": 0})


@router.delete("/insurance/{policy_id}")
async def delete_insurance(policy_id: str, user: dict = Depends(get_current_user)):
    await db.insurance_policies.delete_one({"policy_id": policy_id, "user_id": user["user_id"]})
    return {"ok": True}


class InsuranceAdviseBody(BaseModel):
    question: Optional[str] = ""


class PolicyAnalyzeBody(BaseModel):
    document_id: Optional[str] = None
    insurance_type: Optional[str] = "health"


@router.post("/insurance/analyze")
async def analyze_policy(body: PolicyAnalyzeBody, user: dict = Depends(get_current_user)):
    file_contents, temp_paths = [], []
    itype = body.insurance_type or "health"
    if body.document_id:
        doc = await db.documents.find_one(
            {"document_id": body.document_id, "user_id": user["user_id"], "is_deleted": False}, {"_id": 0}
        )
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
        data, ctype = await run_in_threadpool(storage.get_object, doc["storage_path"])
        fc, tmp = ai.make_file_content(doc.get("content_type") or ctype, data, doc["original_filename"])
        if fc:
            file_contents.append(fc)
            if tmp:
                temp_paths.append(tmp)

    system = (
        "You are an expert insurance advisor. Analyze the policy (attached document if provided, else "
        "use standard knowledge for the given insurance type) and return ONLY JSON: {"
        "\"policy_type\": str, \"insurer\": str, \"summary\": str, "
        "\"covered\": [{\"item\": str, \"conditions\": str}], "
        "\"not_covered\": [str], \"corner_cases\": [str], "
        "\"emergency_numbers\": [{\"label\": str, \"number\": str}], "
        "\"dos\": [str], \"donts\": [str], \"claim_steps\": [str]}. "
        "Focus on what is covered WITH its conditions/limits, clear exclusions, tricky corner cases "
        "(waiting periods, sub-limits, room-rent caps, pre-existing clauses, no-claim bonus, "
        "cashless vs reimbursement, nominee claim process). For emergency_numbers include the kind "
        "of numbers to call during an incident (insurer helpline/TPA, ambulance, police, roadside "
        "assistance) — use placeholders if unknown. dos/donts = what to do and what NOT to do during "
        "an incident (e.g. do inform insurer within X hours; don't admit liability, don't move the "
        "vehicle before photos, don't sign blank forms). Be practical and specific."
    )
    prompt = f"Insurance type: {itype}. Analyze the policy and return the JSON now."
    try:
        chat = ai.make_chat(f"polan_{uuid.uuid4().hex}", system, "gemini")
        raw = await ai.complete_with_files(chat, prompt, file_contents or None)
        parsed = ai.parse_json(raw)
    finally:
        for p in temp_paths:
            try:
                os.remove(p)
            except Exception:
                pass
    if not parsed:
        raise HTTPException(status_code=422, detail="Could not analyze this policy")
    await db.policy_analyses.insert_one({
        "analysis_id": str(uuid.uuid4()), "user_id": user["user_id"],
        "document_id": body.document_id, "insurance_type": itype,
        "result": parsed, "created_at": now_iso(),
    })
    return parsed


@router.post("/insurance/review")
async def review_insurance(body: InsuranceAdviseBody, user: dict = Depends(get_current_user)):
    policies = await db.insurance_policies.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(500)
    profile = user.get("profile", {}) or {}
    system = (
        "You are a meticulous insurance advisor and CA. Review the user's insurance portfolio for "
        "gaps, corner cases and next-of-kin readiness. Consider: missing nominees, under-insurance "
        "vs dependents, overlapping/duplicate cover, lapsed or maturing policies, missing claim "
        "contacts, riders worth adding, and whether a spouse could actually file a claim with the "
        "info on file. Return ONLY JSON: {\"health_score\": 0-100, \"summary\": str, "
        "\"gaps\": [str], \"recommendations\": [str], \"corner_cases\": [str]}."
    )
    prompt = (
        f"PROFILE: {json.dumps(profile)}\nPOLICIES: {json.dumps(policies)}\n"
        f"USER QUESTION: {body.question}\n\nReturn the JSON now."
    )
    chat = ai.make_chat(f"ins_{uuid.uuid4().hex}", system, "claude")
    raw = await ai.complete(chat, prompt)
    return ai.parse_json(raw) or {
        "health_score": 0, "summary": raw[:600], "gaps": [], "recommendations": [], "corner_cases": []
    }


# ---------------- Legacy / Next-of-Kin ----------------
class ContactBody(BaseModel):
    name: str
    relationship: str
    email: Optional[str] = ""
    phone: Optional[str] = ""
    access_level: Optional[str] = "full"  # full | financial | insurance
    notes: Optional[str] = ""


@router.post("/legacy/contacts")
async def add_contact(body: ContactBody, user: dict = Depends(get_current_user)):
    contact = {"contact_id": str(uuid.uuid4()), "user_id": user["user_id"], "created_at": now_iso()}
    contact.update(body.model_dump())
    await db.legacy_contacts.insert_one(dict(contact))
    contact.pop("_id", None)
    return contact


@router.get("/legacy/contacts")
async def list_contacts(user: dict = Depends(get_current_user)):
    return await db.legacy_contacts.find(
        {"user_id": user["user_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)


@router.delete("/legacy/contacts/{contact_id}")
async def delete_contact(contact_id: str, user: dict = Depends(get_current_user)):
    await db.legacy_contacts.delete_one({"contact_id": contact_id, "user_id": user["user_id"]})
    return {"ok": True}


async def _gather_legacy(user: dict):
    uid = user["user_id"]
    profile = user.get("profile", {}) or {}
    policies = await db.insurance_policies.find({"user_id": uid}, {"_id": 0}).to_list(500)
    contacts = await db.legacy_contacts.find({"user_id": uid}, {"_id": 0}).to_list(200)
    docs = await db.documents.find(
        {"user_id": uid, "is_deleted": False}, {"_id": 0, "storage_path": 0}
    ).to_list(2000)
    total_assured = 0.0
    for p in policies:
        try:
            total_assured += float(str(p.get("sum_assured", "0")).replace(",", "").replace("$", "").strip() or 0)
        except Exception:
            pass
    return profile, policies, contacts, docs, total_assured


@router.get("/legacy/pack")
async def legacy_pack(user: dict = Depends(get_current_user)):
    profile, policies, contacts, docs, total_assured = await _gather_legacy(user)
    return {
        "owner": {"name": user.get("name"), "email": user.get("email")},
        "profile": profile,
        "insurance": policies,
        "total_sum_assured": total_assured,
        "next_of_kin": contacts,
        "documents": docs,
        "document_count": len(docs),
        "policy_count": len(policies),
    }


def _build_handover_markdown(user, profile, policies, contacts, docs, total_assured) -> str:
    lines = []
    lines.append(f"# Legacy Handover Pack — {user.get('name','')}")
    lines.append(f"Owner email: {user.get('email','')}")
    lines.append(f"Generated: {now_iso()}")
    lines.append("\n> Confidential. Prepared so a spouse / next-of-kin can access and claim benefits.\n")

    lines.append("## Next of Kin / Trusted Contacts")
    if contacts:
        for c in contacts:
            lines.append(f"- **{c.get('name')}** ({c.get('relationship')}) — {c.get('email','')} {c.get('phone','')} | access: {c.get('access_level')}")
            if c.get("notes"):
                lines.append(f"  - Note: {c['notes']}")
    else:
        lines.append("- None recorded.")

    lines.append("\n## Insurance Policies")
    lines.append(f"Total sum assured on record: {total_assured:,.2f}")
    if policies:
        for p in policies:
            lines.append(f"\n### {p.get('provider','')} — {p.get('policy_type','')}")
            for f in ["policy_number", "sum_assured", "premium_amount", "premium_frequency",
                      "start_date", "maturity_date", "nominee_name", "nominee_relationship",
                      "riders", "claim_contact", "agent_contact", "notes"]:
                if p.get(f):
                    lines.append(f"- {f.replace('_',' ').title()}: {p[f]}")
    else:
        lines.append("- None recorded.")

    lines.append("\n## Personal & Financial Profile")
    for section, fields in (profile or {}).items():
        if not fields:
            continue
        lines.append(f"\n### {section.title()}")
        for k, v in fields.items():
            if v:
                lines.append(f"- {k.replace('_',' ').title()}: {v}")

    lines.append("\n## Documents on File")
    if docs:
        for d in docs:
            lines.append(f"- [{d.get('category')}] {d.get('original_filename')}")
    else:
        lines.append("- None uploaded.")

    lines.append("\n## How to Claim (General Steps)")
    lines.append("1. Locate the relevant policy above and contact the claim contact / insurer.")
    lines.append("2. Provide the death/claim certificate, policy number and nominee ID proof.")
    lines.append("3. Submit the nominee bank details for the payout.")
    lines.append("4. Use the documents in this pack as supporting evidence.")
    return "\n".join(lines)


@router.post("/legacy/export")
async def export_legacy(include_documents: bool = Query(True), user: dict = Depends(get_current_user)):
    profile, policies, contacts, docs, total_assured = await _gather_legacy(user)
    md = _build_handover_markdown(user, profile, policies, contacts, docs, total_assured)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("HANDOVER_SUMMARY.md", md)
        zf.writestr("legacy_data.json", json.dumps({
            "profile": profile, "insurance": policies, "next_of_kin": contacts,
            "total_sum_assured": total_assured,
        }, indent=2))
        if include_documents:
            full = await db.documents.find(
                {"user_id": user["user_id"], "is_deleted": False}, {"_id": 0}
            ).to_list(2000)
            for d in full:
                try:
                    data, _ = await run_in_threadpool(storage.get_object, d["storage_path"])
                    zf.writestr(f"documents/{d['category']}/{d['original_filename']}", data)
                except Exception:
                    continue
    buf.seek(0)
    return FastResponse(
        content=buf.getvalue(), media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="legacy_handover_pack.zip"'},
    )
