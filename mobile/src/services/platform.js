// ── Web Platform Shims ───────────────────────────────────────────────────────
// Provides browser-based fallbacks for native-only Expo modules
// When running on web (no Xcode), uses localStorage + in-memory DB

import { Platform } from "react-native";

const isWeb = Platform.OS === "web";

// ── SecureStore shim (web: localStorage) ─────────────────────────────────────
export const SecureStoreShim = {
  async getItemAsync(key) {
    if (isWeb) return localStorage.getItem(key);
    const SecureStore = require("expo-secure-store");
    return await SecureStore.getItemAsync(key);
  },
  async setItemAsync(key, value) {
    if (isWeb) { localStorage.setItem(key, value); return; }
    const SecureStore = require("expo-secure-store");
    return await SecureStore.setItemAsync(key, value);
  },
  async deleteItemAsync(key) {
    if (isWeb) { localStorage.removeItem(key); return; }
    const SecureStore = require("expo-secure-store");
    return await SecureStore.deleteItemAsync(key);
  },
};

// ── In-memory SQLite shim (web) ──────────────────────────────────────────────
// Simple store that mimics the SQLite interface for web mode

class WebDB {
  constructor() {
    this.tables = {};
    this._loadFromStorage();
  }

  _loadFromStorage() {
    try {
      const data = localStorage.getItem("everkin_db");
      if (data) this.tables = JSON.parse(data);
    } catch (e) { this.tables = {}; }
  }

  _saveToStorage() {
    try { localStorage.setItem("everkin_db", JSON.stringify(this.tables)); } catch (e) {}
  }

  _ensureTable(name) {
    if (!this.tables[name]) this.tables[name] = {};
    return this.tables[name];
  }

