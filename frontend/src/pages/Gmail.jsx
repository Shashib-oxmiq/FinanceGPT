import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { Page, PageHeader } from "../components/Page";
import { catLabel } from "../lib/categories";
import PanelChat from "../components/PanelChat";
import { useLanguage } from "../contexts/LanguageContext";
import {
  EnvelopeSimple, Plugs, PlugsConnected, MagnifyingGlass, DownloadSimple,
  FilePdf, Image as ImageIcon, CheckCircle, Sparkle, Eye, Key,
} from "@phosphor-icons/react";

const keyOf = (c) => `${c.message_id}:${c.attachment_id}`;

export default function Gmail() {
  const { t } = useLanguage();
  const [status, setStatus] = useState({ connected: false, email: "" });
  const [candidates, setCandidates] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [scanning, setScanning] = useState(false);
  const [importing, setImporting] = useState(false);
  const [scope, setScope] = useState("recent");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const loadStatus = useCallback(() => api.get("/gmail/status").then(({ data }) => setStatus(data)), []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const connect = async () => {
    if (!email.trim() || !password.trim()) {
      toast.error("Enter your email and App Password");
      return;
    }
    setConnecting(true);
    try {
      const { data } = await api.post("/gmail/connect", { email: email.trim(), password: password.trim() });
      setStatus(data);
      toast.success(`Gmail connected: ${data.email}`);
      setEmail("");
      setPassword("");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Connection failed");
    } finally {
      setConnecting(false);
    }
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
      const parts = [`Imported ${data.imported} document${data.imported === 1 ? "" : "s"} to your Vault`];
      if (data.skipped) parts.push(`${data.skipped} duplicate${data.skipped !== 1 ? "s" : ""} skipped`);
      toast.success(parts.join(" · "));
      scan(scope);
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
        title={t("page.gmail.title")}
        subtitle={t("page.gmail.subtitle")}
      />

      <PanelChat
        contextLabel="Gmail Import"
        systemHint="The user is on the Gmail Import page. Help them connect their email via IMAP App Password, understand how to create a Gmail App Password, scan for financial attachments, and import documents into their Vault."
        storageKey="panel_chat_gmail"
      />

      {!status.connected ? (
        <div className="border border-border rounded-2xl p-8 bg-card max-w-lg mx-auto" data-testid="gmail-connect-card">
          <div className="text-center mb-6">
            <EnvelopeSimple size={40} weight="duotone" className="text-primary mx-auto mb-4" />
            <h3 className="font-heading text-lg font-bold">{t("gmail.connect")}</h3>
            <p className="text-sm text-muted-foreground mt-2">
              {t("gmail.password_hint")}
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground font-medium">{t("gmail.email_label")}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && password) connect(); }}
                placeholder="yourname@gmail.com"
                disabled={connecting}
                className="w-full mt-1 bg-background border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary transition-colors"
                data-testid="gmail-email-input"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium">{t("gmail.password_label")}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && email) connect(); }}
                placeholder="xxxx xxxx xxxx xxxx"
                disabled={connecting}
                className="w-full mt-1 bg-background border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary transition-colors"
                data-testid="gmail-password-input"
              />
            </div>
            <button
              onClick={connect}
              disabled={connecting}
              data-testid="gmail-connect"
              className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground px-5 py-3 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              <PlugsConnected size={16} weight="bold" /> {connecting ? `${t("common.connect")}…` : t("gmail.connect")}
            </button>
          </div>

          <button
            onClick={() => setShowHelp((v) => !v)}
            className="mt-4 text-xs text-primary hover:underline flex items-center gap-1 mx-auto"
          >
            <Key size={12} /> {showHelp ? t("common.close") : t("gmail.help_title")}
          </button>
          {showHelp && (
            <div className="mt-3 p-4 bg-secondary/50 rounded-xl text-xs text-muted-foreground space-y-1.5">
              <p className="font-medium text-foreground">{t("gmail.help_title")}</p>
              <p>{t("gmail.help_step1")}</p>
              <p>{t("gmail.help_step2")}</p>
              <p>{t("gmail.help_step3")}</p>
              <p>{t("gmail.help_step4")}</p>
              <p>{t("gmail.help_step5")}</p>
              <p className="pt-1 text-[10px]">Works with Gmail, Google Workspace, Outlook, Yahoo, iCloud.</p>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="border border-border rounded-2xl p-5 bg-card mb-6 flex flex-col sm:flex-row sm:items-center gap-3" data-testid="gmail-connected-bar">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-accent/15 text-accent flex items-center justify-center shrink-0"><PlugsConnected size={20} weight="duotone" /></div>
              <div className="min-w-0">
                <p className="text-sm font-medium">{t("gmail.connected")}</p>
                <p className="text-xs text-muted-foreground truncate" data-testid="gmail-email">{status.email || "Gmail account"}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => scan("recent")} disabled={scanning} data-testid="gmail-scan-recent" className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60">
                <MagnifyingGlass size={16} weight="bold" /> {scanning && scope === "recent" ? `${t("gmail.scanning")}` : t("gmail.scan_recent")}
              </button>
              <button onClick={() => scan("older")} disabled={scanning} data-testid="gmail-scan-older" className="flex items-center gap-2 border border-border px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-secondary transition-colors disabled:opacity-60">
                {scanning && scope === "older" ? `${t("gmail.scanning")}` : t("gmail.scan_older")}
              </button>
              <button onClick={disconnect} className="flex items-center gap-2 border border-border px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors">
                <Plugs size={16} weight="bold" /> {t("common.disconnect")}
              </button>
            </div>
          </div>

          {scanning && (
            <div className="border border-border rounded-2xl p-8 bg-card text-center" data-testid="gmail-scanning">
              <MagnifyingGlass size={28} weight="duotone" className="text-primary mx-auto mb-3 animate-pulse" />
              <p className="text-sm font-medium">{t("gmail.scanning")}</p>
              <p className="text-xs text-muted-foreground mt-1">This may take a few moments for large inboxes.</p>
            </div>
          )}

          {!scanning && candidates.length > 0 && (
            <div className="border border-border rounded-2xl bg-card overflow-hidden" data-testid="gmail-results">
              <div className="flex items-center justify-between p-4 border-b border-border">
                <p className="text-sm font-medium">{candidates.length} attachment{candidates.length !== 1 ? "s" : ""} found</p>
                <button onClick={toggleAll} className="text-xs text-primary hover:underline">
                  {allSelected ? "Deselect all" : "Select all (new only)"}
                </button>
              </div>
              <div className="divide-y divide-border">
                {candidates.map((c) => {
                  const k = keyOf(c);
                  const isSel = selected.has(k);
                  const isPdf = (c.mime_type || "").includes("pdf") || (c.filename || "").endsWith(".pdf");
                  return (
                    <div key={k} onClick={() => toggle(c)}
                      className={`flex items-center gap-3 p-4 cursor-pointer transition-colors ${c.already_imported ? "opacity-50" : isSel ? "bg-primary/5" : "hover:bg-secondary/50"}`}
                      data-testid={`gmail-candidate-${k}`}>
                      <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                        {isPdf ? <FilePdf size={18} weight="duotone" className="text-destructive" /> : <ImageIcon size={18} weight="duotone" className="text-primary" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{c.filename}</p>
                        <p className="text-xs text-muted-foreground truncate">{c.subject || "No subject"} — {c.sender || "Unknown sender"}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {c.guessed_category && <span className="text-[10px] bg-secondary px-2 py-0.5 rounded-full">{catLabel(c.guessed_category)}</span>}
                          {c.already_imported && <span className="text-[10px] text-green-500 flex items-center gap-0.5"><CheckCircle size={10} weight="fill" /> Imported</span>}
                          <span className="text-[10px] text-muted-foreground">{(c.size / 1024).toFixed(0)} KB</span>
                        </div>
                      </div>
                      <input type="checkbox" checked={isSel} disabled={c.already_imported} readOnly className="w-4 h-4 accent-primary shrink-0" />
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between p-4 border-t border-border">
                <p className="text-xs text-muted-foreground">{selected.size} selected</p>
                <button onClick={doImport} disabled={importing || selected.size === 0} data-testid="gmail-import"
                  className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60">
                  <DownloadSimple size={16} weight="bold" /> {importing ? `${t("gmail.importing")}` : `${t("gmail.import_selected")} (${selected.size})`}
                </button>
              </div>
            </div>
          )}

          {!scanning && candidates.length === 0 && status.connected && (
            <div className="border border-dashed border-border rounded-2xl p-12 text-center bg-card">
              <MagnifyingGlass size={32} weight="duotone" className="text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium">{t("misc.no_data")}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("gmail.scan_recent")} → {t("gmail.attachments_found")}</p>
            </div>
          )}
        </>
      )}
    </Page>
  );
}