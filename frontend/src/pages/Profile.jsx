import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { Page, PageHeader } from "../components/Page";
import { FloppyDisk } from "@phosphor-icons/react";

const SECTION_LABELS = {
  personal: "Personal", contact: "Contact", identity: "Identity Documents",
  financial: "Financial", education: "Education", immigration: "Immigration", family: "Family & Emergency",
};

const fieldLabel = (f) => f.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const SENSITIVE = ["ssn", "account_number", "passport_number", "national_id", "alien_number"];

export default function Profile() {
  const [schema, setSchema] = useState({});
  const [profile, setProfile] = useState({});
  const [completeness, setCompleteness] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/profile").then(({ data }) => {
      setSchema(data.schema);
      setProfile(data.profile || {});
      setCompleteness(data.completeness);
    });
  }, []);

  const setField = (section, field, value) => {
    setProfile((p) => ({ ...p, [section]: { ...(p[section] || {}), [field]: value } }));
  };

  const save = async () => {
    setBusy(true);
    try {
      const { data } = await api.put("/profile", { profile });
      setCompleteness(data.completeness);
      toast.success("Profile saved");
    } catch {
      toast.error("Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <PageHeader
        testid="profile-header"
        title="Your Profile"
        subtitle="This structured data powers form auto-fill and your legacy handover pack. Sensitive fields are masked."
        actions={
          <button onClick={save} disabled={busy} data-testid="save-profile" className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60">
            <FloppyDisk size={16} weight="duotone" /> {busy ? "Saving…" : "Save"}
          </button>
        }
      />

      <div className="mb-6 flex items-center gap-3">
        <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden max-w-xs">
          <div className="h-full bg-primary transition-all duration-500" style={{ width: `${completeness}%` }} />
        </div>
        <span className="text-sm text-muted-foreground tabular">{completeness}% complete</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.entries(schema).map(([section, fields]) => (
          <div key={section} className="border border-border rounded-lg p-6 bg-card" data-testid={`section-${section}`}>
            <h3 className="font-heading text-lg font-bold mb-4">{SECTION_LABELS[section] || section}</h3>
            <div className="space-y-3">
              {fields.map((f) => (
                <div key={f}>
                  <label className="text-[11px] tracking-[0.1em] uppercase text-muted-foreground">{fieldLabel(f)}</label>
                  <input
                    type={SENSITIVE.includes(f) ? "password" : "text"}
                    value={profile[section]?.[f] || ""}
                    data-testid={`field-${section}-${f}`}
                    onChange={(e) => setField(section, f, e.target.value)}
                    className="mt-1 w-full bg-background border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-shadow"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Page>
  );
}
