import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, API } from "../lib/api";
import { Page, PageHeader } from "../components/Page";
import { catLabel } from "../lib/categories";
import {
  Confetti, House, Baby, Island, Heart, Briefcase, Flower, AirplaneTilt,
  CheckCircle, WarningCircle, Package, Lightbulb, Sparkle, ArrowLeft, BellRinging, BellSlash,
} from "@phosphor-icons/react";

const ICONS = {
  buy_home: House,
  new_baby: Baby,
  retirement: Island,
  marriage: Heart,
  new_job: Briefcase,
  bereavement: Flower,
  moving_abroad: AirplaneTilt,
};

const BLURB = {
  buy_home: "Mortgage, proof of funds, and everything a lender asks for.",
  new_baby: "Registrations, cover and the paperwork a new arrival needs.",
  retirement: "Pensions, investments and estate planning in one place.",
  marriage: "Merge finances, update nominees and legal documents.",
  new_job: "Onboarding, tax and payroll documents ready to share.",
  bereavement: "A calm, step-by-step handover of a loved one's affairs.",
  moving_abroad: "Visas, records and finances organised for the move.",
};

export default function LifeEvents() {
  const [events, setEvents] = useState([]);
  const [active, setActive] = useState(null);
  const [guide, setGuide] = useState(null);
  const [loading, setLoading] = useState(false);
  const [building, setBuilding] = useState(false);
  const [tracked, setTracked] = useState([]);

  useEffect(() => {
    api.get("/life-events").then(({ data }) => setEvents(data.events)).catch(() => {});
    api.get("/life-events/tracked").then(({ data }) => setTracked(data.map((t) => t.event))).catch(() => {});
  }, []);

  const isTracked = active && tracked.includes(active.key);

  const toggleTrack = async () => {
    if (!active || !guide) return;
    try {
      if (isTracked) {
        await api.delete(`/life-events/track/${active.key}`);
        setTracked((t) => t.filter((k) => k !== active.key));
        toast.success("Milestone reminder removed");
      } else {
        await api.post("/life-events/track", {
          event: active.key,
          title: guide.title,
          checklist: guide.checklist,
          recommended_categories: guide.recommended_categories,
        });
        setTracked((t) => [...t, active.key]);
        toast.success("Tracking this milestone — we'll remind you");
      }
    } catch { toast.error("Could not update reminder"); }
  };

  const openEvent = async (ev) => {
    setActive(ev);
    setGuide(null);
    setLoading(true);
    try {
      const { data } = await api.post("/life-events/guide", { event: ev.key });
      setGuide(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not build the guide");
      setActive(null);
    } finally {
      setLoading(false);
    }
  };

  const buildBundle = async () => {
    const ids = guide?.have_document_ids || [];
    if (ids.length === 0) return toast.error("No matching documents in your Vault yet");
    setBuilding(true);
    try {
      const token = localStorage.getItem("vault_token");
      const res = await fetch(`${API}/bundle/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        credentials: "include",
        body: JSON.stringify({ name: `${guide.title} pack`, document_ids: ids }),
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${guide.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-pack.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Document pack downloaded");
    } catch {
      toast.error("Could not build the bundle");
    } finally {
      setBuilding(false);
    }
  };

  if (active) {
    const Icon = ICONS[active.key] || Confetti;
    return (
      <Page>
        <button onClick={() => { setActive(null); setGuide(null); }} data-testid="life-event-back" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors mb-4">
          <ArrowLeft size={16} /> All life events
        </button>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
            <Icon size={26} weight="duotone" />
          </div>
          <div>
            <h1 className="font-heading text-2xl md:text-3xl font-black">{active.title}</h1>
            <p className="text-sm text-muted-foreground">Guided checklist &amp; document pack</p>
          </div>
        </div>

        {loading && (
          <div className="border border-border rounded-lg p-16 text-center bg-card" data-testid="life-event-loading">
            <Sparkle size={32} weight="duotone" className="text-primary mx-auto mb-3 animate-spin" />
            <p className="text-muted-foreground text-sm">Building your personalised checklist…</p>
          </div>
        )}

        {guide && (
          <div className="space-y-6 animate-fade-up" data-testid="life-event-guide">
            {guide.summary && <p className="text-sm text-muted-foreground border border-border rounded-lg p-4 bg-card">{guide.summary}</p>}

            <div className="border border-border rounded-lg p-6 bg-card">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <h3 className="font-heading text-lg font-bold flex items-center gap-2"><CheckCircle size={18} weight="duotone" className="text-primary" /> Your checklist</h3>
                <div className="flex items-center gap-2">
                  <button onClick={toggleTrack} data-testid="track-milestone"
                    className={`flex items-center gap-2 border px-4 py-2.5 rounded-md text-sm font-semibold transition-colors ${isTracked ? "border-primary text-primary bg-primary/10" : "border-border hover:bg-secondary"}`}>
                    {isTracked ? <BellSlash size={16} weight="duotone" /> : <BellRinging size={16} weight="duotone" />}
                    {isTracked ? "Tracking" : "Remind me"}
                  </button>
                  <button onClick={buildBundle} disabled={building || (guide.have_document_ids || []).length === 0} data-testid="build-event-bundle"
                    className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60">
                    <Package size={16} weight="bold" /> {building ? "Building…" : `Build pack (${(guide.have_document_ids || []).length})`}
                  </button>
                </div>
              </div>
              <ul className="space-y-3">
                {(guide.checklist || []).map((item, i) => {
                  const have = (guide.matched_documents || []).some((m) => m.category === item.category);
                  return (
                    <li key={i} className="flex items-start gap-3 text-sm border-b border-border/50 pb-3 last:border-0 last:pb-0" data-testid={`checklist-item-${i}`}>
                      {have
                        ? <CheckCircle size={18} weight="fill" className="text-accent shrink-0 mt-0.5" />
                        : <WarningCircle size={18} weight="duotone" className="text-[hsl(var(--warning))] shrink-0 mt-0.5" />}
                      <div className="min-w-0">
                        <p className="font-medium">
                          {item.item}
                          {item.required && <span className="ml-2 text-[10px] uppercase tracking-wider text-destructive">Required</span>}
                        </p>
                        {item.why && <p className="text-muted-foreground text-xs mt-0.5">{item.why}</p>}
                        <span className="inline-block mt-1 text-[10px] uppercase tracking-wider bg-secondary rounded px-1.5 py-0.5 text-muted-foreground">{catLabel(item.category)}{have ? " · in vault" : " · missing"}</span>
                      </div>
                    </li>
                  );
                })}
                {(guide.checklist || []).length === 0 && <li className="text-muted-foreground">No checklist generated.</li>}
              </ul>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="border border-border rounded-lg p-6 bg-card">
                <h3 className="text-xs tracking-[0.15em] uppercase mb-3 flex items-center gap-1 text-accent"><CheckCircle size={16} weight="duotone" /> Documents you have</h3>
                {(guide.matched_documents || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">None yet — upload in the Vault.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {guide.matched_documents.map((m) => (
                      <li key={m.category}>
                        <p className="text-muted-foreground text-xs uppercase tracking-wider">{catLabel(m.category)}</p>
                        {m.documents.map((d) => <p key={d.document_id} className="truncate">• {d.filename}</p>)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="border border-border rounded-lg p-6 bg-card">
                <h3 className="text-xs tracking-[0.15em] uppercase mb-3 flex items-center gap-1 text-[hsl(var(--warning))]"><WarningCircle size={16} weight="duotone" /> Still to gather</h3>
                {(guide.missing_categories || []).length === 0 ? (
                  <p className="text-sm text-accent">You're all set — nothing missing!</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {guide.missing_categories.map((c) => (
                      <span key={c} className="text-xs bg-secondary rounded-full px-3 py-1.5 text-muted-foreground">{catLabel(c)}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {(guide.tips || []).length > 0 && (
              <div className="border border-border rounded-lg p-6 bg-card">
                <h3 className="text-xs tracking-[0.15em] uppercase mb-3 flex items-center gap-1 text-primary"><Lightbulb size={16} weight="duotone" /> Tips</h3>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  {guide.tips.map((t, i) => <li key={i}>• {t}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        testid="life-events-header"
        title="Life Event Guides"
        subtitle="Big moments come with big paperwork. Pick a milestone and Everkin builds a tailored checklist and gathers the right documents into a ready-to-share pack."
      />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {events.map((ev) => {
          const Icon = ICONS[ev.key] || Confetti;
          return (
            <button key={ev.key} onClick={() => openEvent(ev)} data-testid={`life-event-${ev.key}`}
              className="text-left border border-border rounded-lg p-6 bg-card hover:-translate-y-1 hover:border-primary/50 transition-all group">
              <div className="w-11 h-11 rounded-lg bg-primary/15 text-primary flex items-center justify-center mb-4 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <Icon size={24} weight="duotone" />
              </div>
              <h3 className="font-heading text-lg font-bold">{ev.title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{BLURB[ev.key] || "A guided checklist for this milestone."}</p>
            </button>
          );
        })}
      </div>
    </Page>
  );
}
