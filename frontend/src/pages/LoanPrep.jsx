import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { Page, PageHeader } from "../components/Page";
import Modal from "../components/Modal";
import { Bank, Sparkle, CheckCircle, XCircle, Copy, LockKey, ShareNetwork, CheckSquare, Square, MagnifyingGlass, FileText, ArrowLeft, Clock, CurrencyInr, MapPin, Buildings, FilePdf, Download, Spinner } from "@phosphor-icons/react";
import SmartAddBar from "../components/SmartAddBar";
import PanelChat from "../components/PanelChat";
import { useLanguage } from "../contexts/LanguageContext";

export default function LoanPrep() {
  const { t } = useLanguage();
  const [forms, setForms] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCat, setActiveCat] = useState("All");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [matchResult, setMatchResult] = useState(null);
  const [matching, setMatching] = useState(false);
  const [share, setShare] = useState(null);
  const [creating, setCreating] = useState(false);
  const [checkedDocs, setCheckedDocs] = useState(new Set());
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [showDocGen, setShowDocGen] = useState(false);
  const [docTemplates, setDocTemplates] = useState([]);
  const [selectedTpl, setSelectedTpl] = useState(null);
  const [tplForm, setTplForm] = useState({});
  const [genFormat, setGenFormat] = useState("pdf");

  const loadForms = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (activeCat !== "All") params.set("category", activeCat);
      if (search) params.set("q", search);
      const { data } = await api.get(`/forms?${params}`);
      setForms(data.forms);
      setCategories(data.categories);
    } catch { toast.error("Could not load forms"); }
  }, [activeCat, search]);

  useEffect(() => { loadForms(); }, [loadForms]);

  const openForm = async (formId) => {
    try {
      const { data } = await api.get(`/forms/${formId}`);
      setSelected(data);
      setMatchResult(null);
      setShare(null);
      setCheckedDocs(new Set());
    } catch { toast.error("Could not load form details"); }
  };

  const runMatch = async () => {
    if (!selected) return;
    setMatching(true);
    try {
      const { data } = await api.post(`/forms/${selected.id}/match`);
      setMatchResult(data);
      const pre = new Set(data.matched.map((m) => m.matched_document.document_id));
      setCheckedDocs(pre);
    } catch { toast.error("Could not match documents"); }
    finally { setMatching(false); }
  };

  const toggle = (id) => setCheckedDocs((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const createShare = async () => {
    if (checkedDocs.size === 0) return toast.error(t("page.select_at_least_one"));
    setCreating(true);
    try {
      const { data } = await api.post("/shares", { name: selected.name, document_ids: Array.from(checkedDocs), expiry_days: 15 });
      setShare(data);
      toast.success(t("loan.secure_share_created"));
    } catch { toast.error("Could not create share"); }
    finally { setCreating(false); }
  };

  const copy = (text, label) => { navigator.clipboard?.writeText(text); toast.success(`${label} copied`); };

  // ── PDF generation ──
  const generateChecklistPdf = async () => {
    if (!selected) return;
    setGeneratingPdf(true);
    try {
      const response = await api.post(
        "/documents/form-checklist",
        { form_id: selected.id, format: "pdf", user_name: "" },
        { responseType: "blob" }
      );
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${selected.name.replace(/\s+/g, "_")}_checklist.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success("Checklist PDF downloaded");
    } catch { toast.error("Could not generate PDF"); }
    finally { setGeneratingPdf(false); }
  };

  const openDocGen = async () => {
    if (docTemplates.length === 0) {
      try {
        const { data } = await api.get("/documents/templates");
        setDocTemplates(data.templates || []);
      } catch { toast.error("Could not load templates"); }
    }
    setShowDocGen(true);
  };

  const selectTpl = (tpl) => {
    setSelectedTpl(tpl);
    const initial = {};
    (tpl.fields || []).forEach((f) => { initial[f.key] = f.default || ""; });
    setTplForm(initial);
  };

  const setTplField = (k, v) => setTplForm((f) => ({ ...f, [k]: v }));

  const generateDoc = async () => {
    if (!selectedTpl) return;
    for (const f of (selectedTpl.fields || [])) {
      if (f.required && !tplForm[f.key]) { toast.error(`${f.label} is required`); return; }
    }
    try {
      const ext = genFormat === "pdf" ? "pdf" : "docx";
      const response = await api.post(
        "/documents/generate",
        { template_id: selectedTpl.id, format: genFormat, data: tplForm },
        { responseType: "blob" }
      );
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${selectedTpl.name.replace(/\s+/g, "_")}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success(`${selectedTpl.name} generated as ${genFormat.toUpperCase()}`);
      setSelectedTpl(null);
      setTplForm({});
    } catch { toast.error("Failed to generate document"); }
  };

  // ── Form detail view ─────────────────────────────────────────────────────
  if (selected) {
    const docs = selected.documents || [];
    return (
      <Page>
        <button onClick={() => setSelected(null)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft size={16} /> {t("common.back")}
        </button>

        <div className="border border-border rounded-2xl p-6 bg-card mb-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
              <FileText size={28} weight="duotone" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-heading text-xl font-bold">{selected.name}</h2>
              <p className="text-sm text-muted-foreground mt-1">{selected.description}</p>
              <div className="flex flex-wrap gap-3 mt-3">
                <span className="text-[11px] bg-secondary px-2.5 py-1 rounded-full flex items-center gap-1"><Buildings size={10} /> {selected.authority}</span>
                <span className="text-[11px] bg-secondary px-2.5 py-1 rounded-full flex items-center gap-1"><Clock size={10} /> {selected.processing_time}</span>
                <span className="text-[11px] bg-secondary px-2.5 py-1 rounded-full flex items-center gap-1"><CurrencyInr size={10} /> {selected.fees}</span>
                <span className="text-[11px] bg-primary/10 text-primary px-2.5 py-1 rounded-full">{selected.category}</span>
              </div>
              {selected.where_to_apply && (
                <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1"><MapPin size={11} /> {selected.where_to_apply}</p>
              )}
              {selected.online_url && (
                <a href={selected.online_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline mt-1 inline-block">Apply online →</a>
              )}
            </div>
          </div>
        </div>

        {/* Document checklist with vault matching */}
        <div className="border border-border rounded-2xl bg-card overflow-hidden mb-6">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h3 className="font-heading font-bold flex items-center gap-2">
              <CheckSquare size={18} weight="duotone" className="text-primary" /> {t("loan.checklist_title")}
              <span className="text-xs text-muted-foreground font-normal">({docs.length} {t("stat.documents").toLowerCase()})</span>
            </h3>
            <button onClick={runMatch} disabled={matching}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-50">
              {matching ? <Sparkle size={14} className="animate-spin" /> : <Sparkle size={14} weight="duotone" />}
              {matching ? t("page.analyzing") : t("button.ai_review")}
            </button>
          </div>

          {matchResult && (
            <div className="px-4 py-3 bg-primary/5 border-b border-border flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1.5 text-accent"><CheckCircle size={16} weight="fill" /> {matchResult.matched_count} {t("loan.have").toLowerCase()}</span>
              <span className="flex items-center gap-1.5 text-destructive"><XCircle size={16} weight="fill" /> {matchResult.missing_count} {t("loan.needed").toLowerCase()}</span>
            </div>
          )}

          {docs.map((doc, i) => {
            const matchedDoc = matchResult?.matched.find((m) => m.requirement.item === doc.item);
            const isMatched = !!matchedDoc;
            return (
              <div key={i} className="flex items-start gap-3 p-4 border-b border-border/60 last:border-0">
                <div className="mt-0.5 shrink-0">
                  {isMatched ? (
                    <CheckCircle size={18} weight="fill" className="text-accent" />
                  ) : (
                    <Square size={18} className="text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{doc.item}</p>
                  {doc.why && <p className="text-xs text-muted-foreground mt-0.5">{doc.why}</p>}
                  {matchedDoc && (
                    <p className="text-[11px] text-accent mt-1 flex items-center gap-1">
                      <CheckCircle size={10} weight="fill" /> {matchedDoc.matched_document.filename}
                    </p>
                  )}
                </div>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">{doc.category}</span>
              </div>
            );
          })}
        </div>

        {/* Generate documents */}
        <div className="border border-border rounded-2xl p-5 bg-card mb-6">
          <h3 className="font-heading text-lg font-bold flex items-center gap-2 mb-3"><FilePdf size={18} weight="duotone" className="text-primary" /> Generate Documents</h3>
          <div className="flex flex-wrap gap-3">
            <button onClick={generateChecklistPdf} disabled={generatingPdf}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-50">
              {generatingPdf ? <Spinner size={14} className="animate-spin" /> : <Download size={14} weight="duotone" />}
              {generatingPdf ? "Generating..." : "Download Checklist PDF"}
            </button>
            <button onClick={openDocGen}
              className="flex items-center gap-2 border border-border px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-secondary transition-colors">
              <FileText size={14} weight="duotone" /> Generate Legal Document
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-3">Generate a PDF checklist for this form, or create a legal document (rental agreement, NDA, will, etc.) with your details pre-filled.</p>
        </div>

        {/* Secure share */}
        <div className="border border-border rounded-2xl p-5 bg-card">
          <h3 className="font-heading text-lg font-bold flex items-center gap-2 mb-3"><ShareNetwork size={18} weight="duotone" className="text-primary" /> {t("section.secure_share")}</h3>
          <p className="text-sm text-muted-foreground mb-4">Create a password-protected share link with your matched documents for submission.</p>
          {share ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input readOnly value={`${window.location.origin}${share.path}`} className="flex-1 bg-background border border-border rounded-xl px-3 py-2 text-sm" />
                <button onClick={() => copy(`${window.location.origin}${share.path}`, "Link")} className="p-2 border border-border rounded-xl hover:bg-secondary"><Copy size={16} /></button>
              </div>
              <div className="flex items-center gap-2">
                <input readOnly value={share.password} className="flex-1 bg-background border border-border rounded-xl px-3 py-2 text-sm font-mono" />
                <button onClick={() => copy(share.password, t("page.password"))} className="p-2 border border-border rounded-xl hover:bg-secondary"><Copy size={16} /></button>
              </div>
            </div>
          ) : (
            <button onClick={createShare} disabled={creating || checkedDocs.size === 0}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-50">
              {creating ? <Sparkle size={16} className="animate-spin" /> : <LockKey size={16} weight="duotone" />}
              {creating ? t("button.creating") : t("button.create_secure_share")} ({checkedDocs.size})
            </button>
          )}
        </div>

        {/* Document generation modal */}
        <Modal open={showDocGen} onClose={() => { setShowDocGen(false); setSelectedTpl(null); setTplForm({}); }} title={selectedTpl ? selectedTpl.name : "Generate Legal Document"} testid="doc-gen-modal">
          {!selectedTpl ? (
            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              <p className="text-sm text-muted-foreground mb-3">Pick a template, fill in the details, and download as PDF or DOCX.</p>
              {docTemplates.map((tpl) => (
                <button key={tpl.id} onClick={() => selectTpl(tpl)} className="w-full flex items-start gap-3 p-3 border border-border rounded-xl text-left hover:border-primary/40 hover:bg-secondary/30 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0"><FileText size={16} weight="duotone" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{tpl.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{tpl.description}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{tpl.field_count} fields</p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-3 max-h-[45vh] overflow-y-auto pr-2">
                {(selectedTpl.fields || []).map((f) => (
                  <div key={f.key} className={f.type === "textarea" ? "md:col-span-2" : ""}>
                    <label className="text-[11px] tracking-[0.1em] uppercase text-muted-foreground">{f.label}{f.required && <span className="text-destructive ml-0.5">*</span>}</label>
                    {f.type === "textarea" ? (
                      <textarea value={tplForm[f.key] || ""} onChange={(e) => setTplField(f.key, e.target.value)} placeholder={f.placeholder} rows={3} className="mt-1 w-full bg-background border border-input rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
                    ) : (
                      <input value={tplForm[f.key] || ""} onChange={(e) => setTplField(f.key, e.target.value)} placeholder={f.placeholder} type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} className="mt-1 w-full bg-background border border-input rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                    )}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-3 pt-2 border-t border-border">
                <span className="text-xs text-muted-foreground">Format:</span>
                <button onClick={() => setGenFormat("pdf")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium ${genFormat === "pdf" ? "bg-primary text-primary-foreground" : "border border-border hover:bg-secondary"}`}><FilePdf size={14} weight="duotone" /> PDF</button>
                <button onClick={() => setGenFormat("docx")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium ${genFormat === "docx" ? "bg-primary text-primary-foreground" : "border border-border hover:bg-secondary"}`}>DOCX</button>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => { setSelectedTpl(null); setTplForm({}); }} className="px-4 py-2.5 rounded-xl border border-border text-sm hover:bg-secondary">Back</button>
                <button onClick={generateDoc} className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 flex items-center gap-2"><Download size={14} weight="duotone" /> Generate & Download</button>
              </div>
              <p className="text-[10px] text-muted-foreground text-center">Computer-generated document. Review before signing. Consult a legal professional.</p>
            </div>
          )}
        </Modal>
      </Page>
    );
  }

  // ── Forms catalog view ──────────────────────────────────────────────────
  return (
    <Page>
      <PageHeader
        testid="loan-prep-header"
        title={t("page.loans.title")}
        subtitle={t("page.loans.subtitle")}
      />

      <SmartAddBar target="loan_prep" onAdded={() => {}} />

      <PanelChat
        contextLabel={t("page.loans.title")}
        systemHint="The user is on the Document Preparation page. Help them understand which forms they need, what documents are required, and guide them through the process."
        storageKey="panel_chat_loan_prep"
      />

      {/* Search bar */}
      <div className="relative mb-4">
        <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search 100 Indian forms — Aadhaar, PAN, GST, Home Loan, Passport…"
          className="w-full bg-background border border-border rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none focus:border-primary"
        />
      </div>

      {/* Category chips */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setActiveCat("All")}
          className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${activeCat === "All" ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-secondary/80"}`}
        >{t("page.all")}</button>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCat(cat)}
            className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${activeCat === cat ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-secondary/80"}`}
          >{cat}</button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground mb-4">{forms.length} forms found</p>

      {/* Forms grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {forms.map((form) => (
          <button
            key={form.id}
            onClick={() => openForm(form.id)}
            className="text-left border border-border rounded-2xl p-4 bg-card hover:border-primary/40 hover:shadow-sm transition-all"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <FileText size={20} weight="duotone" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm truncate">{form.name}</p>
                <p className="text-[11px] text-muted-foreground truncate mt-0.5">{form.authority}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className="text-[9px] bg-secondary px-2 py-0.5 rounded-full">{form.category}</span>
                  <span className="text-[9px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">{form.doc_count} docs</span>
                </div>
              </div>
            </div>
            {form.processing_time && (
              <p className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1"><Clock size={9} /> {form.processing_time}</p>
            )}
          </button>
        ))}
      </div>

      {forms.length === 0 && (
        <div className="border border-dashed border-border rounded-2xl p-12 text-center">
          <MagnifyingGlass size={32} weight="duotone" className="text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No forms found. Try a different search or category.</p>
        </div>
      )}
    </Page>
  );
}