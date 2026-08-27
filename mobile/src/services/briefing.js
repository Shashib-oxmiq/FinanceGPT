// ── Daily Briefing Service ────────────────────────────────────────────────────
// Generates a personalized morning briefing when the user opens the app.
// The AI creates a 3-line summary: portfolio change, upcoming deadlines, and
// a proactive suggestion. Stored in localStorage to avoid regenerating < 24h.

import { Platform } from "react-native";
import { api } from "./api";
import { complete, buildSystemPrompt } from "./ai";

const STORAGE_KEY = "everkin_last_briefing";
const STORAGE_DATA_KEY = "everkin_last_briefing_data";

function getStorage() {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return {
      get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
      set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* */ } },
    };
  }
  // Native: use SecureStoreShim
  try {
    const { SecureStoreShim } = require("./platform");
    return {
      get: async (k) => SecureStoreShim.getItemAsync(k),
      set: async (k, v) => SecureStoreShim.setItemAsync(k, v),
    };
  } catch {
    return { get: () => null, set: () => {} };
  }
}

export async function getDailyBriefing(user, langCode) {
  if (!user?.user_id) return null;

  const storage = getStorage();
  const lastTsStr = await storage.get(STORAGE_KEY);
  const lastTs = lastTsStr ? parseInt(lastTsStr, 10) : 0;
  const now = Date.now();
  const hoursSince = (now - lastTs) / (1000 * 60 * 60);

  // Don't regenerate if < 20 hours
  if (hoursSince < 20) {
    const cached = await storage.get(STORAGE_DATA_KEY);
    if (cached) {
      try { return JSON.parse(cached); } catch { /* */ }
    }
  }

  try {
    const system = await buildSystemPrompt(user, [], langCode);
    const briefingPrompt =
      "Generate a brief, warm morning briefing for this user. " +
      "3-4 short sentences maximum. Format:\n" +
      "1. Portfolio snapshot (how are their investments doing?)\n" +
      "2. Any deadlines or reminders coming up soon\n" +
      "3. One proactive suggestion based on their data\n" +
      "Be conversational, like a trusted advisor sending a morning text. " +
      "Use their first name if available. Keep it under 60 words.";

    const text = await complete(system, briefingPrompt, "yolo");
    if (!text) return null;

    const briefing = { text, timestamp: now };
    await storage.set(STORAGE_KEY, String(now));
    await storage.set(STORAGE_DATA_KEY, JSON.stringify(briefing));
    return briefing;
  } catch (e) {
    console.warn("Daily briefing failed:", e.message);
    return null;
  }
}