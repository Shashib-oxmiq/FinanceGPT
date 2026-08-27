import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, API } from "../lib/api";
import { Page, PageHeader } from "../components/Page";
import { HandHeart, Plus, Trash, DownloadSimple, ShieldCheck, Users, X } from "@phosphor-icons/react";
import Modal from "../components/Modal";
import SmartAddBar from "../components/SmartAddBar";
import PanelChat from "../components/PanelChat";
import { useLanguage } from "../contexts/LanguageContext";

const EMPTY = { name: "", relationship: "spouse", email: "", phone: "", access_level: "full", notes: "" };

export default function Legacy() {
  const { t } = useLanguage();
  const [contacts, setContacts] = useState([]);
  const [pack, setPack] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = () => {
    api.get("/legacy/contacts").then(({ data }) => setContacts(data));
    api.get("/legacy/pack").then(({ data }) => setPack(data));
  };
  useEffect(() => { load(); }, []);

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const add = async () => {
    if (!form.name) return toast.error("Name is required");
    await api.post("/legacy/contacts", form);
    toast.success("Contact added");
    setForm(EMPTY); setShowForm(false); load();
  };

  const del = async (id) => { await api.delete(`/legacy/contacts/${id}`); load(); };

  const exportPack = async (includeDocuments) => {
    setExporting(true);
    try {
      const token = localStorage.getItem("vault_token");
      const res = await fetch(`${API}/legacy/export?include_documents=${includeDocuments}`, {
        method: "POST",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        credentials: "include",
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "legacy_handover_pack.zip"; a.click();
      URL.revokeObjectURL(url);
      toast.success("Handover pack downloaded");
    } catch { toast.error("Export failed"); }
    finally { setExporting(false); }
  };

  return (
    <Page>
      <PageHeader
        testid="legacy-header"
        title={t("page.legacy.title")}
        subtitle={t("page.legacy.subtitle")}
        actions={
          <button onClick={() => setShowForm(true)} data-testid="add-contact" className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity">
            <Plus size={16} weight="bold" /> Add contact
          </button>
        }
      />

      <SmartAddBar target="contact" onAdded={load} />

      <PanelChat
        contextLabel="Legacy & Next-of-Kin"
        systemHint="The user is on the Legacy & Next-of-Kin page. Help them understand their legacy contacts, who has access to what, estate planning, and answer questions about their trusted contacts and document access."
        storageKey="panel_chat_legacy"
      />

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <div className="border border-border rounded-2xl p-6 bg-card" data-testid="contacts-panel">
            <h3 className="font-heading text-lg font-bold mb-4 flex items-center gap-2"><Users size={18} weight="duotone" className="text-primary" /> Trusted contacts</h3>
            {contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No next-of-kin added yet. Add your spouse or a trusted person.</p>
            ) : (
              <div className="space-y-2">
                {contacts.map((c) => (
                  <div key={c.contact_id} className="flex items-center justify-between border border-border rounded-xl p-3" data-testid={`contact-${c.contact_id}`}>
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{c.name} <span className="text-muted-foreground font-normal">· {c.relationship}</span></p>
                      <p className="text-xs text-muted-foreground truncate">{c.email} {c.phone && `· ${c.phone}`}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] uppercase tracking-wider text-primary">{c.access_level} access</span>
                      <button onClick={() => del(c.contact_id)} data-testid={`delete-contact-${c.contact_id}`} className="text-destructive p-1"><Trash size={15} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border border-border rounded-2xl p-6 bg-card" data-testid="pack-summary">
            <h3 className="font-heading text-lg font-bold mb-4">Handover pack contents</h3>
            <div className="grid grid-cols-3 gap-4 text-center">
              <Metric label="Policies" value={pack?.policy_count ?? 0} />
              <Metric label="Documents" value={pack?.document_count ?? 0} />
              <Metric label="Sum Assured" value={pack ? `${Number(pack.total_sum_assured || 0).toLocaleString()}` : 0} />
            </div>
          </div>
        </div>

        <div className="border border-border rounded-2xl p-6 bg-card h-fit">
          <HandHeart size={30} weight="duotone" className="text-accent mb-3" />
          <h3 className="font-heading text-lg font-bold">Generate handover pack</h3>
          <p className="text-sm text-muted-foreground mt-1">A single .zip with a readable summary, structured data, and (optionally) all your documents — everything your family needs.</p>
          <div className="mt-4 space-y-2">
            <button onClick={() => exportPack(true)} disabled={exporting} data-testid="export-full" className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity disabled:opacity-60">
              <DownloadSimple size={16} weight="bold" /> {exporting ? "Building…" : "Full pack + documents"}
            </button>
            <button onClick={() => exportPack(false)} disabled={exporting} data-testid="export-summary" className="w-full flex items-center justify-center gap-2 border border-border py-3 rounded-xl font-medium hover:bg-secondary transition-colors disabled:opacity-60">
              <ShieldCheck size={16} weight="duotone" /> Summary only
            </button>
          </div>
        </div>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Add trusted contact" testid="contact-form">
            <div className="grid grid-cols-2 gap-3">
              <Inp label="Name *" value={form.name} onChange={(v) => setF("name", v)} testid="contact-name" />
              <Sel label={t("field.relationship")} value={form.relationship} onChange={(v) => setF("relationship", v)} options={["spouse", "partner", "child", "parent", "sibling", "friend", "other"]} />
              <Inp label="Email" value={form.email} onChange={(v) => setF("email", v)} testid="contact-email" />
              <Inp label={t("field.phone")} value={form.phone} onChange={(v) => setF("phone", v)} />
              <Sel label={t("field.access_level")} value={form.access_level} onChange={(v) => setF("access_level", v)} options={["full", "financial", "insurance"]} />
              <Inp label={t("field.notes")} value={form.notes} onChange={(v) => setF("notes", v)} />
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowForm(false)} className="px-4 py-2.5 rounded-xl border border-border text-sm hover:bg-secondary transition-colors">Cancel</button>
              <button onClick={add} data-testid="submit-contact" className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity">Save</button>
            </div>
      </Modal>
    </Page>
  );
}

function Metric({ label, value }) {
  return (
    <div>
      <p className="font-heading text-2xl font-black tabular">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{label}</p>
    </div>
  );
}
function Inp({ label, value, onChange, testid }) {
  return (
    <div>
      <label className="text-[11px] tracking-[0.1em] uppercase text-muted-foreground">{label}</label>
      <input value={value} data-testid={testid} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full bg-background border border-input rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
    </div>
  );
}
function Sel({ label, value, onChange, options }) {
  return (
    <div>
      <label className="text-[11px] tracking-[0.1em] uppercase text-muted-foreground">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full bg-background border border-input rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
        {options.map((o) => <option key={o} value={o}>{o[0].toUpperCase() + o.slice(1)}</option>)}
      </select>
    </div>
  );
}
