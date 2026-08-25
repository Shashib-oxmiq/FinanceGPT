import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, API } from "../lib/api";
import { Page, PageHeader } from "../components/Page";
import { Plus, Trash, ShieldCheck, Sparkle, X, WarningCircle, CheckCircle, SpeakerHigh, FileMagnifyingGlass } from "@phosphor-icons/react";
import Modal from "../components/Modal";

const AUDIO_BASE = API.replace(/\/api$/, "");

const EMPTY = {
  policy_type: "life_term", provider: "", policy_number: "", sum_assured: "", premium_amount: "",
  premium_frequency: "annual", start_date: "", maturity_date: "", nominee_name: "",
  nominee_relationship: "", riders: "", claim_contact: "", agent_contact: "", notes: "",
};

const TYPE_LABEL = (t) => t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default function Insurance() {
  const [policies, setPolicies] = useState([]);
  const [types, setTypes] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [review, setReview] = useState(null);
  const [reviewing, setReviewing] = useState(false);
  const [guideType, setGuideType] = useState("health");
  const [guideDoc, setGuideDoc] = useState("");
  const [insDocs, setInsDocs] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [speaking, setSpeaking] = useState(false);

  const analyzePolicy = async () => {
    setAnalyzing(true); setAnalysis(null); setAudioUrl(null);
    try {
      const { data } = await api.post("/insurance/analyze", { insurance_type: guideType, document_id: guideDoc || null });
      setAnalysis(data);
    } catch (e) { toast.error(e.response?.data?.detail || "Could not analyze policy"); }
    finally { setAnalyzing(false); }
  };

  const speak = async () => {
    if (!analysis) return;
    setSpeaking(true);
    const parts = [
      `Here is your ${analysis.policy_type || guideType} policy guide.`,
      analysis.summary,
      "What is covered: " + (analysis.covered || []).map((c) => `${c.item}${c.conditions ? ", " + c.conditions : ""}`).join(". "),
      "What is not covered: " + (analysis.not_covered || []).join(". "),
      "During an incident, do: " + (analysis.dos || []).join(". "),
      "Do not: " + (analysis.donts || []).join(". "),
    ];
    try {
      const { data } = await api.post("/tts", { text: parts.filter(Boolean).join(". "), voice: "sage" });
      setAudioUrl(`${AUDIO_BASE}${data.url}`);
    } catch { toast.error("Voice generation failed"); }
    finally { setSpeaking(false); }
  };

  const load = () => api.get("/insurance").then(({ data }) => setPolicies(data));
  useEffect(() => {
    load();
    api.get("/insurance/meta").then(({ data }) => setTypes(data.types));
    api.get("/documents?category=insurance").then(({ data }) => setInsDocs(data)).catch(() => {});
  }, []);

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const add = async () => {
    if (!form.provider) return toast.error("Provider is required");
    try {
      await api.post("/insurance", form);
      toast.success("Policy added");
      setForm(EMPTY);
      setShowForm(false);
      load();
    } catch { toast.error("Failed to add policy"); }
  };

  const del = async (id) => {
    await api.delete(`/insurance/${id}`);
    load();
  };

  const runReview = async () => {
    setReviewing(true);
    try {
      const { data } = await api.post("/insurance/review", { question: "" });
      setReview(data);
    } catch { toast.error("Review failed"); }
    finally { setReviewing(false); }
  };

  return (
    <Page>
      <PageHeader
        testid="insurance-header"
        title="Insurance Portfolio"
        subtitle="Track every policy with nominees, riders and claim contacts — the details your family needs to actually file a claim."
        actions={
          <div className="flex gap-2">
            <button onClick={runReview} disabled={reviewing} data-testid="ai-review" className="flex items-center gap-2 border border-border px-4 py-2.5 rounded-md text-sm font-semibold hover:bg-secondary transition-colors disabled:opacity-60">
              <Sparkle size={16} weight="duotone" /> {reviewing ? "Analyzing…" : "AI Review"}
            </button>
            <button onClick={() => setShowForm(true)} data-testid="add-policy" className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity">
              <Plus size={16} weight="bold" /> Add policy
            </button>
          </div>
        }
      />

      {review && (
        <div className="border border-border rounded-lg p-6 bg-card mb-6 animate-fade-up" data-testid="review-panel">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading text-lg font-bold flex items-center gap-2"><Sparkle size={18} weight="duotone" className="text-primary" /> Portfolio Review</h3>
            <span className="font-heading text-3xl font-black tabular text-primary">{review.health_score}<span className="text-sm text-muted-foreground">/100</span></span>
          </div>
          <p className="text-sm text-muted-foreground mb-4">{review.summary}</p>
          <div className="grid md:grid-cols-3 gap-4 text-sm">
            <ReviewList title="Gaps" items={review.gaps} icon={WarningCircle} color="text-[hsl(var(--warning))]" />
            <ReviewList title="Recommendations" items={review.recommendations} icon={CheckCircle} color="text-accent" />
            <ReviewList title="Corner Cases" items={review.corner_cases} icon={ShieldCheck} color="text-primary" />
          </div>
        </div>
      )}

      <div className="border border-border rounded-lg p-6 bg-card mb-6" data-testid="policy-guide">
        <h3 className="font-heading text-lg font-bold flex items-center gap-2 mb-1"><FileMagnifyingGlass size={18} weight="duotone" className="text-primary" /> Understand a Policy</h3>
        <p className="text-sm text-muted-foreground mb-4">Get a plain-English guide: what's covered (with conditions), what's not, corner cases, who to call during an incident, and what NOT to do — with voice playback.</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <select value={guideType} onChange={(e) => setGuideType(e.target.value)} data-testid="guide-type" className="bg-background border border-input rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
            {["health", "life", "auto", "home", "travel", "critical illness"].map((t) => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
          </select>
          <select value={guideDoc} onChange={(e) => setGuideDoc(e.target.value)} data-testid="guide-doc" className="flex-1 bg-background border border-input rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="">General guidance (no document)</option>
            {insDocs.map((d) => <option key={d.document_id} value={d.document_id}>{d.original_filename}</option>)}
          </select>
          <button onClick={analyzePolicy} disabled={analyzing} data-testid="analyze-policy" className="flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60">
            <Sparkle size={16} weight="duotone" className={analyzing ? "animate-spin" : ""} /> {analyzing ? "Analyzing…" : "Analyze"}
          </button>
        </div>

        {analysis && (
          <div className="mt-6 animate-fade-up" data-testid="analysis-result">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-muted-foreground flex-1">{analysis.summary}</p>
              <button onClick={speak} disabled={speaking} data-testid="listen-policy" className="flex items-center gap-2 border border-border px-3 py-2 rounded-md text-sm hover:bg-secondary transition-colors disabled:opacity-60 shrink-0 ml-3">
                <SpeakerHigh size={16} weight="duotone" className={speaking ? "animate-pulse" : ""} /> {speaking ? "Preparing…" : "Listen"}
              </button>
            </div>
            {audioUrl && <audio src={audioUrl} controls autoPlay data-testid="policy-audio" className="w-full mb-4" />}
            <div className="grid md:grid-cols-2 gap-4">
              <GuideBox title="Covered (with conditions)" color="text-accent" items={(analysis.covered || []).map((c) => `${c.item}${c.conditions ? " — " + c.conditions : ""}`)} />
              <GuideBox title="Not covered" color="text-destructive" items={analysis.not_covered} />
              <GuideBox title="Corner cases to know" color="text-[hsl(var(--warning))]" items={analysis.corner_cases} />
              <GuideBox title="Emergency numbers" color="text-primary" items={(analysis.emergency_numbers || []).map((e) => `${e.label}: ${e.number}`)} />
              <GuideBox title="During an incident — DO" color="text-accent" items={analysis.dos} />
              <GuideBox title="During an incident — DON'T" color="text-destructive" items={analysis.donts} />
            </div>
            {(analysis.claim_steps || []).length > 0 && (
              <div className="mt-4"><GuideBox title="How to claim" color="text-primary" items={analysis.claim_steps} /></div>
            )}
          </div>
        )}
      </div>

      {policies.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg p-16 text-center" data-testid="insurance-empty">
          <ShieldCheck size={40} weight="duotone" className="text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No policies yet. Add your first policy to build your coverage map.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {policies.map((p) => (
            <div key={p.policy_id} className="border border-border rounded-lg p-6 bg-card hover:-translate-y-1 transition-transform" data-testid={`policy-${p.policy_id}`}>
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] tracking-[0.2em] uppercase text-primary">{TYPE_LABEL(p.policy_type)}</span>
                  <h3 className="font-heading text-lg font-bold">{p.provider}</h3>
                </div>
                <button onClick={() => del(p.policy_id)} data-testid={`delete-policy-${p.policy_id}`} className="text-destructive p-1 hover:bg-secondary rounded"><Trash size={16} /></button>
              </div>
              <dl className="mt-3 space-y-1 text-sm">
                {p.policy_number && <Row k="Policy #" v={p.policy_number} />}
                {p.sum_assured && <Row k="Sum assured" v={p.sum_assured} />}
                {p.nominee_name && <Row k="Nominee" v={`${p.nominee_name} (${p.nominee_relationship || "—"})`} />}
                {p.maturity_date && <Row k="Maturity" v={p.maturity_date} />}
                {p.claim_contact && <Row k="Claim" v={p.claim_contact} />}
              </dl>
              {!p.nominee_name && <p className="mt-3 text-xs text-[hsl(var(--warning))] flex items-center gap-1"><WarningCircle size={14} /> No nominee — benefit may not reach family</p>}
            </div>
          ))}
        </div>
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Add insurance policy" testid="policy-form">
            <div className="grid md:grid-cols-2 gap-3">
              <Select label="Type" value={form.policy_type} onChange={(v) => setF("policy_type", v)} options={types} testid="form-policy-type" />
              <Input label="Provider *" value={form.provider} onChange={(v) => setF("provider", v)} testid="form-provider" />
              <Input label="Policy number" value={form.policy_number} onChange={(v) => setF("policy_number", v)} testid="form-policy-number" />
              <Input label="Sum assured" value={form.sum_assured} onChange={(v) => setF("sum_assured", v)} testid="form-sum-assured" />
              <Input label="Premium amount" value={form.premium_amount} onChange={(v) => setF("premium_amount", v)} />
              <Input label="Premium frequency" value={form.premium_frequency} onChange={(v) => setF("premium_frequency", v)} />
              <Input label="Start date" value={form.start_date} onChange={(v) => setF("start_date", v)} />
              <Input label="Maturity date" value={form.maturity_date} onChange={(v) => setF("maturity_date", v)} />
              <Input label="Nominee name" value={form.nominee_name} onChange={(v) => setF("nominee_name", v)} testid="form-nominee" />
              <Input label="Nominee relationship" value={form.nominee_relationship} onChange={(v) => setF("nominee_relationship", v)} />
              <Input label="Claim contact" value={form.claim_contact} onChange={(v) => setF("claim_contact", v)} />
              <Input label="Agent contact" value={form.agent_contact} onChange={(v) => setF("agent_contact", v)} />
              <Input label="Riders" value={form.riders} onChange={(v) => setF("riders", v)} full />
              <Input label="Notes (corner cases)" value={form.notes} onChange={(v) => setF("notes", v)} full />
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowForm(false)} className="px-4 py-2.5 rounded-md border border-border text-sm hover:bg-secondary transition-colors">Cancel</button>
              <button onClick={add} data-testid="submit-policy" className="px-4 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity">Save policy</button>
            </div>
      </Modal>
    </Page>
  );
}

