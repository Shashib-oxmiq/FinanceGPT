// ── Cloud Sync Engine ────────────────────────────────────────────────────────
// Bidirectional sync between local SQLite and MongoDB Atlas
// Mirrors backend/sync.py from the desktop app

import { CONFIG } from "../config";
import { initDB } from "./db";
import { Platform } from "react-native";

const isWeb = Platform.OS === "web";

// ── Sync engine ──────────────────────────────────────────────────────────────
class SyncEngine {
  constructor(atlasUrl, dbName) {
    this.url = atlasUrl;
    this.dbName = dbName || CONFIG.ATLAS_DB_NAME;
    this.enabled = !!atlasUrl;
    this.lastSync = null;
    this.pending = 0;
    this.timer = null;
  }

  start(intervalMs) {
    if (!this.enabled) return;
    const interval = intervalMs || CONFIG.SYNC_INTERVAL;
    this.timer = setInterval(() => this.sync(), interval);
    // Initial sync
    this.sync();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  getStatus() {
    return { enabled: this.enabled, last_sync: this.lastSync, pending: this.pending };
  }

  async sync() {
    if (!this.enabled) return { ok: false, reason: "disabled" };
    try {
      // On web, we can use fetch to talk to Atlas Data API
      // On native, we'd need a backend proxy
      if (isWeb) {
        return await this._syncWeb();
      }
      // Native: use remote backend endpoint
      return await this._syncRemote();
    } catch (e) {
      console.error("Sync error:", e);
      return { ok: false, error: e.message };
    }
  }

  async _syncWeb() {
    // For web mode, we sync via the FastAPI backend's sync endpoint
    try {
      const resp = await fetch(CONFIG.BACKEND_URL + "/api/sync/now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (resp.ok) {
        this.lastSync = new Date().toISOString();
        return { ok: true, last_sync: this.lastSync };
      }
      return { ok: false };
    } catch {
      return { ok: false };
    }
  }

  async _syncRemote() {
    try {
      const resp = await fetch(CONFIG.BACKEND_URL + "/api/sync/now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (resp.ok) {
        this.lastSync = new Date().toISOString();
        return { ok: true, last_sync: this.lastSync };
      }
      return { ok: false };
    } catch {
      return { ok: false };
    }
  }
}

let engine = null;

export function initSyncEngine() {
  if (engine) return engine;
  engine = new SyncEngine(CONFIG.ATLAS_URL, CONFIG.ATLAS_DB_NAME);
  return engine;
}

export function getSyncStatus() {
  if (!engine) return { enabled: false, last_sync: null, pending: 0 };
  return engine.getStatus();
}