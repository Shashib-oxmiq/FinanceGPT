import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { useTts } from "../lib/audio";
import { Page, PageHeader } from "../components/Page";
import { catLabel } from "../lib/categories";
import { ChartLineUp, Sparkle, WarningCircle, ArrowsClockwise, Lightbulb, Receipt, SpeakerHigh, Stop, TrendUp } from "@phosphor-icons/react";

const money = (v, cur) => {
  if (v == null || isNaN(Number(v))) return "—";
  const n = Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return cur ? `${cur} ${n}` : n;
};

export default function Insights() {
  const [docs, setDocs] = useState([]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [invest, setInvest] = useState(null);
  const { activeId: audioId, loadingId: audioLoading, speak } = useTts();

  const listen = () => {
    if (!result) return;
    const text = [
      "Here is your money insights summary.", result.summary,
      "Recurring subscriptions: " + (result.recurring || []).map((s) => s.merchant).join(", "),
      "Advice: " + (result.advice || []).join(". "),
    ].filter(Boolean).join(". ");
    speak("insights", text);
  };

  const loadHistory = () => api.get("/insights").then(({ data }) => setHistory(data));

  useEffect(() => {
    api.get("/documents").then(({ data }) => {
      const priority = ["bank_statement", "credit_card_statement", "financial", "investment"];
      const sorted = [...data].sort((a, b) => priority.indexOf(b.category) - priority.indexOf(a.category));
      setDocs(sorted);
      if (sorted.length) setSelected(sorted[0].document_id);
    });
    api.get("/investments/summary").then(({ data }) => setInvest(data)).catch(() => {});
    loadHistory();
  }, []);

  const analyze = async () => {
    if (!selected) return toast.error("Upload a statement in the Vault first, then pick it here");
    setBusy(true);
    setResult(null);
    try {
      const { data } = await api.post("/insights/statement", { document_id: selected });
      setResult(data.result);
      loadHistory();
      toast.success("Statement analyzed");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Analysis failed");
    } finally {
      setBusy(false);
    }
  };

  const r = result;
  const cur = r?.currency || "";

  return (
    <Page>
      <PageHeader
        testid="insights-header"
        title="Money Insights"
        subtitle="Upload a bank or credit-card statement and let Everkin review your spending, spot subscriptions and give you clear expense & credit advice."
      />

      {invest && invest.count > 0 && (
        <div className="border border-border rounded-lg p-6 bg-card mb-6 animate-fade-up" data-testid="networth-panel">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading text-lg font-bold flex items-center gap-2"><TrendUp size={18} weight="duotone" className="text-primary" /> Net worth from investments</h3>
            <a href="/investments" className="text-xs font-semibold text-primary hover:underline underline-offset-2" data-testid="networth-manage">Manage →</a>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Net Worth" value={money(invest.net_worth)} accent />
            <Stat label="Invested" value={money(invest.total_invested)} />
            <Stat label="Current Value" value={money(invest.total_current)} />
            <Stat label="Total ROI" value={`${invest.roi_pct ?? 0}%`} />
          </div>
          <p className="text-xs text-muted-foreground mt-3">Includes {invest.count} logged investment{invest.count === 1 ? "" : "s"}. Analyze a statement below to add spending & savings context.</p>
        </div>
      )}

      <div className="border border-border rounded-lg p-6 bg-card mb-6">
        <label className="text-[11px] tracking-[0.1em] uppercase text-muted-foreground">Statement to review</label>
        <div className="flex flex-col sm:flex-row gap-2 mt-2">
          <select value={selected} onChange={(e) => setSelected(e.target.value)} data-testid="statement-select"
            className="flex-1 bg-background border border-input rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
            {docs.length === 0 && <option value="">No documents — upload in the Vault</option>}
            {docs.map((d) => (
              <option key={d.document_id} value={d.document_id}>{d.original_filename} · {catLabel(d.category)}</option>
            ))}
          </select>
          <button onClick={analyze} disabled={busy || !selected} data-testid="analyze-statement"
            className="flex items-center justify-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60">
            <Sparkle size={16} weight="duotone" className={busy ? "animate-spin" : ""} /> {busy ? "Analyzing…" : "Analyze"}
          </button>
        </div>
      </div>

      {r && (
        <div className="space-y-4 animate-fade-up" data-testid="insights-result">
          <div className="flex justify-end">
            <button onClick={listen} data-testid="listen-insights" className={`flex items-center gap-2 border border-border px-3 py-2 rounded-md text-sm transition-colors ${audioId === "insights" ? "text-primary border-primary" : "hover:bg-secondary"}`}>
              {audioId === "insights" ? <Stop size={16} weight="fill" /> : <SpeakerHigh size={16} weight="duotone" className={audioLoading === "insights" ? "animate-pulse" : ""} />}
              {audioLoading === "insights" ? "Preparing…" : audioId === "insights" ? "Stop" : "Listen"}
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Total Spend" value={money(r.total_spend, cur)} />
            <Stat label="Income" value={money(r.total_income, cur)} accent />
            <Stat label="Net" value={money(r.net, cur)} />
            <Stat label="Savings Potential" value={money(r.savings_potential, cur)} accent />
          </div>

          {r.summary && <p className="text-sm text-muted-foreground border border-border rounded-lg p-4 bg-card">{r.summary}{r.period ? ` (${r.period})` : ""}</p>}

          <div className="grid lg:grid-cols-2 gap-4">
            <div className="border border-border rounded-lg p-6 bg-card">
              <h3 className="font-heading text-lg font-bold mb-4 flex items-center gap-2"><ChartLineUp size={18} weight="duotone" className="text-primary" /> Spending by category</h3>
              <div className="space-y-3">
                {(r.by_category || []).map((c, i) => (
                  <div key={i}>
                    <div className="flex justify-between text-sm mb-1"><span>{c.category}</span><span className="tabular text-muted-foreground">{money(c.amount, cur)}</span></div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden"><div className="h-full bg-primary" style={{ width: `${Math.min(100, c.pct || 0)}%` }} /></div>
                  </div>
                ))}
                {(!r.by_category || r.by_category.length === 0) && <p className="text-sm text-muted-foreground">No breakdown available.</p>}
              </div>
            </div>

            <div className="border border-border rounded-lg p-6 bg-card">
              <h3 className="font-heading text-lg font-bold mb-4 flex items-center gap-2"><ArrowsClockwise size={18} weight="duotone" className="text-accent" /> Recurring subscriptions</h3>
              <ul className="space-y-2">
                {(r.recurring || []).map((s, i) => (
                  <li key={i} className="flex justify-between text-sm"><span>{s.merchant} <span className="text-muted-foreground">· {s.frequency}</span></span><span className="tabular">{money(s.amount, cur)}</span></li>
                ))}
                {(!r.recurring || r.recurring.length === 0) && <p className="text-sm text-muted-foreground">None detected.</p>}
              </ul>
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            <InfoList title="Largest expenses" icon={Receipt} color="text-primary" items={(r.largest_expenses || []).map((e) => `${e.merchant} — ${money(e.amount, cur)}`)} />
            <InfoList title="Red flags" icon={WarningCircle} color="text-[hsl(var(--warning))]" items={r.red_flags} />
            <InfoList title="Advice" icon={Lightbulb} color="text-accent" items={r.advice} />
          </div>
        </div>
      )}

      {!r && history.length > 0 && (
        <div className="border border-border rounded-lg p-6 bg-card">
          <h3 className="font-heading text-lg font-bold mb-4">Past reviews</h3>
          <ul className="space-y-2">
            {history.map((h) => (
              <li key={h.insight_id} className="flex items-center justify-between text-sm border-b border-border/60 pb-2">
                <button className="text-left hover:text-primary" onClick={() => setResult(h.result)} data-testid={`history-${h.insight_id}`}>{h.filename}</button>
                <span className="text-muted-foreground text-xs">{money(h.result?.total_spend, h.result?.currency)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Page>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className="border border-border rounded-lg p-5 bg-card">
      <p className="text-[10px] tracking-[0.15em] uppercase text-muted-foreground">{label}</p>
      <p className={`font-heading text-2xl font-black tabular mt-2 ${accent ? "text-accent" : ""}`}>{value}</p>
    </div>
  );
}

function InfoList({ title, icon: Icon, color, items }) {
  return (
    <div className="border border-border rounded-lg p-6 bg-card">
      <h3 className={`text-xs tracking-[0.15em] uppercase mb-3 flex items-center gap-1 ${color}`}><Icon size={16} weight="duotone" /> {title}</h3>
      <ul className="space-y-1.5 text-sm text-muted-foreground">
        {(items || []).map((it, i) => <li key={i}>• {it}</li>)}
        {(!items || items.length === 0) && <li>Nothing notable.</li>}
      </ul>
    </div>
  );
}