function Row({ k, v }) {
  return <div className="flex justify-between gap-2"><dt className="text-muted-foreground">{k}</dt><dd className="font-medium text-right truncate">{v}</dd></div>;
}
function GuideBox({ title, items, color }) {
  return (
    <div className="border border-border rounded-md p-4 bg-background/40">
      <p className={`text-xs tracking-[0.15em] uppercase mb-2 ${color}`}>{title}</p>
      <ul className="space-y-1.5 text-sm text-muted-foreground">
        {(items || []).map((it, i) => <li key={i}>• {it}</li>)}
        {(!items || items.length === 0) && <li>—</li>}
      </ul>
    </div>
  );
}

function ReviewList({ title, items, icon: Icon, color }) {
  return (
    <div>
      <p className={`text-xs tracking-[0.15em] uppercase mb-2 flex items-center gap-1 ${color}`}><Icon size={14} weight="duotone" /> {title}</p>
      <ul className="space-y-1.5">{(items || []).map((it, i) => <li key={i} className="text-muted-foreground">• {it}</li>)}</ul>
    </div>
  );
}
function Input({ label, value, onChange, full, testid }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <label className="text-[11px] tracking-[0.1em] uppercase text-muted-foreground">{label}</label>
      <input value={value} data-testid={testid} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full bg-background border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
    </div>
  );
}
function Select({ label, value, onChange, options, testid }) {
  return (
    <div>
      <label className="text-[11px] tracking-[0.1em] uppercase text-muted-foreground">{label}</label>
      <select value={value} data-testid={testid} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full bg-background border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
        {options.map((o) => <option key={o} value={o}>{TYPE_LABEL(o)}</option>)}
      </select>
    </div>
  );
}
