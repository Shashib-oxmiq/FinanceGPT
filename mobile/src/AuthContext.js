import React, { createContext, useContext, useEffect, useState } from "react";
import { api, setToken, loadToken } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const token = await loadToken();
      if (token) {
        try {
          const { data } = await api.get("/auth/me");
          setUser(data);
        } catch {
          await setToken(null);
        }
      }
      setReady(true);
    })();
  }, []);

  const login = async (data) => {
    await setToken(data.token);
    setUser(data.user);
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch {}
    await setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, ready, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
