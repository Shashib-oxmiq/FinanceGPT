// ── AI Service (Yolo-Auto) ────────────────────────────────────────────────────
// OpenAI-compatible API client for Yolo-Auto — mirrors backend/ai.py
// Supports streaming chat, system prompts, and language instructions

import { CONFIG } from "../config";

const BASE_URL = CONFIG.AI_BASE_URL;
let apiKey = null;

export function setApiKey(key) {
  apiKey = key;
}

export function getApiKey() {
  return apiKey || CONFIG.AI_API_KEY;
}

// ── Chat completion (non-streaming) ───────────────────────────────────────────
export async function complete(systemPrompt, userMessage, model) {
  const key = getApiKey();
  if (!key) throw new Error("AI API key not set");

  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: model || CONFIG.AI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`AI error: ${response.status} ${err}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || "";
}

// ── Streaming chat completion ────────────────────────────────────────────────
// Calls onToken for each delta, returns full text when done
export async function streamChat(systemPrompt, userMessage, model, onToken) {
  const key = getApiKey();
  if (!key) throw new Error("AI API key not set");

  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: model || CONFIG.AI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 4000,
      stream: true,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`AI error: ${response.status} ${err}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === "data: [DONE]") continue;
      if (!trimmed.startsWith("data: ")) continue;

      try {
        const json = JSON.parse(trimmed.slice(6));
        const delta = json.choices[0]?.delta?.content;
        if (delta) {
          fullText += delta;
          if (onToken) onToken(delta);
        }
      } catch (e) {
        // Skip malformed lines
      }
    }
  }

  return fullText;
}

// ── Build system prompt (mirrors backend build_system_prompt) ────────────────
export function buildSystemPrompt(user, history, knowledge, langCode) {
  const profile = user?.profile || {};
  const AI_LANG_NAMES = {
    en: "English", hi: "Hindi", bn: "Bengali", ta: "Tamil", te: "Telugu",
    mr: "Marathi", gu: "Gujarati", kn: "Kannada", ml: "Malayalam", pa: "Punjabi",
    or: "Odia", es: "Spanish", fr: "French", de: "German", zh: "Chinese (Simplified)",
    ja: "Japanese", ko: "Korean", pt: "Portuguese", ru: "Russian", ar: "Arabic",
    it: "Italian", nl: "Dutch", tr: "Turkish", pl: "Polish", sv: "Swedish",
    id: "Indonesian", th: "Thai", vi: "Vietnamese", fa: "Persian", he: "Hebrew",
    uk: "Ukrainian", el: "Greek", cs: "Czech", ro: "Romanian", hu: "Hungarian",
    fi: "Finnish", da: "Danish", no: "Norwegian", ms: "Malay", fil: "Filipino", sw: "Swahili",
  };

  let base =
    "You are Everkin — the personal AI assistant that matters most in someone's life. " +
    "You help with EVERYTHING important: money, health, insurance, property, vehicles, " +
    "education, legal/estate matters, employment, immigration and family. " +
    "You keep the user's important documents organized, answer questions about ROI and " +
    "investments, help with credit and expense management, review bank statements, " +
    "explain insurance corner cases, and guide them through major life steps. " +
    "Goals: (1) warm, trustworthy, concise conversation, (2) proactively ask for missing " +
    "profile details one topic at a time, (3) give practical guidance while reminding them " +
    "to confirm legal/tax/medical decisions with a licensed professional. Never invent data. No emojis.\n\n" +
    `Known profile data (JSON): ${JSON.stringify(profile)}\n\n`;

  if (knowledge) {
    base += `User's knowledge base: ${knowledge}\n\n`;
  }

  if (history && history.length > 0) {
    const convo = history.slice(-12).map((m) => `${m.role}: ${m.content}`).join("\n");
    base += "Conversation so far:\n" + convo + "\n\n";
  }

  // Language instruction
  const aiLang = AI_LANG_NAMES[langCode || "en"] || "English";
  base +=
    `=== LANGUAGE INSTRUCTION ===\n` +
    `You MUST respond in ${aiLang}. Always write your entire response in ${aiLang}. ` +
    `If the user asks to change the app language, include [LANG_CHANGE:CODE] at the START ` +
    `of your response where CODE is the ISO 639-1 code.\n` +
    `=== END LANGUAGE INSTRUCTION ===\n`;

  // Investment actions
  base +=
    "=== INVESTMENT ACTIONS ===\n" +
    "To ADD an investment: [INV_ADD:{\"name\":\"...\",\"asset_type\":\"stock\",\"amount_invested\":1000,\"current_value\":1100}]\n" +
    "To EDIT an investment: [INV_EDIT:{\"name\":\"Apple\",\"updates\":{\"current_value\":3200}}]\n" +
    "To DELETE an investment: [INV_DELETE:Apple]\n" +
    "=== END INVESTMENT ACTIONS ===\n";

  // Document generation
  base +=
    "=== DOCUMENT GENERATION ===\n" +
    "Templates: rental_agreement, nda, will, employment_contract, loan_agreement, power_of_attorney, partnership_deed, sale_deed.\n" +
    "To generate: [DOC_GEN:{\"template_id\":\"rental_agreement\",\"format\":\"pdf\",\"data\":{\"landlord_name\":\"...\"}}]\n" +
    "=== END DOCUMENT GENERATION ===\n";

  return base;
}