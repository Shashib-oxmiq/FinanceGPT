import { useEffect, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api } from "../lib/api";
import { Page, PageHeader } from "../components/Page";
import { catLabel } from "../lib/categories";
import {
  EnvelopeSimple, Plugs, PlugsConnected, MagnifyingGlass, DownloadSimple,
  FilePdf, Image as ImageIcon, CheckCircle, Sparkle,
} from "@phosphor-icons/react";

const keyOf = (c) => `${c.message_id}:${c.attachment_id}`;

export default function Gmail() {
  const [status, setStatus] = useState({ connected: false, email: "" });
  const [candidates, setCandidates] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [scanning, setScanning] = useState(false);
  const [importing, setImporting] = useState(false);
  const [scope, setScope] = useState("recent");
  const location = useLocation();
  const navigate = useNavigate();

  const loadStatus = useCallback(() => api.get("/gmail/status").then(({ data }) => setStatus(data)), []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("connected")) {
      toast.success("Gmail connected");
      navigate("/gmail", { replace: true });
    } else if (params.get("error")) {
      toast.error("Could not connect Gmail — please try again");
      navigate("/gmail", { replace: true });
    }
    loadStatus();
  }, [location.search, loadStatus, navigate]);

  const connect = async () => {
    try {
      const { data } = await api.get("/oauth/gmail/login");
      window.location.href = data.url;
    } catch { toast.error("Could not start Gmail connection"); }
  };

  const disconnect = async () => {
    await api.post("/gmail/disconnect");
    setStatus({ connected: false, email: "" });
    setCandidates([]);
    setSelected(new Set());
    toast.success("Gmail disconnected");
  };

  const scan = async (s) => {
    setScope(s);
    setScanning(true);
    setCandidates([]);
    setSelected(new Set());
    try {
      const { data } = await api.post("/gmail/scan", { scope: s });
      setCandidates(data.candidates);
      const preselect = new Set(data.candidates.filter((c) => !c.already_imported).map(keyOf));
      setSelected(preselect);
      if (data.candidates.length === 0) toast.message("No matching attachments found in that window");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  const toggle = (c) => {
    if (c.already_imported) return;
    setSelected((s) => {
      const n = new Set(s);
      const k = keyOf(c);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
  };

  const selectableKeys = candidates.filter((c) => !c.already_imported).map(keyOf);
  const allSelected = selectableKeys.length > 0 && selectableKeys.every((k) => selected.has(k));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(selectableKeys));

  const doImport = async () => {
    const items = candidates.filter((c) => selected.has(keyOf(c))).map((c) => ({
      message_id: c.message_id, attachment_id: c.attachment_id, filename: c.filename, mime_type: c.mime_type,
    }));
    if (items.length === 0) return toast.error("Select at least one attachment");
    setImporting(true);
    try {
      const { data } = await api.post("/gmail/import", { items });
      toast.success(`Imported ${data.imported_count} document${data.imported_count === 1 ? "" : "s"} to your Vault${data.skipped ? ` · ${data.skipped} skipped` : ""}`);
      scan(scope); // refresh to reflect already-imported
    } catch (e) {
      toast.error(e.response?.data?.detail || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <Page>
      <PageHeader
        testid="gmail-header"
        title="Import from Gmail"
        subtitle="Connect Gmail (read-only) and Everkin will find financial, insurance, tax and identity attachments so you can review and file them into your Vault — no more digging through old inboxes."
      />

      {!status.connected ? (
        <div className="border border-border rounded-lg p-10 text-center bg-card" data-testid="gmail-connect-card">
          <EnvelopeSimple size={40} weight="duotone" className="text-primary mx-auto mb-4" />
          <h3 className="font-heading text-lg font-bold">Connect your Gmail</h3>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            We request <span className="text-foreground">read-only</span> access and only download the attachments you approve. You can disconnect anytime.
          </p>
          <button onClick={connect} data-testid="gmail-connect" className="mt-5 inline-flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity">
            <PlugsConnected size={16} weight="bold" /> Connect Gmail
          </button>
        </div>
      ) : (
        <>
          <div className="border border-border rounded-lg p-5 bg-card mb-6 flex flex-col sm:flex-row sm:items-center gap-3" data-testid="gmail-connected-bar">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-md bg-accent/15 text-accent flex items-center justify-center shrink-0"><PlugsConnected size={20} weight="duotone" /></div>
              <div className="min-w-0">
                <p className="text-sm font-medium">Connected</p>
                <p className="text-xs text-muted-foreground truncate" data-testid="gmail-email">{status.email || "Gmail account"}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => scan("recent")} disabled={scanning} data-testid="gmail-scan-recent" className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60">
                <MagnifyingGlass size={16} weight="bold" /> {scanning && scope === "recent" ? "Scanning…" : "Scan last 12 months"}
              </button>
              <button onClick={() => scan("older")} disabled={scanning} data-testid="gmail-scan-older" className="flex items-center gap-2 border border-border px-4 py-2.5 rounded-md text-sm font-semibold hover:bg-secondary transition-colors disabled:opacity-60">
                {scanning && scope === "older" ? "Scanning…" : "Scan 1–10 years ago"}
              </button>
              <button onClick={disconnect} data-testid="gmail-disconnect" className="flex items-center gap-2 border border-border px-3 py-2.5 rounded-md text-sm hover:bg-secondary text-destructive transition-colors">
                <Plugs size={16} weight="duotone" /> Disconnect
              </button>
            </div>
          </div>

          {scanning && (
            <div className="border border-border rounded-lg p-16 text-center bg-card" data-testid="gmail-scanning">
              <Sparkle size={32} weight="duotone" className="text-primary mx-auto mb-3 animate-spin" />
              <p className="text-muted-foreground text-sm">Searching your inbox for documents…</p>
            </div>
          )}

          {!scanning && candidates.length > 0 && (
            <div className="animate-fade-up" data-testid="gmail-results">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} data-testid="gmail-select-all" className="w-4 h-4 accent-[hsl(var(--primary))]" />
                  Select all ({selected.size}/{selectableKeys.length})
                </label>
                <button onClick={doImport} disabled={importing || selected.size === 0} data-testid="gmail-import" className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60">
                  <DownloadSimple size={16} weight="bold" /> {importing ? "Importing…" : `Import selected (${selected.size})`}
                </button>
              </div>
              <div className="border border-border rounded-lg overflow-hidden bg-card">
                {candidates.map((c) => {
                  const k = keyOf(c);
                  const isImg = (c.mime_type || "").startsWith("image/");
                  return (
                    <div key={k} onClick={() => toggle(c)} data-testid={`gmail-item-${k}`}
                      className={`flex items-center gap-3 p-4 border-b border-border/60 last:border-0 transition-colors ${c.already_imported ? "opacity-60" : "cursor-pointer hover:bg-secondary/40"}`}>
                      <input type="checkbox" checked={selected.has(k) || c.already_imported} disabled={c.already_imported} onChange={() => toggle(c)} onClick={(e) => e.stopPropagation()} className="w-4 h-4 accent-[hsl(var(--primary))] shrink-0" />
                      <div className="w-9 h-9 rounded-md bg-primary/15 text-primary flex items-center justify-center shrink-0">
                        {isImg ? <ImageIcon size={18} weight="duotone" /> : <FilePdf size={18} weight="duotone" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{c.filename}</p>
                        <p className="text-xs text-muted-foreground truncate">{c.subject || "(no subject)"} · {c.sender}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {c.guessed_category && <span className="text-[10px] uppercase tracking-wider bg-secondary rounded px-2 py-1 text-muted-foreground hidden sm:inline">{catLabel(c.guessed_category)}</span>}
                        {c.already_imported && <span className="flex items-center gap-1 text-[11px] text-accent"><CheckCircle size={14} weight="fill" /> In vault</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!scanning && candidates.length === 0 && (
            <div className="border border-dashed border-border rounded-lg p-16 text-center" data-testid="gmail-empty">
              <MagnifyingGlass size={36} weight="duotone" className="text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Run a scan to find document attachments in your Gmail.</p>
            </div>
          )}
        </>
      )}
    </Page>
  );
}
