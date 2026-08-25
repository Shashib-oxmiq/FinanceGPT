import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { Page, PageHeader } from "../components/Page";
import { Plus, Trash, ShieldCheck, Sparkle, X, WarningCircle, CheckCircle } from "@phosphor-icons/react";
import Modal from "../components/Modal";

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

  const load = () => api.get("/insurance").then(({ data }) => setPolicies(data));
  useEffect(() => {
    load();
    api.get("/insurance/meta").then(({ data }) => setTypes(data.types));
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
