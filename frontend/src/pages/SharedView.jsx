import { useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { api, API } from "../lib/api";
import { catLabel } from "../lib/categories";
import { ShieldCheck, LockKey, DownloadSimple, FileText, Eye } from "@phosphor-icons/react";
import Modal from "../components/Modal";

export default function SharedView() {
  const { token } = useParams();
  const [password, setPassword] = useState("");
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);

  const unlock = async (e) => {
    e?.preventDefault();
    setBusy(true);
    try {
      const res = await api.post(`/shares/${token}/access`, { password });
      setData(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not open share");
    } finally {
      setBusy(false);
    }
  };

  const fileUrl = (id) => `${API}/shares/${token}/file/${id}?password=${encodeURIComponent(password)}`;
  const zipUrl = `${API}/shares/${token}/zip?password=${encodeURIComponent(password)}`;

  const openPreview = async (d) => {
    setPreview({ ...d, loading: true });
    try {
      const res = await fetch(fileUrl(d.document_id));
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const ct = d.content_type || blob.type || "";
      let text = null;
      if (ct.startsWith("text/") || ct.includes("csv") || ct.includes("json")) { try { text = await blob.text(); } catch {} }
      setPreview({ ...d, loading: false, url, text });
    } catch { toast.error("Could not load"); setPreview(null); }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center gap-2 px-6 h-16 border-b border-border">
        <ShieldCheck size={24} weight="duotone" className="text-primary" />
        <span className="font-heading font-black tracking-tight">EVERKIN</span>
        <span className="text-xs text-muted-foreground ml-2">Secure document share</span>
      </header>

      <div className="max-w-3xl mx-auto p-6">
        {!data ? (
          <form onSubmit={unlock} className="max-w-sm mx-auto mt-20 animate-fade-up" data-testid="unlock-form">
            <LockKey size={36} weight="duotone" className="text-primary mb-4" />
            <h1 className="font-heading text-2xl font-black">Enter password</h1>
            <p className="text-sm text-muted-foreground mt-1 mb-6">This shared folder is protected. Enter the 8-digit password you were given.</p>
            <input value={password} onChange={(e) => setPassword(e.target.value)} data-testid="share-password-input" inputMode="numeric" maxLength={8} placeholder="00000000" className="w-full bg-card border border-input rounded-xl px-3 py-3 text-center text-lg tracking-[0.4em] font-mono focus:outline-none focus:ring-2 focus:ring-ring" />
            <button type="submit" disabled={busy || password.length < 8} data-testid="unlock-button" className="mt-4 w-full bg-primary text-primary-foreground py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity disabled:opacity-60">
              {busy ? "Unlocking…" : "Unlock documents"}
            </button>
          </form>
        ) : (
          <div className="animate-fade-up" data-testid="share-contents">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
              <div>
                <h1 className="font-heading text-2xl font-black">{data.name}</h1>
                <p className="text-sm text-muted-foreground">Shared by {data.owner} · expires {new Date(data.expires_at).toLocaleDateString()}</p>
              </div>
              <a href={zipUrl} data-testid="download-all" className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity">
                <DownloadSimple size={16} weight="bold" /> Download all (.zip)
              </a>
            </div>
            <div className="border border-border rounded-2xl bg-card divide-y divide-border/60">
              {data.documents.map((d) => (
                <div key={d.document_id} className="flex items-center gap-3 p-4" data-testid={`share-doc-${d.document_id}`}>
                  <FileText size={22} weight="duotone" className="text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{d.filename}</p>
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{catLabel(d.category)} · {(d.size / 1024).toFixed(0)} KB</p>
                  </div>
                  <button onClick={() => openPreview(d)} className="text-xs flex items-center gap-1 text-primary hover:underline"><Eye size={14} /> View</button>
                  <a href={fileUrl(d.document_id)} className="text-xs flex items-center gap-1 text-primary hover:underline"><DownloadSimple size={14} /> Open</a>
                </div>
              ))}
              {data.documents.length === 0 && <p className="p-6 text-sm text-muted-foreground">No documents in this share.</p>}
            </div>
          </div>
        )}
      </div>

      <Modal open={!!preview} onClose={() => setPreview(null)} title={preview?.filename || "Document"} testid="share-preview">
        {preview?.loading && <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>}
        {preview && !preview.loading && (
          <div className="rounded-xl overflow-hidden border border-border bg-background" style={{ minHeight: 200 }}>
            {(preview.content_type || "").startsWith("image/") ? (
              <img src={preview.url} alt={preview.filename} className="w-full object-contain max-h-[60vh]" />
            ) : (preview.content_type || "").includes("pdf") ? (
              <iframe title="preview" src={preview.url} className="w-full" style={{ height: "60vh" }} />
            ) : preview.text != null ? (
              <pre className="p-4 text-xs whitespace-pre-wrap overflow-auto max-h-[60vh] font-mono">{preview.text}</pre>
            ) : (
              <p className="p-8 text-center text-sm text-muted-foreground">Preview not available. Use Open to download.</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
