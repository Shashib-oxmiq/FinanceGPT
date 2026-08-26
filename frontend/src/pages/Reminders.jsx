import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Page, PageHeader } from "../components/Page";
import { Bell, CalendarX, ShieldCheck, Confetti, ArrowRight, CheckCircle } from "@phosphor-icons/react";

const ICONS = {
  document_expiry: CalendarX,
  insurance_renewal: ShieldCheck,
  milestone_task: Confetti,
};

const SEV = {
  high: "border-l-destructive",
  medium: "border-l-[hsl(var(--warning))]",
  low: "border-l-primary",
};

export default function Reminders() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/reminders").then(({ data }) => setItems(data.reminders)).finally(() => setLoading(false));
  }, []);

  return (
    <Page>
      <PageHeader
        testid="reminders-header"
        title="Reminders"
        subtitle="Everkin keeps an eye on expiring documents, upcoming insurance renewals and the milestones you're working through — so nothing slips."
      />

      {loading ? (
        <p className="text-sm text-muted-foreground">Checking your vault…</p>
      ) : items.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg p-16 text-center" data-testid="reminders-empty">
          <CheckCircle size={40} weight="duotone" className="text-accent mx-auto mb-4" />
          <p className="text-muted-foreground">You're all caught up. No reminders right now.</p>
          <p className="text-xs text-muted-foreground mt-2">Track a milestone under Life Events or upload documents with expiry dates to see nudges here.</p>
        </div>
      ) : (
        <div className="space-y-3" data-testid="reminders-list">
          {items.map((r) => {
            const Icon = ICONS[r.type] || Bell;
            return (
              <Link key={r.id} to={r.link} data-testid={`reminder-${r.id}`}
                className={`flex items-center gap-4 border border-border border-l-4 ${SEV[r.severity] || SEV.low} rounded-lg p-4 bg-card hover:bg-secondary/40 transition-colors group`}>
                <div className="w-10 h-10 rounded-md bg-primary/15 text-primary flex items-center justify-center shrink-0">
                  <Icon size={20} weight="duotone" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{r.title}</p>
                  <p className="text-xs text-muted-foreground">{r.detail}</p>
                </div>
                <ArrowRight size={16} className="text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
              </Link>
            );
          })}
        </div>
      )}
    </Page>
  );
}
