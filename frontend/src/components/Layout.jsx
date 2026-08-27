import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { api } from "../lib/api";
import LanguageSwitcher from "./LanguageSwitcher";
import {
  House, ChatCircleText, IdentificationCard, ShieldCheck, Vault as VaultIcon,
  FileText, Package, HandHeart, SignOut, Sun, MoonStars, List, X, PuzzlePiece, ChartLineUp, TrendUp, Bank, Confetti, Bell, EnvelopeSimple, ArrowLeft,
} from "@phosphor-icons/react";

const NAV = [
  { to: "/dashboard", labelKey: "nav.dashboard", icon: House },
  { to: "/reminders", labelKey: "nav.reminders", icon: Bell, badge: true },
  { to: "/chat", labelKey: "chat.title", icon: ChatCircleText },
  { to: "/insights", labelKey: "nav.insights", icon: ChartLineUp },
  { to: "/investments", labelKey: "nav.investments", icon: TrendUp },
  { to: "/loans", labelKey: "nav.loan_prep", icon: Bank },
  { to: "/life-events", labelKey: "nav.life_events", icon: Confetti },
  { to: "/profile", labelKey: "nav.profile", icon: IdentificationCard },
  { to: "/insurance", labelKey: "nav.insurance", icon: ShieldCheck },
  { to: "/vault", labelKey: "nav.vault", icon: VaultIcon },
  { to: "/gmail", labelKey: "nav.gmail", icon: EnvelopeSimple },
  { to: "/forms", labelKey: "nav.form_filler", icon: FileText },
  { to: "/bundler", labelKey: "nav.bundler", icon: Package },
  { to: "/legacy", labelKey: "nav.legacy", icon: HandHeart },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(document.documentElement.classList.contains("dark"));
  const [reminderCount, setReminderCount] = useState(0);

  useEffect(() => {
    api.get("/reminders").then(({ data }) => setReminderCount(data.count || 0)).catch(() => {});
  }, [location.pathname]);

  const toggleTheme = () => {
    const el = document.documentElement;
    if (el.classList.contains("dark")) {
      el.classList.remove("dark");
      localStorage.setItem("vault_theme", "light");
      setDark(false);
    } else {
      el.classList.add("dark");
      localStorage.setItem("vault_theme", "dark");
      setDark(true);
    }
  };

  const doLogout = async () => {
    await logout();
    navigate("/login");
  };

  const SidebarInner = (suffix = "") => (
    <div className="flex flex-col h-full">
      <div className="px-6 py-6 border-b border-border">
        <Link to="/chat" className="flex items-center gap-2" data-testid={`brand-logo${suffix}`}>
          <ShieldCheck size={26} weight="duotone" className="text-primary" />
          <span className="font-heading font-black text-lg tracking-tight">EVERKIN</span>
        </Link>
        <p className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground mt-1">{t("app.tagline")}</p>
      </div>
      <Link to="/chat" data-testid={`back-to-chat${suffix}`} className="flex items-center gap-2 px-6 py-3 text-sm border-b border-border text-primary hover:bg-primary/10 transition-colors font-medium">
        <ArrowLeft size={18} weight="duotone" /> {t("nav.back_to_chat")}
      </Link>
      <nav className="flex-1 py-4 overflow-y-auto scroll-thin">
        {NAV.map((item) => {
          const Active = location.pathname === item.to;
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              data-testid={`nav-${item.to.slice(1)}${suffix}`}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 px-6 py-3 text-sm border-l-2 transition-colors duration-200 ${
                Active
                  ? "border-primary bg-secondary text-foreground font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              }`}
            >
              <Icon size={20} weight={Active ? "fill" : "duotone"} />
              <span className="flex-1">{t(item.labelKey)}</span>
              {item.badge && reminderCount > 0 && (
                <span data-testid={`reminder-badge${suffix}`} className="ml-auto text-[10px] font-bold bg-primary text-primary-foreground rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
                  {reminderCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-4 space-y-3">
        <a
          href="/extension.zip"
          data-testid={`download-extension${suffix}`}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          <PuzzlePiece size={16} weight="duotone" /> {t("label.get_chrome_extension")}
        </a>
        <div className="py-1">
          <LanguageSwitcher />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold shrink-0">
              {(user?.name || user?.email || "U").slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium truncate">{user?.name || "User"}</p>
              <p className="text-[10px] text-muted-foreground truncate">{user?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={toggleTheme} data-testid={`theme-toggle${suffix}`} className="p-2 rounded-xl hover:bg-secondary transition-colors">
              {dark ? <Sun size={16} weight="duotone" /> : <MoonStars size={16} weight="duotone" />}
            </button>
            <button onClick={doLogout} data-testid={`logout-button${suffix}`} className="p-2 rounded-xl hover:bg-secondary text-destructive transition-colors" title={t("common.close")}>
              <SignOut size={16} weight="duotone" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <aside className="hidden md:flex w-64 shrink-0 border-r border-border flex-col fixed inset-y-0 left-0 bg-card z-30">
        {SidebarInner("")}
      </aside>

      {open && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="w-64 bg-card border-r border-border">{SidebarInner("-m")}</div>
          <div className="flex-1 bg-black/60" onClick={() => setOpen(false)} />
        </div>
      )}

      <div className="flex-1 md:ml-64 flex flex-col min-w-0">
        <header className="md:hidden flex items-center justify-between px-4 h-14 border-b border-border bg-card sticky top-0 z-20">
          <button onClick={() => setOpen(!open)} data-testid="mobile-menu-toggle" className="p-2">
            {open ? <X size={22} /> : <List size={22} />}
          </button>
          <span className="font-heading font-black tracking-tight">EVERKIN</span>
          <span className="w-8" />
        </header>
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
