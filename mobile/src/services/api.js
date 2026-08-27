// ── Unified API Service ──────────────────────────────────────────────────────
// In local mode, uses SQLite directly. In remote mode, uses HTTP.
// All screen components call these functions — they don't know which mode is active.

import { CONFIG } from "../config";
import {
  initDB, uuid, dbList, dbGet, dbInsert, dbUpdate, dbDelete,
  getInvestmentSummary, findInvestmentByName,
  getAllCachedTranslations, setCachedTranslation,
} from "./db";

const MODE = CONFIG.BACKEND_MODE; // 'local' or 'remote'

// ── Conversations ────────────────────────────────────────────────────────────
export const api = {
  // ── Chat / Conversations ──
  async getConversations(userId) {
    if (MODE === "remote") return (await fetch(`${CONFIG.BACKEND_URL}/api/chat/conversations`, { headers: authHeaders() })).json();
    const rows = await dbList("conversations", userId, "updated_at", "DESC");
    return rows;
  },

  async createConversation(userId, title = "New conversation") {
    if (MODE === "remote") return (await fetch(`${CONFIG.BACKEND_URL}/api/chat/conversations`, { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ title }) })).json();
    const conv = { conversation_id: uuid(), user_id: userId, title, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    await dbInsert("conversations", conv);
    return conv;
  },

  async deleteConversation(conversationId, userId) {
    if (MODE === "remote") return (await fetch(`${CONFIG.BACKEND_URL}/api/chat/conversations/${conversationId}`, { method: "DELETE", headers: authHeaders() })).json();
    const d = await initDB();
    await d.runAsync("DELETE FROM conversations WHERE conversation_id = ? AND user_id = ?", [conversationId, userId]);
    await d.runAsync("DELETE FROM messages WHERE conversation_id = ? AND user_id = ?", [conversationId, userId]);
    return { ok: true };
  },

  async getMessages(conversationId, userId) {
    if (MODE === "remote") return (await fetch(`${CONFIG.BACKEND_URL}/api/chat/conversations/${conversationId}/messages`, { headers: authHeaders() })).json();
    const d = await initDB();
    const rows = await d.getAllAsync(
      "SELECT * FROM messages WHERE conversation_id = ? AND user_id = ? ORDER BY created_at ASC",
      [conversationId, userId]
    );
    return rows.map((r) => ({ ...r, attachments: JSON.parse(r.attachments || "[]"), sources: JSON.parse(r.sources || "[]") }));
  },

  async saveMessage(conversationId, userId, role, content, extra = {}) {
    const msg = {
      message_id: uuid(),
      conversation_id: conversationId,
      user_id: userId,
      role,
      content,
      attachments: JSON.stringify(extra.attachments || []),
      sources: JSON.stringify(extra.sources || []),
      model: extra.model || "",
      created_at: new Date().toISOString(),
    };
    if (MODE === "remote") {
      // Remote handles message saving internally during streaming
      return msg;
    }
    await dbInsert("messages", msg);
    // Update conversation timestamp
    const d = await initDB();
    await d.runAsync("UPDATE conversations SET updated_at = ? WHERE conversation_id = ?", [new Date().toISOString(), conversationId]);
    return msg;
  },

  // ── Investments ──
  async getInvestments(userId) {
    if (MODE === "remote") return (await fetch(`${CONFIG.BACKEND_URL}/api/investments`, { headers: authHeaders() })).json();
    return await dbList("investments", userId, "created_at", "DESC");
  },

  async getInvestmentSummary(userId) {
    if (MODE === "remote") return (await fetch(`${CONFIG.BACKEND_URL}/api/investments/summary`, { headers: authHeaders() })).json();
    return await getInvestmentSummary(userId);
  },

  async addInvestment(userId, data) {
    if (MODE === "remote") return (await fetch(`${CONFIG.BACKEND_URL}/api/investments`, { method: "POST", headers: jsonHeaders(), body: JSON.stringify(data) })).json();
    const inv = { investment_id: uuid(), user_id: userId, ...data, created_at: new Date().toISOString() };
    await dbInsert("investments", inv);
    return inv;
  },

  async updateInvestment(investmentId, userId, updates) {
    if (MODE === "remote") return (await fetch(`${CONFIG.BACKEND_URL}/api/investments/${investmentId}`, { method: "PUT", headers: jsonHeaders(), body: JSON.stringify(updates) })).json();
    return await dbUpdate("investments", "investment_id", investmentId, userId, updates);
  },

  async deleteInvestment(investmentId, userId) {
    if (MODE === "remote") return (await fetch(`${CONFIG.BACKEND_URL}/api/investments/${investmentId}`, { method: "DELETE", headers: authHeaders() })).json();
    return await dbDelete("investments", "investment_id", investmentId, userId);
  },

  async investmentChatAction(userId, action, payload) {
    if (MODE === "remote") return (await fetch(`${CONFIG.BACKEND_URL}/api/investments/chat-action`, { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ action, ...payload }) })).json();
    // Local execution
    if (action === "add") {
      const inv = { investment_id: uuid(), user_id: userId, ...payload.data, created_at: new Date().toISOString() };
      await dbInsert("investments", inv);
      return { ok: true, action: "add", investment: inv };
    } else if (action === "edit") {
      const existing = await findInvestmentByName(userId, payload.name);
      if (!existing) return { ok: false, error: `Investment '${payload.name}' not found` };
      await dbUpdate("investments", "investment_id", existing.investment_id, userId, payload.updates || payload);
      return { ok: true, action: "edit", investment: await dbGet("investments", "investment_id", existing.investment_id, userId) };
    } else if (action === "delete") {
      const existing = await findInvestmentByName(userId, payload.name);
      if (!existing) return { ok: false, error: `Investment '${payload.name}' not found` };
      await dbDelete("investments", "investment_id", existing.investment_id, userId);
      return { ok: true, action: "delete", name: payload.name };
    }
    return { ok: false, error: `Unknown action: ${action}` };
  },

  // ── Insurance ──
  async getInsurance(userId) {
    return await dbList("insurance", userId);
  },
  async addInsurance(userId, data) {
    const ins = { insurance_id: uuid(), user_id: userId, ...data, created_at: new Date().toISOString() };
    await dbInsert("insurance", ins);
    return ins;
  },
  async deleteInsurance(insuranceId, userId) {
    return await dbDelete("insurance", "insurance_id", insuranceId, userId);
  },

  // ── Documents (Vault) ──
  async getDocuments(userId) {
    return await dbList("documents", userId, "created_at", "DESC");
  },
  async addDocument(userId, data) {
    const doc = { document_id: uuid(), user_id: userId, ...data, created_at: new Date().toISOString() };
    await dbInsert("documents", doc);
    return doc;
  },
  async deleteDocument(documentId, userId) {
    return await dbDelete("documents", "document_id", documentId, userId);
  },

  // ── Reminders ──
  async getReminders(userId) {
    const rows = await dbList("reminders", userId, "due_date", "ASC");
    return { reminders: rows, count: rows.filter((r) => !r.completed).length };
  },
  async addReminder(userId, data) {
    const rem = { reminder_id: uuid(), user_id: userId, ...data, created_at: new Date().toISOString() };
    await dbInsert("reminders", rem);
    return rem;
  },
  async completeReminder(reminderId, userId) {
    const d = await initDB();
    await d.runAsync("UPDATE reminders SET completed = 1 WHERE reminder_id = ? AND user_id = ?", [reminderId, userId]);
    return { ok: true };
  },
  async deleteReminder(reminderId, userId) {
    return await dbDelete("reminders", "reminder_id", reminderId, userId);
  },

  // ── Contacts ──
  async getContacts(userId) {
    return await dbList("contacts", userId);
  },
  async addContact(userId, data) {
    const contact = { contact_id: uuid(), user_id: userId, ...data, created_at: new Date().toISOString() };
    await dbInsert("contacts", contact);
    return contact;
  },

  // ── Life Events ──
  async getLifeEvents(userId) {
    return await dbList("life_events", userId);
  },

  // ── i18n translations ──
  async getTranslations(lang) {
    return await getAllCachedTranslations(lang);
  },
  async cacheTranslation(lang, key, value) {
    await setCachedTranslation(lang, key, value);
  },

  // ── Sync (placeholder for cloud sync) ──
  async getSyncStatus() {
    return { enabled: !!CONFIG.ATLAS_URL, last_sync: null, pending: 0 };
  },
};

// ── Auth headers helper ──────────────────────────────────────────────────────
function authHeaders() {
  // Token injected by caller in remote mode
  return { "Authorization": `Bearer ${global._authToken || ""}` };
}

function jsonHeaders() {
  return { "Content-Type": "application/json", "Authorization": `Bearer ${global._authToken || ""}` };
}