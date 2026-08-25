import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { GoogleLogo } from "@phosphor-icons/react";
import { api, formatApiErrorDetail } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { AuthShell, Field, Divider } from "./Login";

export default function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/auth/register", { name, email, password });
      login(data);
      toast.success("Account created");
      navigate("/dashboard");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setBusy(false);
    }
  };

  const googleLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/dashboard";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <AuthShell title="Create account" subtitle="Start building your secure vault">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Full name" type="text" value={name} onChange={setName} testid="register-name" />
        <Field label="Email" type="email" value={email} onChange={setEmail} testid="register-email" />
        <Field label="Password" type="password" value={password} onChange={setPassword} testid="register-password" />
        <button type="submit" disabled={busy} data-testid="register-submit" className="w-full bg-primary text-primary-foreground py-3 rounded-md font-semibold hover:opacity-90 transition-opacity disabled:opacity-60">
          {busy ? "Creating…" : "Create account"}
        </button>
      </form>
      <Divider />
      <button onClick={googleLogin} data-testid="google-register" className="w-full flex items-center justify-center gap-2 border border-border py-3 rounded-md font-medium hover:bg-secondary transition-colors">
        <GoogleLogo size={18} weight="bold" /> Continue with Google
      </button>
      <p className="text-sm text-muted-foreground text-center mt-6">
        Already have an account? <Link to="/login" className="text-primary hover:underline" data-testid="link-login">Sign in</Link>
      </p>
    </AuthShell>
  );
}
