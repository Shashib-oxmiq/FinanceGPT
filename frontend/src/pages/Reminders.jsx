import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Page, PageHeader } from "../components/Page";
import { Bell, CalendarX, ShieldCheck, Confetti, ArrowRight, CheckCircle } from "@phosphor-icons/react";
import SmartAddBar from "../components/SmartAddBar";
import PanelChat from "../components/PanelChat";
import { useLanguage } from "../contexts/LanguageContext";

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
  const { t } = useLanguage();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = () => {
    setLoading(true);
    api.get("/reminders").then(({ data }) => setItems(data.reminders)).finally(() => setLoading(false));
  };

  useEffect(() => { reload(); }, []);

  return (
    <Page>
      <PageHeader
        testid="reminders-header"
        title={t("page.reminders.title")}
        subtitle={t("page.reminders.subtitle")}
      />

      <SmartAddBar
        target="auto"
        placeholder='e.g. "My car insurance renews on March 15" or "I need to renew my passport by December"'
        onAdded={() => reload()}
      />

      <PanelChat
        contextLabel="Reminders"
        systemHint="The user is on the Reminders page. Help them understand what reminders they have, what's expiring soon, what milestones they're tracking, and suggest actions to stay on top of their documents and insurance renewals."
        storageKey="panel_chat_reminders"
      />

      {loading ? (
        <p className="text-sm text-muted-foreground">Checking your vault…</p>
      ) : items.length === 0 ? (
        <div className="border border-dashed border-border rounded-2xl p-16 text-center" data-testid="reminders-empty">
          <CheckCircle size={40} weight="duotone" className="text-accent mx-auto mb-4" />
          <p className="text-muted-foreground">{t("empty.reminders")}</p>
          <p className="text-xs text-muted-foreground mt-2">{t("empty.reminders_hint")}</p>
        </div>
      ) : (
        <div className="space-y-3" data-testid="reminders-list">
          {items.map((r) => {
            const Icon = ICONS[r.type] || Bell;
            return (
              <Link key={r.id} to={r.link} data-testid={`reminder-${r.id}`}
                className={`flex items-center gap-4 border border-border border-l-4 ${SEV[r.severity] || SEV.low} rounded-2xl p-4 bg-card hover:bg-secondary/40 transition-colors group`}>
                <div className="w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
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
