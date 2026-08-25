import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { Page, PageHeader } from "../components/Page";
import { catLabel } from "../lib/categories";
import { Bank, Sparkle, CheckCircle, XCircle, Copy, LockKey, ShareNetwork, CheckSquare, Square } from "@phosphor-icons/react";

const SECTIONS = ["Identity & KYC", "Income Documents", "Property Documents", "Other Requirements"];

export default function LoanPrep() {
  const [bank, setBank] = useState("");
  const [loanType, setLoanType] = useState("Home Loan");
  const [employment, setEmployment] = useState("Salaried");
  const [purchase, setPurchase] = useState("New home");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [docs, setDocs] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [share, setShare] = useState(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => { api.get("/documents").then(({ data }) => setDocs(data)); }, []);

  const run = async () => {
    if (!bank || !loanType) return toast.error("Enter bank and loan type");
    setBusy(true); setResult(null); setShare(null);
    try {
      const { data } = await api.post("/loans/checklist", { bank, loan_type: loanType, employment_type: employment, purchase_type: purchase });
      setResult(data);
      const pre = new Set();
      data.items.forEach((it) => it.matched.forEach((m) => pre.add(m.document_id)));
      setSelected(pre);
    } catch { toast.error("Could not build checklist"); }
    finally { setBusy(false); }
  };

  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const createShare = async () => {
    if (selected.size === 0) return toast.error("Select at least one document");
    setCreating(true);
    try {
      const { data } = await api.post("/shares", { name: `${bank} — ${loanType}`, document_ids: Array.from(selected), expiry_days: 15 });
      setShare(data);
      toast.success("Secure share created");
    } catch { toast.error("Could not create share"); }
    finally { setCreating(false); }
  };

  const shareUrl = share ? `${window.location.origin}${share.path}` : "";
  const copy = (text, label) => { navigator.clipboard?.writeText(text); toast.success(`${label} copied`); };
  const docName = (id) => docs.find((d) => d.document_id === id)?.original_filename || id;

  return (
    <Page>
      <PageHeader
        testid="loans-header"
        title="Loan Document Prep"
        subtitle="Tell Everkin the bank and loan type. It lists every required document, shows what you already have vs what's missing, and builds a secure, password-protected folder to share with your bank representative."
      />

      <div className="border border-border rounded-lg p-6 bg-card mb-6">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="text-[11px] tracking-[0.1em] uppercase text-muted-foreground">Bank</label>
            <input value={bank} data-testid="loan-bank" onChange={(e) => setBank(e.target.value)} placeholder="e.g. HDFC Bank" className="mt-1 w-full bg-background border border-input rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div>
            <label className="text-[11px] tracking-[0.1em] uppercase text-muted-foreground">Loan type</label>
            <input value={loanType} data-testid="loan-type" onChange={(e) => setLoanType(e.target.value)} placeholder="Home / Personal / Car" className="mt-1 w-full bg-background border border-input rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div>
            <label className="text-[11px] tracking-[0.1em] uppercase text-muted-foreground">Employment</label>
            <select value={employment} data-testid="loan-employment" onChange={(e) => setEmployment(e.target.value)} className="mt-1 w-full bg-background border border-input rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option>Salaried</option>
              <option>Self-Employed Professional</option>
              <option>Self-Employed Non-Professional</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] tracking-[0.1em] uppercase text-muted-foreground">Purchase type</label>
            <select value={purchase} data-testid="loan-purchase" onChange={(e) => setPurchase(e.target.value)} className="mt-1 w-full bg-background border border-input rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option>New home</option>
              <option>Resale home</option>
              <option>Plot / construction</option>
              <option>Not applicable</option>
            </select>
          </div>
        </div>
        <button onClick={run} disabled={busy} data-testid="build-checklist" className="mt-3 w-full sm:w-auto flex items-center justify-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60">
          <Sparkle size={16} weight="duotone" className={busy ? "animate-spin" : ""} /> {busy ? "Analyzing…" : "Build checklist"}
        </button>
      </div>

      {result && (
        <div className="animate-fade-up" data-testid="checklist-result">
          {result.summary && <p className="text-sm text-muted-foreground mb-4">{result.summary}</p>}
          {SECTIONS.filter((sec) => result.items.some((it) => (it.section || "Other Requirements") === sec)).map((sec) => (
            <div key={sec} className="mb-6">
              <h3 className="font-heading text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2">{sec}</h3>
              <div className="border border-border rounded-lg bg-card overflow-hidden">
                {result.items.map((it, i) => (it.section || "Other Requirements") === sec && (
                  <div key={i} className="p-4 border-b border-border/60 last:border-0" data-testid={`checklist-item-${i}`}>
                    <div className="flex items-start gap-3">
                      {it.status === "have" ? <CheckCircle size={20} weight="fill" className="text-accent shrink-0 mt-0.5" /> : <XCircle size={20} weight="fill" className="text-[hsl(var(--warning))] shrink-0 mt-0.5" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{it.name} {it.required && <span className="text-[10px] uppercase tracking-wider text-destructive ml-1">required</span>}</p>
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground mt-0.5">{catLabel(it.category)} · {it.status === "have" ? "You have this" : "Missing"}</p>
                        {it.matched.map((m) => (
                          <label key={m.document_id} className="flex items-center gap-2 mt-2 text-sm cursor-pointer" onClick={() => toggle(m.document_id)}>
                            {selected.has(m.document_id) ? <CheckSquare size={16} weight="fill" className="text-primary" /> : <Square size={16} className="text-muted-foreground" />}
                            <span className="truncate">{m.filename}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="border border-border rounded-lg p-6 bg-card">
            <h3 className="font-heading text-lg font-bold flex items-center gap-2 mb-2"><ShareNetwork size={18} weight="duotone" className="text-primary" /> Secure share</h3>
            <p className="text-sm text-muted-foreground mb-4">{selected.size} document{selected.size !== 1 ? "s" : ""} selected. Creates a password-protected link (valid 15 days) to send your representative.</p>
            {!share ? (
              <button onClick={createShare} disabled={creating} data-testid="create-share" className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60">
                <LockKey size={16} weight="duotone" /> {creating ? "Creating…" : "Create secure share"}
              </button>
            ) : (
              <div className="space-y-3" data-testid="share-created">
                <Row label="Share link" value={shareUrl} onCopy={() => copy(shareUrl, "Link")} testid="share-link" mono />
                <Row label="8-digit password" value={share.password} onCopy={() => copy(share.password, "Password")} testid="share-password" mono />
                <p className="text-xs text-muted-foreground">Expires {new Date(share.expires_at).toLocaleDateString()}. Includes: {Array.from(selected).map(docName).join(", ")}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </Page>
  );
}

function Row({ label, value, onCopy, testid, mono }) {
  return (
    <div>
      <label className="text-[11px] tracking-[0.1em] uppercase text-muted-foreground">{label}</label>
      <div className="flex items-center gap-2 mt-1">
        <input readOnly value={value} data-testid={testid} className={`flex-1 bg-background border border-input rounded-md px-3 py-2 text-sm ${mono ? "font-mono" : ""}`} />
        <button onClick={onCopy} className="p-2.5 rounded-md border border-border hover:bg-secondary transition-colors"><Copy size={16} /></button>
      </div>
    </div>
  );
}
