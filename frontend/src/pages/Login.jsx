import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ShieldCheck, GoogleLogo } from "@phosphor-icons/react";
import { api, formatApiErrorDetail } from "../lib/api";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      login(data);
      toast.success("Welcome back");
      navigate("/chat");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setBusy(false);
    }
  };

  const googleLogin = async () => {
    // In Electron: open OAuth in system browser, listen for session_id via IPC
    if (typeof window !== "undefined" && window.electronAPI?.googleLogin) {
      setBusy(true);
      try {
        await window.electronAPI.googleLogin();
        // Listen for the session_id relayed back from the main process
        const stop = window.electronAPI.onGoogleSessionId(async (sessionId) => {
          if (!sessionId) { toast.error("Google sign-in failed"); setBusy(false); return; }
          try {
            const { data } = await api.post(
              "/auth/google/session",
              {},
              { headers: { "X-Session-ID": sessionId } }
            );
            if (data.token) localStorage.setItem("vault_token", data.token);
            login(data);
            toast.success("Welcome back");
            navigate("/chat");
          } catch {
            toast.error("Failed to complete Google sign-in");
          } finally {
            setBusy(false);
            stop();
          }
        });
      } catch {
        toast.error("Failed to open Google sign-in");
        setBusy(false);
      }
      return;
    }
    // Browser fallback: original redirect flow
    const redirectUrl = window.location.origin + "/chat";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <AuthShell title="Sign in" subtitle="Access your secure vault">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email" type="email" value={email} onChange={setEmail} testid="login-email" />
        <Field label="Password" type="password" value={password} onChange={setPassword} testid="login-password" />
        <button type="submit" disabled={busy} data-testid="login-submit" className="w-full bg-primary text-primary-foreground py-3 rounded-xl font-semibold hover:opacity-90 hover:shadow-lg hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none">
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <Divider />
      <button onClick={googleLogin} data-testid="google-login" className="w-full flex items-center justify-center gap-2 border border-border py-3 rounded-xl font-medium hover:bg-secondary hover:shadow-sm transition-all">
        <GoogleLogo size={18} weight="bold" /> Continue with Google
      </button>
      <p className="text-sm text-muted-foreground text-center mt-6">
        No account? <Link to="/register" className="text-primary hover:underline" data-testid="link-register">Create one</Link>
      </p>
    </AuthShell>
  );
}

export function AuthShell({ title, subtitle, children }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background text-foreground">
      <div className="hidden lg:flex flex-col justify-between p-12 border-r border-border relative overflow-hidden">
        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1758073519996-6d3c63b4922c?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200')", backgroundSize: "cover", backgroundPosition: "center" }} />
        <div className="relative flex items-center gap-2">
          <ShieldCheck size={28} weight="duotone" className="text-primary" />
          <span className="font-heading font-black text-xl tracking-tight">EVERKIN</span>
        </div>
        <div className="relative">
          <h2 className="font-heading text-3xl font-black leading-tight max-w-sm">One secure home for your financial life.</h2>
          <p className="text-muted-foreground mt-4 max-w-sm text-sm">AI-gathered, encrypted, and ready to hand over to your loved ones.</p>
        </div>
        <div className="relative text-xs text-muted-foreground tracking-[0.2em] uppercase">End-to-end control</div>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm animate-fade-up">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <ShieldCheck size={26} weight="duotone" className="text-primary" />
            <span className="font-heading font-black text-lg">EVERKIN</span>
          </div>
          <h1 className="font-heading text-3xl font-black tracking-tight">{title}</h1>
          <p className="text-muted-foreground text-sm mt-1 mb-8">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

export function Field({ label, type, value, onChange, testid }) {
  return (
    <div>
      <label className="text-xs tracking-[0.15em] uppercase text-muted-foreground">{label}</label>
      <input
        type={type}
        required
        value={value}
        data-testid={testid}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full bg-background border border-input rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-shadow"
      />
    </div>
  );
}

export function Divider() {
  return (
    <div className="flex items-center gap-3 my-6">
      <div className="flex-1 h-px bg-border" />
      <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">or</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}
