// ── WhatsApp Integration Service ──────────────────────────────────────────────
// Framework for WhatsApp Business API integration.
// Allows users to interact with the AI via WhatsApp — send documents, ask questions,
// receive reminders. The app acts as the "brain" while WhatsApp is an alternative interface.
//
// SETUP REQUIRED:
// 1. WhatsApp Business API account (https://business.whatsapp.com/)
// 2. Phone number verification
// 3. Webhook pointing to backend: POST /api/whatsapp/webhook
// 4. Environment variables: WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_VERIFY_TOKEN

import { Platform } from "react-native";
import { api } from "./api";

const STORAGE_KEY = "everkin_whatsapp_config";

function getStorage() {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return {
      get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
      set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* */ } },
    };
  }
  return { get: () => null, set: () => {} };
}

// ── Get WhatsApp config status ──
export async function getWhatsAppConfig() {
  const storage = getStorage();
  const raw = await storage.get(STORAGE_KEY);
  if (!raw) return { enabled: false, phone: "", verified: false };
  try { return JSON.parse(raw); } catch { return { enabled: false, phone: "", verified: false }; }
}

// ── Save WhatsApp config ──
export async function saveWhatsAppConfig(config) {
  const storage = getStorage();
  await storage.set(STORAGE_KEY, JSON.stringify(config));
  return config;
}

// ── Send a message via WhatsApp Business API (through backend proxy) ──
export async function sendWhatsAppMessage(toPhone, message) {
  try {
    const resp = await fetch(`${api.baseUrl}/api/whatsapp/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: toPhone, message }),
    });
    return await resp.json();
  } catch (e) {
    console.warn("WhatsApp send failed:", e.message);
    return { success: false, error: e.message };
  }
}

// ── Share a document via WhatsApp ──
export async function shareViaWhatsApp(phone, docTitle, docContent) {
  const message = `📋 ${docTitle}\n\n${docContent}\n\n— Sent from FinanceGPT`;
  return sendWhatsAppMessage(phone, message);
}

// ── Enable WhatsApp notifications for reminders ──
export async function enableWhatsAppNotifications(phone) {
  const config = { enabled: true, phone, verified: false, notifications: true };
  await saveWhatsAppConfig(config);
  return config;
}

export async function disableWhatsAppNotifications() {
  const config = await getWhatsAppConfig();
  config.enabled = false;
  config.notifications = false;
  await saveWhatsAppConfig(config);
  return config;
}

// ── Check if WhatsApp is configured ──
export async function isWhatsAppEnabled() {
  const config = await getWhatsAppConfig();
  return config.enabled && config.verified;
}

// ── Backend webhook handler reference (for documentation) ──
// The backend needs these endpoints:
// POST /api/whatsapp/webhook — receives incoming messages from WhatsApp
// POST /api/whatsapp/send — sends a message via WhatsApp Business API
// GET /api/whatsapp/verify — webhook verification (hub.challenge)
//
// Flow:
// 1. User sends WhatsApp message → WhatsApp API → backend webhook
// 2. Backend processes message through AI (same Yolo-Auto integration)
// 3. Backend sends AI response back via WhatsApp API
// 4. User can: ask questions, send document photos, receive reminders