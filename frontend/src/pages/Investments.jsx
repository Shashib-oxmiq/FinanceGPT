import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { Page, PageHeader } from "../components/Page";
import Modal from "../components/Modal";
import { TrendUp, Plus, Trash, ChartPieSlice } from "@phosphor-icons/react";

const money = (v) => (v == null || isNaN(Number(v)) ? "—" : Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const TYPE_LABEL = (t) => (t || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const EMPTY = { name: "", asset_type: "stock", amount_invested: "", current_value: "", purchase_date: "", notes: "" };

export default function Investments() {
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [types, setTypes] = useState([]);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const load = () => {
    api.get("/investments").then(({ data }) => setItems(data));
    api.get("/investments/summary").then(({ data }) => setSummary(data));
  };
  useEffect(() => {
    load();
    api.get("/investments/meta").then(({ data }) => setTypes(data.types));
  }, []);

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const add = async () => {
    if (!form.name) return toast.error("Name is required");
    try {
      await api.post("/investments", {
        ...form,
        amount_invested: parseFloat(form.amount_invested) || 0,
        current_value: parseFloat(form.current_value) || 0,
      });
      setForm(EMPTY);
      setShow(false);
      load();
      toast.success("Investment added");
    } catch { toast.error("Failed to add"); }
  };

  const del = async (id) => { await api.delete(`/investments/${id}`); load(); };

  const gainPositive = (summary?.total_gain ?? 0) >= 0;

  return (
    <Page>
      <PageHeader
        testid="investments-header"
        title="Investment Tracker"
        subtitle="Log your investments to track ROI and see your full net-worth picture, right alongside Money Insights."
        actions={
          <button onClick={() => setShow(true)} data-testid="add-investment" className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity">
            <Plus size={16} weight="bold" /> Add investment
          </button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Stat label="Net Worth" value={money(summary?.net_worth)} big />
        <Stat label="Invested" value={money(summary?.total_invested)} />
        <Stat label="Current Value" value={money(summary?.total_current)} />
        <Stat label="Total ROI" value={`${summary?.roi_pct ?? 0}%`} accent={gainPositive} danger={!gainPositive} />
      </div>

      {items.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg p-16 text-center" data-testid="investments-empty">
          <TrendUp size={40} weight="duotone" className="text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No investments yet. Add stocks, funds, crypto, property and more to see your ROI.</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden bg-card">
          {items.map((it) => {
            const inv = Number(it.amount_invested) || 0;
            const cur = Number(it.current_value) || 0;
            const roi = inv ? (((cur - inv) / inv) * 100).toFixed(1) : "0.0";
            const up = cur >= inv;
            return (
              <div key={it.investment_id} className="flex items-center gap-4 p-4 border-b border-border/60 last:border-0" data-testid={`investment-${it.investment_id}`}>
                <div className="w-9 h-9 rounded-md bg-primary/15 text-primary flex items-center justify-center shrink-0">
                  <ChartPieSlice size={18} weight="duotone" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{it.name}</p>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{TYPE_LABEL(it.asset_type)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm tabular">{money(cur)}</p>
                  <p className={`text-xs tabular ${up ? "text-accent" : "text-destructive"}`}>{up ? "+" : ""}{roi}%</p>
                </div>
                <button onClick={() => del(it.investment_id)} data-testid={`delete-investment-${it.investment_id}`} className="text-destructive p-2 hover:bg-secondary rounded shrink-0"><Trash size={16} /></button>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={show} onClose={() => setShow(false)} title="Add investment" testid="investment-form">
        <div className="grid md:grid-cols-2 gap-3">
          <Field label="Name *" value={form.name} onChange={(v) => setF("name", v)} testid="inv-name" />
          <div>
            <label className="text-[11px] tracking-[0.1em] uppercase text-muted-foreground">Type</label>
            <select value={form.asset_type} onChange={(e) => setF("asset_type", e.target.value)} data-testid="inv-type" className="mt-1 w-full bg-background border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              {types.map((t) => <option key={t} value={t}>{TYPE_LABEL(t)}</option>)}
            </select>
          </div>
          <Field label="Amount invested" value={form.amount_invested} onChange={(v) => setF("amount_invested", v)} testid="inv-invested" numeric />
          <Field label="Current value" value={form.current_value} onChange={(v) => setF("current_value", v)} testid="inv-current" numeric />
          <Field label="Purchase date" value={form.purchase_date} onChange={(v) => setF("purchase_date", v)} />
          <Field label="Notes" value={form.notes} onChange={(v) => setF("notes", v)} />
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={() => setShow(false)} className="px-4 py-2.5 rounded-md border border-border text-sm hover:bg-secondary transition-colors">Cancel</button>
          <button onClick={add} data-testid="submit-investment" className="px-4 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity">Save</button>
        </div>
      </Modal>
    </Page>
  );
}

function Stat({ label, value, big, accent, danger }) {
  return (
    <div className={`border border-border rounded-lg p-5 bg-card ${big ? "md:col-span-1" : ""}`}>
      <p className="text-[10px] tracking-[0.15em] uppercase text-muted-foreground">{label}</p>
      <p className={`font-heading font-black tabular mt-2 ${big ? "text-3xl text-primary" : "text-2xl"} ${accent ? "text-accent" : ""} ${danger ? "text-destructive" : ""}`}>{value}</p>
    </div>
  );
}

function Field({ label, value, onChange, testid, numeric }) {
  return (
    <div>
      <label className="text-[11px] tracking-[0.1em] uppercase text-muted-foreground">{label}</label>
      <input value={value} data-testid={testid} onChange={(e) => onChange(e.target.value)} inputMode={numeric ? "decimal" : "text"} className="mt-1 w-full bg-background border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
    </div>
  );
}
