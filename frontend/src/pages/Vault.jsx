import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api, API } from "../lib/api";
import { Page, PageHeader } from "../components/Page";
import { UploadSimple, Trash, FileText, DownloadSimple, Folder } from "@phosphor-icons/react";
import { CATEGORY_LABELS as CAT_LABELS } from "../lib/categories";
import SmartAddBar from "../components/SmartAddBar";
import PanelChat from "../components/PanelChat";
import { useLanguage } from "../contexts/LanguageContext";

export default function Vault() {
  const { t } = useLanguage();
  const [docs, setDocs] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filter, setFilter] = useState("");
  const [uploadCat, setUploadCat] = useState("auto");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const fileRef = useRef(null);

  const load = () => {
    const q = filter ? `?category=${filter}` : "";
    api.get(`/documents${q}`).then(({ data }) => setDocs(data));
  };
  useEffect(() => {
    api.get("/documents/categories").then(({ data }) => setCategories(data.categories));
  }, []);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  const upload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    let ok = 0;
    let dups = 0;
    for (let i = 0; i < files.length; i++) {
      setProgress(`Uploading & classifying ${i + 1}/${files.length}…`);
      const fd = new FormData();
      fd.append("file", files[i]);
      fd.append("category", uploadCat);
      fd.append("auto_classify", uploadCat === "auto" ? "true" : "false");
      try {
        const { data } = await api.post("/documents/upload", fd);
        if (data.duplicate) {
          dups++;
          toast.warning(`⚠ "${data.existing_filename}" is already in your Vault — duplicate skipped`);
        } else {
          ok++;
        }
      } catch { /* continue with the rest */ }
    }
    setProgress("");
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    if (ok > 0 && dups === 0) toast.success(`${ok} document${ok !== 1 ? "s" : ""} uploaded`);
    else if (ok > 0 && dups > 0) toast.success(`${ok} uploaded, ${dups} duplicate${dups !== 1 ? "s" : ""} skipped`);
    else if (ok === 0 && dups > 0) toast.warning(`${dups} duplicate${dups !== 1 ? "s" : ""} detected — already in your Vault`);
    else toast.error(`${ok}/${files.length} uploaded — some failed`);
    load();
  };

  const download = async (d) => {
    try {
      const token = localStorage.getItem("vault_token");
      const res = await fetch(`${API}/documents/${d.document_id}/download`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        credentials: "include",
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch { toast.error(t("toast.failed_open")); }
  };

  const del = async (id) => {
    await api.delete(`/documents/${id}`);
    toast.success(t("toast.removed"));
    load();
  };

  return (
    <Page>
      <PageHeader
        testid="vault-header"
        title={t("page.vault.title")}
        subtitle={t("page.vault.subtitle")}
        actions={
          <div className="flex items-center gap-2">
            <select value={uploadCat} onChange={(e) => setUploadCat(e.target.value)} data-testid="upload-category" className="text-sm bg-background border border-input rounded-xl px-2 py-2.5 focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="auto">Auto-detect (AI)</option>
              {categories.map((c) => <option key={c} value={c}>{CAT_LABELS[c] || c}</option>)}
            </select>
            <input ref={fileRef} type="file" multiple onChange={upload} className="hidden" data-testid="file-input" />
            <button onClick={() => fileRef.current?.click()} disabled={uploading} data-testid="upload-button" className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60">
              <UploadSimple size={16} weight="bold" /> {uploading ? (progress || t("common.loading")) : t("page.upload_documents")}
            </button>
          </div>
        }
      />

      <SmartAddBar
        target="auto"
        placeholder='e.g. "I have a PAN card (number ABCDE1234F), an Aadhaar card, and a passport expiring in 2028"'
        onAdded={() => load()}
      />

      <PanelChat
        contextLabel="Document Vault"
        systemHint="The user is on the Document Vault page. You can see their uploaded documents listed in the knowledge base below. Help them find documents, understand what they have, identify missing documents for specific purposes, and answer questions about document categories, expiry dates, and contents."
        storageKey="panel_chat_vault"
      />

      <div className="flex flex-wrap gap-2 mb-6">
        <Chip active={filter === ""} onClick={() => setFilter("")} label={t("page.all")} />
        {categories.map((c) => <Chip key={c} active={filter === c} onClick={() => setFilter(c)} label={CAT_LABELS[c] || c} />)}
      </div>

      {docs.length === 0 ? (
        <div className="border border-dashed border-border rounded-2xl p-16 text-center" data-testid="vault-empty">
          <Folder size={40} weight="duotone" className="text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">{t("empty.vault")}</p>
        </div>
      ) : (
        <div className="border-t border-l border-border grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {docs.map((d) => (
            <div key={d.document_id} className="grid-panel p-5 flex items-start gap-3 hover:bg-secondary/40 transition-colors" data-testid={`doc-${d.document_id}`}>
              <FileText size={28} weight="duotone" className="text-primary shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm truncate">{d.original_filename}</p>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span className="text-[11px] tracking-[0.1em] uppercase text-muted-foreground">{CAT_LABELS[d.category] || d.category} · {(d.size / 1024).toFixed(0)} KB</span>
                  {d.auto_classified && <span className="text-[9px] tracking-wider uppercase bg-primary/15 text-primary rounded px-1.5 py-0.5">AI</span>}
                </div>
                {d.metadata?.summary && <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2" data-testid={`meta-${d.document_id}`}>{d.metadata.summary}</p>}
                {(d.metadata?.issuer || d.metadata?.date) && (
                  <p className="text-[10px] text-muted-foreground mt-1">{[d.metadata.issuer, d.metadata.date].filter(Boolean).join(" · ")}</p>
                )}
                <div className="flex gap-3 mt-3">
                  <button onClick={() => download(d)} data-testid={`download-${d.document_id}`} className="text-xs flex items-center gap-1 text-primary hover:underline"><DownloadSimple size={14} /> Open</button>
                  <button onClick={() => del(d.document_id)} data-testid={`delete-doc-${d.document_id}`} className="text-xs flex items-center gap-1 text-destructive hover:underline"><Trash size={14} /> Remove</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}

function Chip({ active, onClick, label }) {
  return (
    <button onClick={onClick} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${active ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-secondary"}`}>{label}</button>
  );
}
