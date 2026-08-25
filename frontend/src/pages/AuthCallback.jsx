import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";

export default function AuthCallback() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const hash = window.location.hash || "";
    const match = hash.match(/session_id=([^&]+)/);
    const sessionId = match ? decodeURIComponent(match[1]) : null;

    const run = async () => {
      if (!sessionId) {
        navigate("/login");
        return;
      }
      try {
        const { data } = await api.post(
          "/auth/google/session",
          {},
          { headers: { "X-Session-ID": sessionId } }
        );
        if (data.token) localStorage.setItem("vault_token", data.token);
        setUser(data.user);
        window.history.replaceState(null, "", window.location.pathname);
        navigate("/dashboard");
      } catch {
        navigate("/login");
      }
    };
    run();
  }, [navigate, setUser]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
      <span className="animate-pulse tracking-[0.3em] uppercase text-xs">Completing sign-in…</span>
    </div>
  );
}
