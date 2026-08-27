"""
API routes for document generation (PDF/DOCX from templates).
Includes: legal document templates + form checklist PDF generation.
"""
import io
import logging
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel
from typing import Optional, Dict, Any

from doc_templates import TEMPLATES, generate_pdf, generate_docx, get_template_list

# Lazy import of deps (for db access in form checklist generation)
db = None
def _get_db():
    global db
    if db is None:
        from deps import db as _d
        db = _d
    return db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/documents", tags=["documents"])


class GenerateRequest(BaseModel):
    template_id: str
    format: str = "pdf"  # "pdf" or "docx"
    data: Dict[str, Any] = {}


@router.get("/templates")
async def list_templates():
    """List all available document templates with their fields."""
    return {"templates": get_template_list()}


@router.get("/templates/{template_id}")
async def get_template(template_id: str):
    """Get a single template's details and fields."""
    if template_id not in TEMPLATES:
        raise HTTPException(status_code=404, detail="Template not found")
    t = TEMPLATES[template_id]
    return {"id": template_id, "name": t["name"], "description": t["description"], "fields": t["fields"]}


@router.post("/generate")
async def generate_document(req: GenerateRequest):
    """Generate a PDF or DOCX document from a template."""
    if req.template_id not in TEMPLATES:
        raise HTTPException(status_code=404, detail=f"Template '{req.template_id}' not found")

    template = TEMPLATES[req.template_id]

    # Validate required fields
    for f in template["fields"]:
        if f.get("required") and not req.data.get(f["key"]):
            raise HTTPException(status_code=422, detail=f"Missing required field: {f['label']}")

    try:
        if req.format.lower() == "pdf":
            content = generate_pdf(req.template_id, req.data)
            filename = f"{template['name'].replace(' ', '_')}.pdf"
            media_type = "application/pdf"
        elif req.format.lower() == "docx":
            content = generate_docx(req.template_id, req.data)
            filename = f"{template['name'].replace(' ', '_')}.docx"
            media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        else:
            raise HTTPException(status_code=400, detail="Format must be 'pdf' or 'docx'")

        return StreamingResponse(
            io.BytesIO(content),
            media_type=media_type,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Document generation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")


# ── Form checklist PDF generation ───────────────────────────────────────────

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib import colors


class FormChecklistRequest(BaseModel):
    form_id: str
    format: str = "pdf"
    user_name: str = ""
    notes: str = ""


@router.post("/form-checklist")
async def generate_form_checklist(req: FormChecklistRequest):
    """Generate a PDF checklist for an Indian government form (from the 100 forms database)."""
    from forms_data import FORMS

    form = None
    for f in FORMS:
        if str(f["id"]) == str(req.form_id):
            form = f
            break
    if not form:
        raise HTTPException(status_code=404, detail=f"Form {req.form_id} not found")

    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="ChkTitle", parent=styles["Title"], fontSize=16, spaceAfter=16, alignment=TA_CENTER, fontName="Helvetica-Bold"))
    styles.add(ParagraphStyle(name="ChkSub", parent=styles["Normal"], fontSize=10, spaceAfter=12, alignment=TA_CENTER, textColor=colors.grey))
    styles.add(ParagraphStyle(name="ChkBody", parent=styles["Normal"], fontSize=11, leading=16, spaceAfter=8))
    styles.add(ParagraphStyle(name="ChkHeading", parent=styles["Heading2"], fontSize=12, spaceBefore=14, spaceAfter=8, fontName="Helvetica-Bold"))

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=1*inch, rightMargin=1*inch, topMargin=1*inch, bottomMargin=1*inch)
    story = []

    story.append(Paragraph(form["name"], styles["ChkTitle"]))
    story.append(Paragraph(f"Category: {form['category']} | Authority: {form['authority']}", styles["ChkSub"]))
    if req.user_name:
        story.append(Paragraph(f"Applicant: <b>{req.user_name}</b>", styles["ChkBody"]))
    story.append(Paragraph(f"Generated: {datetime.now().strftime('%d %B %Y')}", styles["ChkBody"]))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.grey))
    story.append(Spacer(1, 16))

    if form.get("description"):
        story.append(Paragraph(form["description"], styles["ChkBody"]))
        story.append(Spacer(1, 10))

    # Form details table
    story.append(Paragraph("Form Details", styles["ChkHeading"]))
    details = [
        ["Authority", form.get("authority", "")],
        ["Fees", form.get("fees", "")],
        ["Processing Time", form.get("processing_time", "")],
        ["Where to Apply", form.get("where_to_apply", "")],
    ]
    if form.get("online_url"):
        details.append(["Online URL", form["online_url"]])

    detail_data = [[Paragraph(f"<b>{k}</b>", styles["ChkBody"]), Paragraph(v, styles["ChkBody"])] for k, v in details]
    t = Table(detail_data, colWidths=[2*inch, 4.3*inch])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CCCCCC")),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F5F5F5")),
    ]))
    story.append(t)
    story.append(Spacer(1, 16))

    # Document checklist
    docs = form.get("documents", [])
    story.append(Paragraph(f"Document Checklist ({len(docs)} items)", styles["ChkHeading"]))

    chk_data = [
        [Paragraph("<b>#</b>", styles["ChkBody"]), Paragraph("<b>Document</b>", styles["ChkBody"]),
         Paragraph("<b>Why</b>", styles["ChkBody"]), Paragraph("<b>Category</b>", styles["ChkBody"]),
         Paragraph("<b>✓</b>", styles["ChkBody"])]
    ]
    for i, d in enumerate(docs, 1):
        chk_data.append([
            Paragraph(str(i), styles["ChkBody"]),
            Paragraph(d.get("item", ""), styles["ChkBody"]),
            Paragraph(d.get("why", ""), styles["ChkBody"]),
            Paragraph(d.get("category", ""), styles["ChkBody"]),
            Paragraph("☐", styles["ChkBody"]),
        ])

    chk_table = Table(chk_data, colWidths=[0.4*inch, 2.2*inch, 2.5*inch, 1.2*inch, 0.4*inch])
    chk_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CCCCCC")),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E8E8E8")),
    ]))
    story.append(chk_table)
    story.append(Spacer(1, 16))

    if req.notes:
        story.append(Paragraph("Notes", styles["ChkHeading"]))
        story.append(Paragraph(req.notes, styles["ChkBody"]))
        story.append(Spacer(1, 16))

    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.grey))
    story.append(Spacer(1, 10))
    story.append(Paragraph(
        "<i>Generated by Everkin. Please verify all requirements with the issuing authority before submission.</i>",
        ParagraphStyle("Disc", parent=styles["Normal"], fontSize=8, textColor=colors.grey, alignment=TA_CENTER)
    ))

    doc.build(story)
    buf.seek(0)
    content = buf.read()

    filename = f"{form['name'].replace(' ', '_')}_checklist.pdf"
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Chat-driven document generation ──────────────────────────────────────────

class ChatDocRequest(BaseModel):
    template_id: str
    format: str = "pdf"
    data: Dict[str, Any] = {}


@router.post("/chat-generate")
async def chat_generate_document(req: ChatDocRequest):
    """Generate a document from chat (AI markers). Returns the file content."""
    return await generate_document(GenerateRequest(template_id=req.template_id, format=req.format, data=req.data))