import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api, API } from "../lib/api";
import { Page, PageHeader } from "../components/Page";
import { UploadSimple, Trash, FileText, DownloadSimple, Folder } from "@phosphor-icons/react";
import { CATEGORY_LABELS as CAT_LABELS } from "../lib/categories";

export default function Vault() {
  const [docs, setDocs] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filter, setFilter] = useState("");
  const [uploadCat, setUploadCat] = useState("financial");
  const [uploading, setUploading] = useState(false);
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
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("category", uploadCat);
    try {
      await api.post("/documents/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Uploaded");
      load();
    } catch { toast.error("Upload failed"); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
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
    } catch { toast.error("Could not open document"); }
  };

  const del = async (id) => {
    await api.delete(`/documents/${id}`);
    toast.success("Removed");
    load();
  };

  return (
    <Page>
      <PageHeader
        testid="vault-header"
        title="Document Vault"
        subtitle="Encrypted storage for bank statements, tax, IDs, insurance and immigration records."
        actions={
          <div className="flex items-center gap-2">
            <select value={uploadCat} onChange={(e) => setUploadCat(e.target.value)} data-testid="upload-category" className="text-sm bg-background border border-input rounded-md px-2 py-2.5 focus:outline-none focus:ring-2 focus:ring-ring">
              {categories.map((c) => <option key={c} value={c}>{CAT_LABELS[c] || c}</option>)}
            </select>
            <input ref={fileRef} type="file" onChange={upload} className="hidden" data-testid="file-input" />
            <button onClick={() => fileRef.current?.click()} disabled={uploading} data-testid="upload-button" className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60">
              <UploadSimple size={16} weight="bold" /> {uploading ? "Uploading…" : "Upload"}
            </button>
          </div>
        }
      />

      <div className="flex flex-wrap gap-2 mb-6">
        <Chip active={filter === ""} onClick={() => setFilter("")} label="All" />
        {categories.map((c) => <Chip key={c} active={filter === c} onClick={() => setFilter(c)} label={CAT_LABELS[c] || c} />)}
      </div>

      {docs.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg p-16 text-center" data-testid="vault-empty">
          <Folder size={40} weight="duotone" className="text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No documents in this view. Upload to get started.</p>
        </div>
      ) : (
        <div className="border-t border-l border-border grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {docs.map((d) => (
            <div key={d.document_id} className="grid-panel p-5 flex items-start gap-3 hover:bg-secondary/40 transition-colors" data-testid={`doc-${d.document_id}`}>
              <FileText size={28} weight="duotone" className="text-primary shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm truncate">{d.original_filename}</p>
                <p className="text-[11px] tracking-[0.1em] uppercase text-muted-foreground mt-0.5">{CAT_LABELS[d.category] || d.category} · {(d.size / 1024).toFixed(0)} KB</p>
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
