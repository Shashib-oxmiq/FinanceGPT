import axios from "axios";

/**
 * Resolve the backend URL.
 *
 * In the Electron desktop app, the sidecar manager picks a free port at startup
 * and exposes it via IPC (`window.electronAPI.getBackendUrl()`).
 * In the browser (dev/standalone), we fall back to the Vite env var or localhost:8000.
 */
let _backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

export async function resolveBackendUrl() {
  // Check if running inside Electron with the preload bridge
  if (typeof window !== "undefined" && window.electronAPI?.getBackendUrl) {
    try {
      // Race IPC against a 2-second timeout — never hang the render
      const url = await Promise.race([
        window.electronAPI.getBackendUrl(),
        new Promise((_, reject) => setTimeout(() => reject(), 2000)),
      ]);
      if (url) {
        _backendUrl = url;
        api.defaults.baseURL = `${url}/api`;
      }
    } catch {
      // IPC not ready or timed out — keep the default
    }
  }
  return _backendUrl;
}

export function getBackendUrl() {
  return _backendUrl;
}

export const API = `${_backendUrl}/api`;

export const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("vault_token");
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export function formatApiErrorDetail(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}