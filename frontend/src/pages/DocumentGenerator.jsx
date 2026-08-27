import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, API } from "../lib/api";
import { Page, PageHeader } from "../components/Page";
import Modal from "../components/Modal";
import { FileText, Download, ArrowLeft, Spinner, FilePdf, FileDoc } from "@phosphor-icons/react";
import SmartAddBar from "../components/SmartAddBar";
import PanelChat from "../components/PanelChat";
import { useLanguage } from "../contexts/LanguageContext";

export default function DocumentGenerator() {
  const { t } = useLanguage();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [formData, setFormData] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [format, setFormat] = useState("pdf");

  useEffect(() => {
    api.get("/documents/templates").then(({ data }) => {
      setTemplates(data.templates || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const openTemplate = (tpl) => {
    setSelectedTemplate(tpl);
    const initial = {};
    (tpl.fields || []).forEach((f) => {
      initial[f.key] = f.default || "";
    });
    setFormData(initial);
    setShowForm(true);
  };

  const setField = (key, val) => setFormData((d) => ({ ...d, [key]: val }));

  const generate = async () => {
    // Validate required fields
    for (const f of (selectedTemplate?.fields || [])) {
      if (f.required && !formData[f.key]) {
        toast.error(`${f.label} is required`);
        return;
      }
    }
    setGenerating(true);
    try {
      const filename = selectedTemplate.name.replace(/\s+/g, "_");
      const ext = format === "pdf" ? "pdf" : "docx";
      const response = await api.post(
        "/documents/generate",
        {
          template_id: selectedTemplate.id,
          format,
          data: formData,
        },
        { responseType: "blob" }
      );
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filename}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success(`${selectedTemplate.name} generated as ${format.toUpperCase()}`);
      setShowForm(false);
    } catch (e) {
      toast.error("Failed to generate document");
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <Page>
        <PageHeader title="Document Generator" subtitle="Create legal documents from templates" />
        <div className="flex items-center justify-center p-16">
          <Spinner size={32} className="animate-spin text-muted-foreground" />
        </div>
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        title="Document Generator"
        subtitle="Create professional legal documents from templates — PDF & DOCX"
      />

      {templates.length === 0 ? (
        <div className="border border-dashed border-border rounded-2xl p-16 text-center">
          <FileText size={40} weight="duotone" className="text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No templates available</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((tpl) => (
            <button
              key={tpl.id}
              onClick={() => openTemplate(tpl)}
              className="border border-border rounded-2xl p-5 text-left hover:border-primary/40 hover:shadow-md transition-all bg-card group cursor-pointer"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <FileText size={20} weight="duotone" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm">{tpl.name}</p>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{tpl.description}</p>
                  <p className="text-[10px] text-muted-foreground mt-2">{tpl.field_count} fields</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Template form modal */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={selectedTemplate?.name || "Generate Document"}
        testid="doc-gen-form"
      >
        {selectedTemplate && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{selectedTemplate.description}</p>

            <div className="grid md:grid-cols-2 gap-3 max-h-[50vh] overflow-y-auto pr-2">
              {(selectedTemplate.fields || []).map((f) => (
                <div key={f.key} className={f.type === "textarea" ? "md:col-span-2" : ""}>
                  <label className="text-[11px] tracking-[0.1em] uppercase text-muted-foreground">
                    {f.label}
                    {f.required && <span className="text-destructive ml-0.5">*</span>}
                  </label>
                  {f.type === "textarea" ? (
                    <textarea
                      value={formData[f.key] || ""}
                      onChange={(e) => setField(f.key, e.target.value)}
                      placeholder={f.placeholder}
                      rows={3}
                      className="mt-1 w-full bg-background border border-input rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                    />
                  ) : (
                    <input
                      value={formData[f.key] || ""}
                      onChange={(e) => setField(f.key, e.target.value)}
                      placeholder={f.placeholder}
                      type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                      className="mt-1 w-full bg-background border border-input rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  )}
                </div>
              ))}
            </div>

            {/* Format selector */}
            <div className="flex items-center gap-3 pt-2 border-t border-border">
              <span className="text-xs text-muted-foreground">Output format:</span>
              <button
                onClick={() => setFormat("pdf")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${
                  format === "pdf" ? "bg-primary text-primary-foreground" : "border border-border hover:bg-secondary"
                }`}
              >
                <FilePdf size={14} weight="duotone" /> PDF
              </button>
              <button
                onClick={() => setFormat("docx")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${
                  format === "docx" ? "bg-primary text-primary-foreground" : "border border-border hover:bg-secondary"
                }`}
              >
                <FileDoc size={14} weight="duotone" /> DOCX
              </button>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2.5 rounded-xl border border-border text-sm hover:bg-secondary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={generate}
                disabled={generating}
                className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-2 disabled:opacity-50"
              >
                {generating ? (
                  <><Spinner size={14} className="animate-spin" /> Generating...</>
                ) : (
                  <><Download size={14} weight="duotone" /> Generate & Download</>
                )}
              </button>
            </div>

            <p className="text-[10px] text-muted-foreground text-center pt-1">
              This is a computer-generated document. Please review carefully before signing. Consult a legal professional.
            </p>
          </div>
        )}
      </Modal>

      <SmartAddBar />
      <PanelChat systemPrompt="You are helping the user with document generation. They can create legal documents like rental agreements, NDAs, wills, and more from the Document Generator page." />
    </Page>
  );
}