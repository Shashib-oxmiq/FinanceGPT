import { useState } from "react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { Page, PageHeader } from "../components/Page";
import { FileText, Sparkle } from "@phosphor-icons/react";
import SmartAddBar from "../components/SmartAddBar";
import PanelChat from "../components/PanelChat";
import { useLanguage } from "../contexts/LanguageContext";

const CONF_COLOR = {
  high: "text-accent", medium: "text-primary", low: "text-[hsl(var(--warning))]", missing: "text-destructive",
};

export default function FormFiller() {
  const { t } = useLanguage();
  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const fill = async () => {
    if (!title || !content) return toast.error("Add a form title and fields");
    setBusy(true);
    try {
      const { data } = await api.post("/forms/fill", { form_title: title, form_content: content, purpose });
      setResult(data.result);
    } catch { toast.error("Could not generate form"); }
    finally { setBusy(false); }
  };

  return (
    <Page>
      <PageHeader
        testid="forms-header"
        title={t("page.forms.title")}
        subtitle={t("page.forms.subtitle")}
      />

      <SmartAddBar
        target="form_fill"
        onResult={(params) => {
          if (params.form_title) setTitle(params.form_title);
          if (params.purpose) setPurpose(params.purpose);
          if (params.form_content) setContent(params.form_content);
          toast.info("Form details filled by AI — review and click Generate");
        }}
      />

      <PanelChat
        contextLabel="Form Filler"
        systemHint="The user is on the Smart Form Filler page. Help them understand what forms they might need, what fields those forms typically require, and answer questions about form filling, their profile data, and document requirements."
        storageKey="panel_chat_form_filler"
      />

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="border border-border rounded-2xl p-6 bg-card">
          <h3 className="font-heading text-lg font-bold mb-4">{t("section.target_form")}</h3>
          <div className="space-y-3">
            <div>
              <label className="text-[11px] tracking-[0.1em] uppercase text-muted-foreground">Form title</label>
              <input value={title} data-testid="form-title" onChange={(e) => setTitle(e.target.value)} placeholder="e.g. DS-160 Visa Application" className="mt-1 w-full bg-background border border-input rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="text-[11px] tracking-[0.1em] uppercase text-muted-foreground">Purpose</label>
              <input value={purpose} data-testid="form-purpose" onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. US tourist visa" className="mt-1 w-full bg-background border border-input rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="text-[11px] tracking-[0.1em] uppercase text-muted-foreground">Form fields / content</label>
              <textarea value={content} data-testid="form-content" onChange={(e) => setContent(e.target.value)} rows={10} placeholder={"Paste field labels, one per line:\nFull name\nDate of birth\nPassport number\nHome address\n..."} className="mt-1 w-full bg-background border border-input rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
            </div>
            <button onClick={fill} disabled={busy} data-testid="generate-form" className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity disabled:opacity-60">
              <Sparkle size={16} weight="duotone" /> {busy ? t("button.filling") : t("button.generate")}
            </button>
          </div>
        </div>

        <div className="border border-border rounded-2xl p-6 bg-card" data-testid="form-preview">
          <h3 className="font-heading text-lg font-bold mb-4 flex items-center gap-2"><FileText size={18} weight="duotone" className="text-primary" /> {result?.form_title || "Digital copy preview"}</h3>
          {!result ? (
            <p className="text-sm text-muted-foreground">Your pre-filled form will appear here.</p>
          ) : (
            <div className="space-y-3">
              {result.notes && <p className="text-xs text-muted-foreground border border-border rounded-xl p-3 bg-secondary/40">{result.notes}</p>}
              {(result.fields || []).map((f, i) => (
                <div key={i} data-testid={`filled-field-${i}`}>
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] tracking-[0.1em] uppercase text-muted-foreground">{f.label}</label>
                    <span className={`text-[10px] uppercase tracking-wider ${CONF_COLOR[f.confidence] || "text-muted-foreground"}`}>{f.confidence}</span>
                  </div>
                  <input readOnly value={f.value || ""} placeholder="— not on file —" className="mt-1 w-full bg-background border border-input rounded-xl px-3 py-2 text-sm" />
                  {f.source && <p className="text-[10px] text-muted-foreground mt-0.5">source: {f.source}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}
