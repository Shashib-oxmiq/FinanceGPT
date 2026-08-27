import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { api, API } from "../lib/api";
import { Page, PageHeader } from "../components/Page";
import Modal from "../components/Modal";
import { TrendUp, Plus, Trash, ChartPieSlice, ArrowsClockwise, Spinner, Globe, CurrencyDollar } from "@phosphor-icons/react";
import SmartAddBar from "../components/SmartAddBar";
import PanelChat from "../components/PanelChat";
import { useLanguage } from "../contexts/LanguageContext";

const money = (v, cur) => {
  if (v == null || isNaN(Number(v))) return "—";
  const n = Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return cur ? `${cur} ${n}` : n;
};
const TYPE_LABEL = (t) => (t || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const EMPTY = { name: "", asset_type: "stock", amount_invested: "", current_value: "", purchase_date: "", ticker: "", market: "", notes: "" };

// Currency symbols
const CUR_SYM = { USD: "$", INR: "₹", EUR: "€", GBP: "£", JPY: "¥", AUD: "A$", CAD: "C$" };

export default function Investments() {
  const { t } = useLanguage();
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [types, setTypes] = useState([]);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [liveQuotes, setLiveQuotes] = useState({});
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveFetched, setLiveFetched] = useState(false);

  const load = useCallback(() => {
    api.get("/investments").then(({ data }) => setItems(data));
    api.get("/investments/summary").then(({ data }) => setSummary(data));
  }, []);

  useEffect(() => {
    load();
    api.get("/investments/meta").then(({ data }) => setTypes(data.types));
  }, [load]);

  // Auto-fetch live prices when items change (but not on every re-render)
  const fetchLivePrices = useCallback(async () => {
    if (!items.length) return;
    setLiveLoading(true);
    try {
      const { data } = await api.get("/market/portfolio-quotes");
      const quotesMap = {};
      (data.quotes || []).forEach((q) => {
        quotesMap[q.investment_id] = q;
      });
      setLiveQuotes(quotesMap);
      setLiveFetched(true);
    } catch (e) {
      console.warn("Live price fetch failed:", e);
    } finally {
      setLiveLoading(false);
    }
  }, [items]);

  useEffect(() => {
    if (items.length > 0 && !liveFetched) {
      fetchLivePrices();
    }
  }, [items, liveFetched, fetchLivePrices]);

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const add = async () => {
    if (!form.name) return toast.error(t("toast.name_required"));
    try {
      if (editId) {
        // Edit existing
        await api.put(`/investments/${editId}`, {
          ...form,
          amount_invested: parseFloat(form.amount_invested) || 0,
          current_value: parseFloat(form.current_value) || 0,
        });
        toast.success("Investment updated");
      } else {
        // Add new
        await api.post("/investments", {
          ...form,
          amount_invested: parseFloat(form.amount_invested) || 0,
          current_value: parseFloat(form.current_value) || 0,
        });
        toast.success(t("toast.investment_added"));
      }
      setForm(EMPTY);
      setEditId(null);
      setShow(false);
      load();
      setLiveFetched(false);
    } catch { toast.error(t("toast.failed_add")); }
  };

  const editInvestment = (it) => {
    setForm({
      name: it.name || "",
      asset_type: it.asset_type || "stock",
      amount_invested: String(it.amount_invested ?? ""),
      current_value: String(it.current_value ?? ""),
      purchase_date: it.purchase_date || "",
      ticker: it.ticker || "",
      market: it.market || "",
      notes: it.notes || "",
    });
    setEditId(it.investment_id);
    setShow(true);
  };

  const closeModal = () => {
    setShow(false);
    setEditId(null);
    setForm(EMPTY);
  };

  const del = async (id) => { await api.delete(`/investments/${id}`); load(); setLiveFetched(false); };

  const gainPositive = (summary?.total_gain ?? 0) >= 0;

  // Compute live-adjusted summary
  const liveSummary = (() => {
    if (!items.length) return null;
    let totalInvested = 0;
    let totalCurrent = 0;
    for (const it of items) {
      const inv = Number(it.amount_invested) || 0;
      const lq = liveQuotes[it.investment_id];
      // Use live price if available, else stored current_value
      const cur = lq?.live_price != null ? lq.live_price : (Number(it.current_value) || 0);
      totalInvested += inv;
      totalCurrent += cur;
    }
    const gain = totalCurrent - totalInvested;
    const roi = totalInvested ? (gain / totalInvested) * 100 : 0;
    return { total_invested: totalInvested, total_current: totalCurrent, net_worth: totalCurrent, total_gain: gain, roi_pct: roi };
  })();

  const displaySummary = liveFetched ? liveSummary : summary;
  const liveCount = Object.values(liveQuotes).filter(q => q.live_price != null).length;

  return (
    <Page>
      <PageHeader
        testid="investments-header"
        title={t("page.investments.title")}
        subtitle={t("page.investments.subtitle")}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={fetchLivePrices}
              disabled={liveLoading || !items.length}
              data-testid="refresh-prices"
              className="flex items-center gap-2 border border-border px-3 py-2.5 rounded-xl text-sm hover:bg-secondary transition-colors disabled:opacity-50"
              title="Refresh live prices from Yahoo Finance"
            >
              {liveLoading ? <Spinner size={14} className="animate-spin" /> : <ArrowsClockwise size={14} weight="duotone" />}
              <span className="hidden sm:inline">{liveLoading ? t("button.fetching") : t("button.refresh_prices")}</span>
            </button>
            <button onClick={() => setShow(true)} data-testid="add-investment" className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity">
              <Plus size={16} weight="bold" /> {t("button.add_investment")}
            </button>
          </div>
        }
      />

      <SmartAddBar target="investment" onAdded={() => { load(); setLiveFetched(false); }} />

      <PanelChat
        contextLabel="Investments"
        systemHint="The user is on the Investment Tracker page. Help them understand their portfolio, ask about specific holdings, analyze performance, suggest diversification, and answer questions about their investments."
        storageKey="panel_chat_investments"
      />

      {/* Live prices status bar */}
      {items.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
          <Globe size={12} weight="duotone" />
          {liveLoading ? (
            <span>{t("market.fetching")}</span>
          ) : liveFetched ? (
            <span>
              {liveCount > 0
                ? `${liveCount} of ${items.length} holdings updated with live prices · `
                : "Could not fetch live prices — showing stored values. "}
              <button onClick={fetchLivePrices} className="text-primary hover:underline">Refresh</button>
            </span>
          ) : (
            <span>{t("market.fetching")}</span>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Stat label={t("stat.net_worth")} value={money(displaySummary?.net_worth)} big />
        <Stat label={t("stat.invested")} value={money(displaySummary?.total_invested)} />
        <Stat label={t("stat.current_value")} value={money(displaySummary?.total_current)} />
        <Stat label={t("stat.total_roi")} value={`${(displaySummary?.roi_pct ?? 0).toFixed(1)}%`} accent={(displaySummary?.total_gain ?? 0) >= 0} danger={(displaySummary?.total_gain ?? 0) < 0} />
      </div>

      {items.length === 0 ? (
        <div className="border border-dashed border-border rounded-2xl p-16 text-center" data-testid="investments-empty">
          <TrendUp size={40} weight="duotone" className="text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">{t("empty.investments")}</p>
        </div>
      ) : (
        <div className="border border-border rounded-2xl overflow-hidden bg-card">
          {items.map((it) => {
            const inv = Number(it.amount_invested) || 0;
            const lq = liveQuotes[it.investment_id];
            const livePrice = lq?.live_price;
            const storedCur = Number(it.current_value) || 0;
            const cur = livePrice != null ? livePrice : storedCur;
            const roi = inv ? (((cur - inv) / inv) * 100).toFixed(1) : "0.0";
            const up = cur >= inv;
            const currency = lq?.currency || "";
            const exchange = lq?.exchange || "";
            const market = lq?.market || "";
            const changePct = lq?.change_percent;
            const marketState = lq?.market_state || "";
            const isLive = livePrice != null;

            return (
              <div key={it.investment_id} className="flex items-center gap-4 p-4 border-b border-border/60 last:border-0 cursor-pointer hover:bg-secondary/30 transition-colors" data-testid={`investment-${it.investment_id}`} onClick={() => editInvestment(it)}>
                <div className="w-9 h-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
                  <ChartPieSlice size={18} weight="duotone" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{it.name}</p>
                  <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{TYPE_LABEL(it.asset_type)}</span>
                    {isLive && (
                      <>
                        <span className="text-[9px] text-muted-foreground">·</span>
                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                          <Globe size={9} weight="duotone" />
                          {market || exchange || "US"}
                        </span>
                        {marketState === "REGULAR" && (
                          <span className="text-[9px] bg-accent/15 text-accent rounded px-1 py-0.5 font-medium">LIVE</span>
                        )}
                        {marketState === "CLOSED" && (
                          <span className="text-[9px] bg-secondary text-muted-foreground rounded px-1 py-0.5">CLOSED</span>
                        )}
                        {changePct != null && (
                          <span className={`text-[10px] tabular font-medium ${changePct >= 0 ? "text-accent" : "text-destructive"}`}>
                            {changePct >= 0 ? "▲" : "▼"} {Math.abs(changePct).toFixed(2)}%
                          </span>
                        )}
                      </>
                    )}
                    {it.ticker && (
                      <>
                        <span className="text-[9px] text-muted-foreground">·</span>
                        <span className="text-[10px] text-muted-foreground font-mono">{it.ticker}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm tabular font-medium">
                    {money(cur, currency)}
                    {!isLive && cur > 0 && <span className="text-[9px] text-muted-foreground ml-1">(stored)</span>}
                  </p>
                  <p className={`text-xs tabular ${up ? "text-accent" : "text-destructive"}`}>{up ? "+" : ""}{roi}%</p>
                </div>
                <button onClick={(e) => { e.stopPropagation(); del(it.investment_id); }} data-testid={`delete-investment-${it.investment_id}`} className="text-destructive p-2 hover:bg-destructive/10 rounded shrink-0"><Trash size={16} /></button>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={show} onClose={closeModal} title={editId ? "Edit investment" : t("button.add_investment")} testid="investment-form">
        <div className="grid md:grid-cols-2 gap-3">
          <Field label={t("field.name_required")} value={form.name} onChange={(v) => setF("name", v)} testid="inv-name" />
          <div>
            <label className="text-[11px] tracking-[0.1em] uppercase text-muted-foreground">Type</label>
            <select value={form.asset_type} onChange={(e) => setF("asset_type", e.target.value)} data-testid="inv-type" className="mt-1 w-full bg-background border border-input rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              {types.map((ty) => <option key={ty} value={ty}>{TYPE_LABEL(ty)}</option>)}
            </select>
          </div>
          <Field label={t("field.ticker")} value={form.ticker} onChange={(v) => setF("ticker", v)} testid="inv-ticker" />
          <div>
            <label className="text-[11px] tracking-[0.1em] uppercase text-muted-foreground">Market (optional)</label>
            <select value={form.market} onChange={(e) => setF("market", e.target.value)} data-testid="inv-market" className="mt-1 w-full bg-background border border-input rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="">Auto-detect</option>
              <option value="US">US Market</option>
              <option value="NSE">NSE (India)</option>
              <option value="BSE">BSE (India)</option>
              <option value="Crypto">Crypto</option>
            </select>
          </div>
          <Field label={t("field.amount_invested")} value={form.amount_invested} onChange={(v) => setF("amount_invested", v)} testid="inv-invested" numeric />
          <Field label={t("page.current_value_optional")} value={form.current_value} onChange={(v) => setF("current_value", v)} testid="inv-current" numeric />
          <Field label={t("field.purchase_date")} value={form.purchase_date} onChange={(v) => setF("purchase_date", v)} />
          <Field label={t("field.notes")} value={form.notes} onChange={(v) => setF("notes", v)} />
        </div>
        <div className="mt-4 p-3 rounded-xl bg-primary/5 border border-primary/20 text-xs text-muted-foreground">
          <p className="flex items-center gap-1.5"><CurrencyDollar size={12} weight="duotone" className="text-primary" /> Tip: Add a ticker (e.g. AAPL, RELIANCE.NS, BTC-USD) to get live prices automatically. The system auto-detects the market — US stocks, Indian NSE/BSE, and crypto are all supported.</p>
        </div>
        <div className="flex justify-between gap-2 mt-6">
          {editId && (
            <button onClick={() => { del(editId); closeModal(); }} className="px-4 py-2.5 rounded-xl border border-destructive/30 text-destructive text-sm hover:bg-destructive/10 transition-colors flex items-center gap-2">
              <Trash size={14} /> {t("button.delete")}
            </button>
          )}
          <div className="flex gap-2 ml-auto">
            <button onClick={closeModal} className="px-4 py-2.5 rounded-xl border border-border text-sm hover:bg-secondary transition-colors">{t("button.cancel")}</button>
            <button onClick={add} data-testid="submit-investment" className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity">{t("button.save")}</button>
          </div>
        </div>
      </Modal>
    </Page>
  );
}

function Stat({ label, value, big, accent, danger }) {
  return (
    <div className={`border border-border rounded-2xl p-5 bg-card ${big ? "md:col-span-1" : ""}`}>
      <p className="text-[10px] tracking-[0.15em] uppercase text-muted-foreground">{label}</p>
      <p className={`font-heading font-black tabular mt-2 ${big ? "text-3xl text-primary" : "text-2xl"} ${accent ? "text-accent" : ""} ${danger ? "text-destructive" : ""}`}>{value}</p>
    </div>
  );
}

function Field({ label, value, onChange, testid, numeric }) {
  return (
    <div>
      <label className="text-[11px] tracking-[0.1em] uppercase text-muted-foreground">{label}</label>
      <input value={value} data-testid={testid} onChange={(e) => onChange(e.target.value)} inputMode={numeric ? "decimal" : "text"} className="mt-1 w-full bg-background border border-input rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
    </div>
  );
}