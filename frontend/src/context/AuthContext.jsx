import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, resolveBackendUrl } from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null=checking, false=guest, object=user
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      // Resolve backend URL first (important in Electron where sidecar picks a random port)
      await resolveBackendUrl();
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch {
      setUser(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // If returning from Google OAuth callback, let AuthCallback establish the session first.
    if (window.location.hash?.includes("session_id=")) {
      setLoading(false);
      return;
    }
    checkAuth();
  }, [checkAuth]);

  const login = (data) => {
    if (data.token) localStorage.setItem("vault_token", data.token);
    setUser(data.user);
  };

  const loginAsDemo = async () => {
    // Use the backend demo endpoint which creates user + seeds data
    try {
      await resolveBackendUrl();
      const { data } = await api.post("/auth/demo", {});
      login(data);
      return data;
    } catch (err) {
      throw err;
    }
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {}
    localStorage.removeItem("vault_token");
    setUser(false);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, loginAsDemo, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
