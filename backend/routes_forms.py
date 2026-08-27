"""
Forms catalog routes — 100 Indian government/financial forms database.
Endpoints:
  GET  /api/forms                    → list all forms (with category filter + search)
  GET  /api/forms/{form_id}          → full detail for one form
  POST /api/forms/{form_id}/match    → match form's required docs against user's vault
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional

from deps import db, get_current_user
from forms_data import FORMS, FORM_CATEGORIES

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")


@router.get("/forms")
async def list_forms(
    category: Optional[str] = Query(None, description="Filter by category"),
    q: Optional[str] = Query(None, description="Search query"),
):
    """List all forms, optionally filtered by category or search query."""
    results = FORMS
    if category and category != "All":
        results = [f for f in results if f.get("category") == category]
    if q:
        ql = q.lower()
        results = [
            f for f in results
            if ql in f.get("name", "").lower()
            or ql in f.get("description", "").lower()
            or ql in f.get("authority", "").lower()
            or ql in f.get("category", "").lower()
        ]
    # Return summary (no documents array to keep payload small)
    return {
        "count": len(results),
        "categories": FORM_CATEGORIES,
        "forms": [
            {
                "id": f["id"],
                "name": f["name"],
                "category": f["category"],
                "authority": f.get("authority", ""),
                "description": f.get("description", ""),
                "fees": f.get("fees", ""),
                "processing_time": f.get("processing_time", ""),
                "doc_count": len(f.get("documents", [])),
            }
            for f in results
        ],
    }


@router.get("/forms/{form_id}")
async def get_form(form_id: str):
    """Get full detail for a single form, including the complete document checklist."""
    for f in FORMS:
        if f["id"] == form_id:
            return f
    raise HTTPException(status_code=404, detail=f"Form '{form_id}' not found")


@router.post("/forms/{form_id}/match")
async def match_form_documents(form_id: str, user: dict = Depends(get_current_user)):
    """
    Match a form's required documents against the user's uploaded vault documents.
    Returns which documents the user already has vs. which are missing.
    """
    form = None
    for f in FORMS:
        if f["id"] == form_id:
            form = f
            break
    if not form:
        raise HTTPException(status_code=404, detail=f"Form '{form_id}' not found")

    # Get user's vault documents
    docs = await db.documents.find(
        {"user_id": user["user_id"]}, {"_id": 0}
    ).to_list(500)

    # Build a simple keyword matcher
    doc_keywords = []
    for d in docs:
        fname = (d.get("original_filename") or "").lower()
        cat = (d.get("category") or "").lower()
        doc_keywords.append({
            "document_id": d.get("document_id", ""),
            "filename": d.get("original_filename", ""),
            "category": d.get("category", ""),
            "keywords": fname + " " + cat,
        })

    matched = []
    missing = []
    for req in form.get("documents", []):
        item_text = (req.get("item") or "").lower()
        # Simple keyword matching
        found = None
        for dk in doc_keywords:
            # Check if any significant word from the required item appears in the doc
            words = [w for w in item_text.split() if len(w) > 3]
            if any(w in dk["keywords"] for w in words):
                found = dk
                break
        if found:
            matched.append({
                "requirement": req,
                "matched_document": found,
            })
        else:
            missing.append(req)

    return {
        "form_id": form_id,
        "form_name": form.get("name", ""),
        "total_documents": len(form.get("documents", [])),
        "matched_count": len(matched),
        "missing_count": len(missing),
        "matched": matched,
        "missing": missing,
    }