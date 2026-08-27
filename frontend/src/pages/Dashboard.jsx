import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Page, PageHeader } from "../components/Page";
import { useAuth } from "../context/AuthContext";
import {
  ShieldCheck, ChatCircleText, Package, FileText, ArrowUpRight, HandHeart, Vault as VaultI,
} from "@phosphor-icons/react";
import { CATEGORY_LABELS as CAT_LABELS } from "../lib/categories";
import SmartAddBar from "../components/SmartAddBar";
import PanelChat from "../components/PanelChat";
import { useLanguage } from "../contexts/LanguageContext";

export default function Dashboard() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get("/dashboard/stats").then(({ data }) => setStats(data)).catch(() => {});
  }, []);

  const c = stats?.completeness ?? 0;

  return (
    <Page>
      <PageHeader
        testid="dashboard-header"
        title={`Welcome, ${user?.name?.split(" ")[0] || "there"}`}
        subtitle={t("page.dashboard.subtitle")}
      />

      <SmartAddBar
        target="auto"
        onAdded={() => api.get("/dashboard/stats").then(({ data }) => setStats(data))}
      />

      <PanelChat
        contextLabel="Dashboard"
        systemHint="The user is on the Dashboard page. Help them understand their overall profile readiness, what documents they have, what's missing, and suggest next steps to complete their financial life profile."
        storageKey="panel_chat_dashboard"
      />

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <div className="md:col-span-1 lg:col-span-2 border border-border rounded-2xl p-8 bg-card" data-testid="completeness-card">
          <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground">{t("label.profile_readiness")}</p>
          <div className="flex items-end gap-3 mt-4">
            <span className="font-heading text-6xl font-black tabular text-primary">{c}%</span>
            <span className="text-sm text-muted-foreground mb-2">{t("label.complete")}</span>
          </div>
          <div className="mt-4 h-2 rounded-full bg-secondary overflow-hidden">
            <div className="h-full bg-primary transition-all duration-700" style={{ width: `${c}%` }} />
          </div>
          <Link to="/chat" className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-4" data-testid="dashboard-chat-cta">
            {t("label.let_ai_fill_gaps")} <ArrowUpRight size={16} weight="bold" />
          </Link>
        </div>

        <Stat testid="stat-documents" icon={VaultI} label="Documents" value={stats?.document_count ?? 0} to="/vault" />
        <Stat testid="stat-insurance" icon={ShieldCheck} label="Insurance" value={stats?.by_category?.insurance ?? 0} to="/insurance" />
        <Stat testid="stat-forms" icon={FileText} label="Forms Filled" value={stats?.form_count ?? 0} to="/forms" />
        <Stat testid="stat-bundles" icon={Package} label="Bundles" value={stats?.bundle_count ?? 0} to="/bundler" />
        <Stat testid="stat-chats" icon={ChatCircleText} label="Conversations" value={stats?.conversation_count ?? 0} to="/chat" />
        <Stat testid="stat-legacy" icon={HandHeart} label="Legacy Pack" value="Setup" to="/legacy" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        <div className="lg:col-span-2 border border-border rounded-2xl p-6 bg-card" data-testid="category-breakdown">
          <h3 className="font-heading text-lg font-bold mb-4">Documents by Category</h3>
          {stats && Object.keys(stats.by_category || {}).length === 0 ? (
            <p className="text-sm text-muted-foreground">No documents yet. Upload your first file in the Vault.</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(stats?.by_category || {}).map(([cat, n]) => (
                <div key={cat} className="flex items-center gap-3">
                  <span className="text-sm w-32 shrink-0">{CAT_LABELS[cat] || cat}</span>
                  <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-accent" style={{ width: `${Math.min(100, n * 20)}%` }} />
                  </div>
                  <span className="text-sm tabular text-muted-foreground w-6 text-right">{n}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border border-border rounded-2xl p-6 bg-card" data-testid="recent-documents">
          <h3 className="font-heading text-lg font-bold mb-4">Recent Uploads</h3>
          {(stats?.recent_documents || []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing here yet.</p>
          ) : (
            <ul className="space-y-3">
              {stats.recent_documents.map((d) => (
                <li key={d.document_id} className="flex items-center gap-2 text-sm">
                  <FileText size={16} weight="duotone" className="text-primary shrink-0" />
                  <span className="truncate">{d.original_filename}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Page>
  );
}

function Stat({ icon: Icon, label, value, to, testid }) {
  return (
    <Link to={to} data-testid={testid} className="border border-border rounded-2xl p-6 bg-card hover:-translate-y-1 transition-transform">
      <Icon size={24} weight="duotone" className="text-primary" />
      <p className="font-heading text-3xl font-black mt-3 tabular">{value}</p>
      <p className="text-xs tracking-[0.15em] uppercase text-muted-foreground mt-1">{label}</p>
    </Link>
  );
}
