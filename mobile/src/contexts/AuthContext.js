// ── Auth Context ──────────────────────────────────────────────────────────────
// Uses expo-secure-store for token persistence + SQLite for user data

import React, { createContext, useContext, useState, useEffect } from "react";
import * as SecureStore from "expo-secure-store";
import { initDB, dbInsert, dbGet, uuid } from "../services/db";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        await initDB();
        const savedToken = await SecureStore.getItemAsync("auth_token");
        const savedUserId = await SecureStore.getItemAsync("user_id");
        if (savedToken && savedUserId) {
          const u = await dbGet("users", "user_id", savedUserId, savedUserId);
          if (u) {
            setUser({ ...u, profile: JSON.parse(u.profile || "{}") });
            setToken(savedToken);
          }
        }
      } catch (e) {
        console.error("Auth init error:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (email, password) => {
    // Local auth — check if user exists
    const d = await initDB();
    const u = await d.getFirstAsync(
      "SELECT * FROM users WHERE email = ?",
      [email.toLowerCase()]
    );
    if (!u) throw new Error("User not found. Please register first.");
    // Simple password check (in production, use bcrypt)
    if (u.password_hash && password && u.password_hash !== btoa(password)) {
      throw new Error("Incorrect password.");
    }
    const t = uuid();
    await SecureStore.setItemAsync("auth_token", t);
    await SecureStore.setItemAsync("user_id", u.user_id);
    setUser({ ...u, profile: JSON.parse(u.profile || "{}") });
    setToken(t);
    return u;
  };

  const register = async (email, password, name) => {
    const userId = uuid();
    const d = await initDB();
    // Check if email exists
    const existing = await d.getFirstAsync("SELECT user_id FROM users WHERE email = ?", [email.toLowerCase()]);
    if (existing) throw new Error("Email already registered.");
    const userData = {
      user_id: userId,
      email: email.toLowerCase(),
      name: name || "",
      password_hash: password ? btoa(password) : "",
      profile: "{}",
    };
    await dbInsert("users", userData);
    const t = uuid();
    await SecureStore.setItemAsync("auth_token", t);
    await SecureStore.setItemAsync("user_id", userId);
    setUser({ ...userData, profile: {} });
    setToken(t);
    return userData;
  };

  const loginAsGuest = async () => {
    // Auto-create a guest account for local-only mode
    const userId = uuid();
    const userData = {
      user_id: userId,
      email: `guest_${userId.slice(0, 8)}@local`,
      name: "Guest",
      password_hash: "",
      profile: "{}",
    };
    await dbInsert("users", userData);
    const t = uuid();
    await SecureStore.setItemAsync("auth_token", t);
    await SecureStore.setItemAsync("user_id", userId);
    setUser({ ...userData, profile: {} });
    setToken(t);
  };

  const updateProfile = async (updates) => {
    if (!user) return;
    const newProfile = { ...user.profile, ...updates };
    const d = await initDB();
    await d.runAsync(
      "UPDATE users SET profile = ?, updated_at = datetime('now') WHERE user_id = ?",
      [JSON.stringify(newProfile), user.user_id]
    );
    setUser({ ...user, profile: newProfile });
  };

  const logout = async () => {
    await SecureStore.deleteItemAsync("auth_token");
    await SecureStore.deleteItemAsync("user_id");
    setUser(null);
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, token, login, register, loginAsGuest, updateProfile, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}