  async execAsync(sql) {
    // Parse CREATE TABLE statements to get table names
    const matches = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)];
    for (const m of matches) this._ensureTable(m[1]);
    return;
  }

  async runAsync(sql, params = []) {
    // Determine operation from SQL
    const tableMatch = sql.match(/(?:INSERT OR REPLACE INTO|UPDATE|DELETE FROM)\s+(\w+)/);
    if (!tableMatch) return { changes: 0 };
    const table = tableMatch[1];
    const t = this._ensureTable(table);

    if (sql.startsWith("INSERT OR REPLACE")) {
      // Extract column names and values
      const colMatch = sql.match(/INSERT OR REPLACE INTO \w+ \(([^)]+)\) VALUES \(([^)]+)\)/);
      if (colMatch) {
        const cols = colMatch[1].split(", ").map((c) => c.trim());
        const idCol = cols.find((c) => c.endsWith("_id") || c === "user_id") || cols[0];
        const idVal = params[cols.indexOf(idCol)];
        t[idVal] = {};
        cols.forEach((col, i) => { t[idVal][col] = params[i]; });
        this._saveToStorage();
        return { changes: 1 };
      }
    }

    if (sql.startsWith("UPDATE")) {
      const whereMatch = sql.match(/WHERE (\w+) = \? AND (\w+) = \?/);
      if (whereMatch) {
        const [, wCol1, wCol2] = whereMatch;
        const wVal1 = params[params.length - 2];
        const wVal2 = params[params.length - 1];
        if (t[wVal1]) {
          // Extract SET assignments
          const setMatch = sql.match(/SET (.+?) WHERE/);
          if (setMatch) {
            const setCols = setMatch[1].split(", ").map((s) => s.split(" = ")[0].trim());
            setCols.forEach((col, i) => { t[wVal1][col] = params[i]; });
            if (wCol2 === "user_id") t[wVal1][wCol2] = wVal2;
            this._saveToStorage();
            return { changes: 1 };
          }
        }
      }
      // Simple UPDATE without user_id
      const whereSimple = sql.match(/WHERE (\w+) = \?/);
      if (whereSimple) {
        const wVal = params[params.length - 1];
        if (t[wVal]) {
          const setMatch = sql.match(/SET (.+?) WHERE/);
          if (setMatch) {
            const setCols = setMatch[1].split(", ").map((s) => s.split(" = ")[0].trim());
            setCols.forEach((col, i) => { t[wVal][col] = params[i]; });
            this._saveToStorage();
            return { changes: 1 };
          }
        }
      }
    }

    if (sql.startsWith("DELETE")) {
      const whereMatch = sql.match(/WHERE (\w+) = \? AND (\w+) = \?/);
      if (whereMatch) {
        const [, wCol1, wCol2] = whereMatch;
        const wVal1 = params[0];
        const wVal2 = params[1];
        let changes = 0;
        for (const [id, row] of Object.entries(t)) {
          if (row[wCol1] === wVal1 && row[wCol2] === wVal2) { delete t[id]; changes++; }
        }
        this._saveToStorage();
        return { changes };
      }
      const whereSimple = sql.match(/WHERE (\w+) = \?/);
      if (whereSimple) {
        const wVal = params[0];
        if (t[wVal]) { delete t[wVal]; this._saveToStorage(); return { changes: 1 }; }
      }
    }

    return { changes: 0 };
  }

  async getFirstAsync(sql, params = []) {
    const tableMatch = sql.match(/FROM (\w+)/);
    if (!tableMatch) return null;
    const table = tableMatch[1];
    const t = this._ensureTable(table);

    const whereMatch = sql.match(/WHERE (\w+) = \? AND (\w+) = \?/);
    if (whereMatch) {
      const [, wCol1, wCol2] = whereMatch;
      for (const row of Object.values(t)) {
        if (String(row[wCol1]) === String(params[0]) && String(row[wCol2]) === String(params[1])) return { ...row };
      }
      return null;
    }

    const whereSimple = sql.match(/WHERE (\w+) = \?/);
    if (whereSimple) {
      const [, wCol] = whereSimple;
      for (const row of Object.values(t)) {
        if (String(row[wCol]) === String(params[0])) return { ...row };
      }
    }

    const likeMatch = sql.match(/WHERE (\w+) = \? AND (\w+) LIKE \?/);
    if (likeMatch) {
      const [, wCol1, wCol2] = likeMatch;
      const wVal1 = params[0];
      const likePattern = params[1].replace(/%/g, "").replace(/COLLATE NOCASE/i, "").trim();
      for (const row of Object.values(t)) {
        if (String(row[wCol1]) === String(wVal1) && String(row[wCol2] || "").toLowerCase().includes(likePattern.toLowerCase())) return { ...row };
      }
      return null;
    }

    return null;
  }

  async getAllAsync(sql, params = []) {
    const tableMatch = sql.match(/FROM (\w+)/);
    if (!tableMatch) return [];
    const table = tableMatch[1];
    const t = this._ensureTable(table);
    let rows = Object.values(t).map((r) => ({ ...r }));

    // WHERE user_id = ?
    const whereMatch = sql.match(/WHERE (\w+) = \?/);
    if (whereMatch && params.length > 0) {
      const [, wCol] = whereMatch;
      rows = rows.filter((r) => String(r[wCol]) === String(params[0]));
    }

    // WHERE user_id = ? AND ... LIKE ?
    const likeMatch = sql.match(/WHERE (\w+) = \? AND (\w+) LIKE \?/);
    if (likeMatch && params.length >= 2) {
      const [, wCol1, wCol2] = likeMatch;
      const likeVal = (params[1] || "").replace(/%/g, "");
      rows = rows.filter((r) => String(r[wCol1]) === String(params[0]) && String(r[wCol2] || "").toLowerCase().includes(likeVal.toLowerCase()));
    }

    // ORDER BY
    const orderMatch = sql.match(/ORDER BY (\w+) (ASC|DESC)/);
    if (orderMatch) {
      const [, col, dir] = orderMatch;
      rows.sort((a, b) => {
        const av = a[col] || "";
        const bv = b[col] || "";
        if (dir === "DESC") return bv > av ? 1 : -1;
        return av > bv ? 1 : -1;
      });
    }

    // LIMIT
    const limitMatch = sql.match(/LIMIT (\d+)/);
    if (limitMatch) rows = rows.slice(0, parseInt(limitMatch[1]));

    return rows;
  }
}

let webDBInstance = null;

export async function openDB() {
  if (isWeb) {
    if (!webDBInstance) webDBInstance = new WebDB();
    return webDBInstance;
  }
  const SQLite = require("expo-sqlite");
  return await SQLite.openDatabaseAsync("everkin.db");
}

// ── DocumentPicker shim (web: file input) ────────────────────────────────────
export async function pickDocument() {
  if (isWeb) {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = true;
      input.onchange = (e) => {
        const files = Array.from(e.target.files || []);
        resolve({
          canceled: files.length === 0,
          assets: files.map((f) => ({
            name: f.name,
            uri: URL.createObjectURL(f),
            mimeType: f.type,
            size: f.size,
          })),
        });
      };
      input.click();
    });
  }
  const DocumentPicker = require("expo-document-picker");
  return await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
}