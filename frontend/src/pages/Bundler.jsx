import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, API } from "../lib/api";
import { Page, PageHeader } from "../components/Page";
import { Package, Sparkle, DownloadSimple, CheckSquare, Square } from "@phosphor-icons/react";
import { CATEGORY_LABELS as CAT_LABELS } from "../lib/categories";

export default function Bundler() {
  const [purpose, setPurpose] = useState("");
  const [suggestion, setSuggestion] = useState(null);
  const [docs, setDocs] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api.get("/documents").then(({ data }) => setDocs(data));
  }, []);

  const suggest = async () => {
    if (!purpose) return toast.error("Describe the purpose");
    setBusy(true);
    try {
      const { data } = await api.post("/bundle/suggest", { purpose });
      setSuggestion(data);
      setName(purpose.slice(0, 40));
      // Preselect docs in recommended categories
      const rec = new Set(data.recommended_categories || []);
      setSelected(new Set(docs.filter((d) => rec.has(d.category)).map((d) => d.document_id)));
    } catch { toast.error("Suggestion failed"); }
    finally { setBusy(false); }
  };

  const toggle = (id) => {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const createBundle = async () => {
    if (selected.size === 0) return toast.error("Select at least one document");
    setCreating(true);
    try {
      const token = localStorage.getItem("vault_token");
      const res = await fetch(`${API}/bundle/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        credentials: "include",
        body: JSON.stringify({ name: name || "bundle", document_ids: Array.from(selected) }),
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${(name || "bundle").replace(/[^a-z0-9-_ ]/gi, "")}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Bundle downloaded");
    } catch { toast.error("Bundle creation failed"); }
    finally { setCreating(false); }
  };

  return (
    <Page>
      <PageHeader
        testid="bundler-header"
        title="Document Bundler"
        subtitle="Tell us the goal — applying to a company, a visa, a loan — and we assemble the right documents into one .zip."
      />

      <div className="border border-border rounded-lg p-6 bg-card mb-6">
        <label className="text-[11px] tracking-[0.1em] uppercase text-muted-foreground">What are you preparing for?</label>
        <div className="flex flex-col sm:flex-row gap-2 mt-2">
          <input value={purpose} data-testid="bundle-purpose" onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. Applying for a mortgage at ABC Bank" className="flex-1 bg-background border border-input rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          <button onClick={suggest} disabled={busy} data-testid="suggest-bundle" className="flex items-center justify-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60">
            <Sparkle size={16} weight="duotone" /> {busy ? "Thinking…" : "Suggest documents"}
          </button>
        </div>
      </div>

      {suggestion && (
        <div className="border border-border rounded-lg p-6 bg-card mb-6 animate-fade-up" data-testid="suggestion-panel">
          <p className="text-sm text-muted-foreground mb-2">{suggestion.summary}</p>
          <p className="text-xs text-accent mb-4" data-testid="autoselect-hint">{selected.size} matching document{selected.size !== 1 ? "s" : ""} auto-selected below — tap a row to include or exclude.</p>
          <div className="space-y-2">
            {(suggestion.checklist || []).map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <CheckSquare size={16} weight="duotone" className="text-accent shrink-0" />
                <span>{c.item}</span>
                {c.required && <span className="text-[10px] uppercase tracking-wider text-destructive">required</span>}
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground ml-auto">{CAT_LABELS[c.category] || c.category}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 border border-border rounded-lg p-6 bg-card">
          <h3 className="font-heading text-lg font-bold mb-4">Select documents</h3>
          {docs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No documents yet — upload some in the Vault first.</p>
          ) : (
            <div className="space-y-1">
              {docs.map((d) => (
                <button key={d.document_id} onClick={() => toggle(d.document_id)} data-testid={`select-doc-${d.document_id}`} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-secondary text-left transition-colors">
                  {selected.has(d.document_id) ? <CheckSquare size={18} weight="fill" className="text-primary shrink-0" /> : <Square size={18} className="text-muted-foreground shrink-0" />}
                  <span className="text-sm truncate flex-1">{d.original_filename}</span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{CAT_LABELS[d.category] || d.category}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="border border-border rounded-lg p-6 bg-card h-fit">
          <Package size={28} weight="duotone" className="text-primary mb-3" />
          <label className="text-[11px] tracking-[0.1em] uppercase text-muted-foreground">Bundle name</label>
          <input value={name} data-testid="bundle-name" onChange={(e) => setName(e.target.value)} className="mt-1 w-full bg-background border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          <p className="text-sm text-muted-foreground mt-4 tabular">{selected.size} document{selected.size !== 1 ? "s" : ""} selected</p>
          <button onClick={createBundle} disabled={creating} data-testid="create-bundle" className="mt-3 w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 rounded-md font-semibold hover:opacity-90 transition-opacity disabled:opacity-60">
            <DownloadSimple size={16} weight="bold" /> {creating ? "Building…" : "Build & download .zip"}
          </button>
        </div>
      </div>
    </Page>
  );
}
