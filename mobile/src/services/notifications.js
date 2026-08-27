// ── Notifications Service ─────────────────────────────────────────────────────
// Proactive AI notifications: scans user data and generates contextual alerts.
// Uses expo-notifications on native, localStorage-based scheduling on web.

import { Platform } from "react-native";
import { api } from "./api";
import { complete, buildSystemPrompt } from "./ai";

const LAST_SCAN_KEY = "everkin_last_notification_scan";

function getStorage() {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return {
      get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
      set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* */ } },
    };
  }
  return { get: () => null, set: () => {} };
}

// ── Generate proactive notifications from user data ──
export async function generateNotifications(user, langCode) {
  if (!user?.user_id) return [];

  const storage = getStorage();
  const lastScan = await storage.get(LAST_SCAN_KEY);
  const lastTs = lastScan ? parseInt(lastScan, 10) : 0;
  const hoursSince = (Date.now() - lastTs) / (1000 * 60 * 60);

  // Only scan every 6 hours
  if (hoursSince < 6) {
    try {
      const cached = await storage.get("everkin_notifications");
      if (cached) return JSON.parse(cached);
    } catch { /* */ }
  }

  try {
    const system = await buildSystemPrompt(user, [], langCode);
    const prompt =
      "Based on this user's data, generate 1-3 proactive notifications. " +
      "Each notification should be actionable and timely. Format as JSON array:\n" +
      '[{"type": "reminder|alert|suggestion", "title": "short title", "body": "1-sentence message", "priority": "high|medium|low"}]\n' +
      "Check: upcoming insurance premiums, investment performance, missing documents, " +
      "goals falling behind, reminders due soon, life events to follow up on. " +
      "Return ONLY the JSON array, no other text.";

    const text = await complete(system, prompt, "yolo");
    let notifs = [];
    try {
      // Extract JSON from response
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) notifs = JSON.parse(jsonMatch[0]);
    } catch { /* */ }

    if (!Array.isArray(notifs)) notifs = [];

    await storage.set(LAST_SCAN_KEY, String(Date.now()));
    await storage.set("everkin_notifications", JSON.stringify(notifs));
    return notifs;
  } catch (e) {
    console.warn("Notification generation failed:", e.message);
    return [];
  }
}

// ── Local notification scheduling (web: in-app banner, native: expo-notifications) ──
export async function scheduleNotification(title, body, data = {}) {
  if (Platform.OS === "web") {
    // On web, use browser Notification API if permitted
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "granted") {
        new Notification(title, { body, data });
      } else if (Notification.permission !== "denied") {
        Notification.requestPermission().then((perm) => {
          if (perm === "granted") new Notification(title, { body, data });
        });
      }
    }
    return;
  }

  // Native: would use expo-notifications
  // try {
  //   const * Notifications = await import("expo-notifications");
  //   await Notifications.scheduleNotificationAsync({
  //     content: { title, body, data },
  //     trigger: { seconds: 1 },
  //   });
  // } catch { /* expo-notifications not installed */ }
}

export async function requestNotificationPermission() {
  if (Platform.OS === "web" && typeof window !== "undefined" && "Notification" in window) {
    if (Notification.permission === "default") {
      await Notification.requestPermission();
    }
    return Notification.permission === "granted";
  }
  return false;
}