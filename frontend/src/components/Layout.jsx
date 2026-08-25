import { Link, useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  House, ChatCircleText, IdentificationCard, ShieldCheck, Vault as VaultIcon,
  FileText, Package, HandHeart, SignOut, Sun, MoonStars, List, X, PuzzlePiece, ChartLineUp,
} from "@phosphor-icons/react";

const NAV = [
  { to: "/dashboard", label: "Overview", icon: House },
  { to: "/chat", label: "AI Advisor", icon: ChatCircleText },
  { to: "/insights", label: "Money Insights", icon: ChartLineUp },
  { to: "/profile", label: "Profile", icon: IdentificationCard },
  { to: "/insurance", label: "Insurance", icon: ShieldCheck },
  { to: "/vault", label: "Document Vault", icon: VaultIcon },
  { to: "/forms", label: "Form Filler", icon: FileText },
  { to: "/bundler", label: "Doc Bundler", icon: Package },
  { to: "/legacy", label: "Next-of-Kin", icon: HandHeart },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(document.documentElement.classList.contains("dark"));

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
        <Link to="/dashboard" className="flex items-center gap-2" data-testid={`brand-logo${suffix}`}>
          <ShieldCheck size={26} weight="duotone" className="text-primary" />
          <span className="font-heading font-black text-lg tracking-tight">EVERKIN</span>
        </Link>
        <p className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground mt-1">Secure Financial Vault</p>
      </div>
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
              {item.label}
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
          <PuzzlePiece size={16} weight="duotone" /> Get Chrome Extension
        </a>
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
            <button onClick={toggleTheme} data-testid={`theme-toggle${suffix}`} className="p-2 rounded-md hover:bg-secondary transition-colors">
              {dark ? <Sun size={16} weight="duotone" /> : <MoonStars size={16} weight="duotone" />}
            </button>
            <button onClick={doLogout} data-testid={`logout-button${suffix}`} className="p-2 rounded-md hover:bg-secondary text-destructive transition-colors">
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
