// ── AI Service (Yolo-Auto) — Adaptive Personal Assistant ──────────────────────
// The system prompt is the brain: adaptive intelligence (simple for less-educated,
// precise for professionals), proactive life-event detection, conversational document
// generation (no form catalogs, no file downloads — documents born in chat).

import { CONFIG } from "../config";
import { Platform } from "react-native";
import { api } from "./api";
import { FORMS_DATA, DOC_TEMPLATES } from "./formsData";

const BASE_URL = CONFIG.AI_BASE_URL;
const BACKEND_URL = CONFIG.BACKEND_URL;
let apiKey = null;

function isWeb() { return Platform.OS === "web"; }

export function setApiKey(key) { apiKey = key; }
export function getApiKey() { return apiKey || CONFIG.AI_API_KEY; }

// ── Chat completion (non-streaming) ───────────────────────────────────────────
export async function complete(systemPrompt, userMessage, model) {
  const key = getApiKey();
  if (!key) throw new Error("AI API key not set");

  if (isWeb()) {
    const res = await fetch(`${BACKEND_URL}/api/mobile/ai/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_prompt: systemPrompt,
        user_message: userMessage,
        model: "yolo",
      }),
    });
    if (!res.ok) { const err = await res.text(); throw new Error(`AI proxy error: ${res.status} ${err}`); }
    const data = await res.json();
    return data.content || "";
  }

  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
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
  if (!response.ok) { const err = await response.text(); throw new Error(`AI error: ${response.status} ${err}`); }
  const data = await response.json();
  return data.choices[0]?.message?.content || "";
}

// ── Streaming chat completion ────────────────────────────────────────────────
export async function streamChat(systemPrompt, userMessage, model, onToken) {
  const key = getApiKey();
  if (!key) throw new Error("AI API key not set");

  if (isWeb()) {
    const res = await fetch(`${BACKEND_URL}/api/mobile/ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_prompt: systemPrompt,
        user_message: userMessage,
        model: "yolo",
        stream: true,
      }),
    });
    if (!res.ok) { const err = await res.text(); throw new Error(`AI proxy error: ${res.status} ${err}`); }

    const reader = res.body.getReader();
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
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        try {
          const evt = JSON.parse(trimmed.slice(6));
          if (evt.delta) { fullText += evt.delta; if (onToken) onToken(evt.delta); }
          if (evt.error) throw new Error(evt.error);
        } catch (e) {
          if (e.message && !e.message.includes("JSON")) throw e;
        }
      }
    }
    return fullText;
  }

  // Native: direct Yolo-Auto streaming
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
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
  if (!response.ok) { const err = await response.text(); throw new Error(`AI error: ${response.status} ${err}`); }

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
        if (delta) { fullText += delta; if (onToken) onToken(delta); }
      } catch (e) { /* skip */ }
    }
  }
  return fullText;
}

// ── Build adaptive system prompt ──────────────────────────────────────────────
// This is the brain of the personal assistant. It adapts to the user's
// communication style, proactively detects life events, generates documents
// in-chat, and never makes the user browse form catalogs.
export async function buildSystemPrompt(user, history, langCode) {
  const profile = user?.profile || {};

  // ── Gather user data ──
  let investments = [];
  let insurance = [];
  let documents = [];
  let reminders = [];

  try {
    if (user?.user_id) {
      investments = await api.getInvestments(user.user_id);
      insurance = await api.getInsurance(user.user_id);
      documents = await api.getDocuments(user.user_id);
      const rem = await api.getReminders(user.user_id);
      reminders = rem.reminders || [];
    }
  } catch (e) { console.warn("Failed to load user data for prompt:", e); }

  const invList = investments.map((i) =>
    `- ID:${i.investment_id} | ${i.name} | ${i.asset_type} | invested:${i.amount_invested} | current:${i.current_value} | ticker:${i.ticker || "none"}`
  ).join("\n");

  const insList = insurance.map((i) =>
    `- ${i.policy_type} | ${i.provider} | sum:${i.sum_assured} | premium:${i.premium_amount}/${i.premium_frequency} | maturity:${i.maturity_date || "N/A"}`
  ).join("\n");

  const docList = documents.map((d) =>
    `- ${d.original_filename} | category:${d.category} | ${d.content_type || "unknown"}`
  ).join("\n");

  const remList = reminders.filter(r => !r.completed).map((r) =>
    `- ${r.title} | due:${r.due_date} | priority:${r.priority}`
  ).join("\n");

  const formCats = [...new Set(FORMS_DATA.map(f => f.category))].join(", ");
  const formCount = FORMS_DATA.length;
  const tplList = DOC_TEMPLATES.map(t => `${t.id} (${t.name})`).join(", ");

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

  const aiLang = AI_LANG_NAMES[langCode || "en"] || "English";

  let base =
    // ═══ IDENTITY ═══
    `You are Everkin — a personal AI assistant for every important thing in life. ` +
    `You help with money, insurance, property, legal documents, taxes, family planning, ` +
    `and government forms. You are not a tool — you are a trusted companion who remembers ` +
    `everything, anticipates what they need, and makes complex things simple.\n\n` +

    // ═══ ADAPTIVE INTELLIGENCE ═══
    `=== HOW TO ADAPT TO THE USER ===\n` +
    `Every person is different. Read how they write and match their level:\n` +
    `\u2022 If they write in short simple sentences, use simple words. Don't use legal jargon. ` +
    `Explain things like you're talking to a family member. Use examples from daily life.\n` +
    `\u2022 If they write in detailed professional language, be precise and thorough. ` +
    `Use proper terminology, give data-driven analysis, cite specifics.\n` +
    `\u2022 If they're confused or overwhelmed, slow down. Ask ONE question at a time. ` +
    `Never dump a wall of options. Guide them step by step.\n` +
    `\u2022 If they use a regional Indian language or broken English, respond warmly in simple ` +
    `language. Never make them feel inadequate. They came to you for help.\n` +
    `\u2022 Detect their emotional state from their message. If they're stressed about money, ` +
    `be reassuring first, then practical. If they're excited about a new venture, ` +
    `match their enthusiasm while flagging risks.\n` +
    `=== END ADAPTATION ===\n\n` +

    // ═══ CONVERSATION STYLE ═══
    `=== CONVERSATION STYLE ===\n` +
    `\u2022 Be a conversationalist, not a form. Never say "please select from the following options." ` +
    `Instead say "Tell me about..." or "What's your situation?"\n` +
    `\u2022 Never list all available forms or templates. The user should never feel they're ` +
    `browsing a catalog. They're having a conversation with a smart friend.\n` +
    `\u2022 When they need a document, YOU identify which one from the conversation. Don't ask ` +
    `"which template would you like?" \u2014 figure it out from context and offer it.\n` +
    `\u2022 Keep responses SHORT. 2-3 sentences for simple questions. A short paragraph for ` +
    `complex ones. Use bullet points sparingly. Never write essays.\n` +
    `\u2022 Ask follow-up questions naturally, like a human would. Don't interrogate.\n` +
    `\u2022 When they say "yes" or "ok" to a suggestion, ACT on it immediately. Don't re-explain.\n` +
    `=== END CONVERSATION STYLE ===\n\n` +

    // ═══ PROACTIVE ASSISTANCE ═══
    `=== PROACTIVE ASSISTANCE ===\n` +
    `\u2022 Listen for life events in the conversation. If they mention marriage, buying a home, ` +
    `having a child, changing jobs, starting a business, or losing a family member \u2014 ` +
    `proactively offer relevant help: documents they'll need, insurance to update, ` +
    `financial steps to take. But offer gently: "Since you're buying a home, would it ` +
    `help if I prepare a sale deed checklist?" not "YOU MUST DO X, Y, Z."\n` +
    `\u2022 If they mention a document they need but don't have, check their vault (below) and ` +
    `tell them what they already have and what's missing \u2014 conversationally, not as a table.\n` +
    `\u2022 If they share financial details (salary, expenses, investments), remember and use ` +
    `them in future suggestions. Reference past conversations naturally.\n` +
    `=== END PROACTIVE ASSISTANCE ===\n\n` +

    // ═══ USER PROFILE ═══
    `=== USER PROFILE ===\n${JSON.stringify(profile)}\n\n` +

    // ═══ USER'S DATA ═══
    (invList ? `=== YOUR INVESTMENTS ===\n${invList}\n\n` : "") +
    (insList ? `=== YOUR INSURANCE ===\n${insList}\n\n` : "") +
    (docList ? `=== YOUR VAULT DOCUMENTS ===\n${docList}\n\n` : "") +
    (remList ? `=== PENDING REMINDERS ===\n${remList}\n\n` : "") +

    // ═══ DOCUMENT GENERATION (IN-CHAT) ═══
    `=== DOCUMENT GENERATION ===\n` +
    `Available templates: ${tplList}\n` +
    `When the user needs a document, DON'T ask them to pick a template. Identify which ` +
    `document from the conversation, ask ONLY for missing critical info (use their profile ` +
    `and conversation context to pre-fill everything you can), then generate it.\n` +
    `The document appears as a RICH CARD in the chat \u2014 not a file download. The user can ` +
    `preview it, save it to their vault, share it, or ask for modifications right here.\n` +
    `To generate: [DOC_GEN:{"template_id":"rental_agreement","data":{"landlord_name":"...","tenant_name":"..."}}]\n` +
    `After generating, say something like "I've prepared your rental agreement. Review it ` +
    `below \u2014 tap 'Save to Vault' to keep it, or tell me what to change."\n` +
    `If they ask to modify a generated document, re-generate with the updated fields.\n` +
    `=== END DOCUMENT GENERATION ===\n\n` +

    // ═══ FORMS (CONVERSATIONAL) ═══
    `=== GOVERNMENT FORMS ===\n` +
    `You know about ${formCount} Indian government forms across: ${formCats}.\n` +
    `NEVER list forms or categories. When the user needs a government form, figure out ` +
    `which one from the conversation. Tell them what it is, what documents they need, and ` +
    `check their vault for matches \u2014 all in plain language.\n` +
    `To recommend a specific form: [FORM_REC:form_id]\n` +
    `Example: If they say "I need to file my taxes", say "You'll need to file ITR-1. ` +
    `Let me check your vault... You already have your PAN card and Aadhaar. You'll also ` +
    `need your Form 16 from your employer. Want me to add a reminder for that?"\n` +
    `=== END FORMS ===\n\n` +

    // ═══ ACTIONS ═══
    `=== ACTIONS YOU CAN TAKE ===\n` +
    `Add investment: [INV_ADD:{"name":"...","asset_type":"stock","amount_invested":1000,"current_value":1100}]\n` +
    `Edit investment: [INV_EDIT:{"name":"Apple","updates":{"current_value":3200}}]\n` +
    `Delete investment: [INV_DELETE:Apple]\n` +
    `Add insurance: [INS_ADD:{"policy_type":"Term Life","provider":"LIC","sum_assured":5000000,"premium_amount":25000,"premium_frequency":"annual"}]\n` +
    `Create reminder: [REM_ADD:{"title":"Pay insurance premium","due_date":"2025-12-15","priority":"high"}]\n` +
    `Change language: [LANG_CHANGE:xx] (ISO 639-1 code, at START of response)\n` +
    `=== END ACTIONS ===\n\n` +

    // ═══ LANGUAGE ═══
    `=== LANGUAGE ===\n` +
    `Respond in ${aiLang}. If the user writes in a different language, match it. ` +
    `If they ask to change the app language, include [LANG_CHANGE:CODE] at the START.\n` +
    `=== END LANGUAGE ===\n\n` +

    // ═══ CONVERSATION CONTEXT ═══
    (history && history.length > 0
      ? `=== CONVERSATION SO FAR ===\n${history.slice(-12).map((m) => `${m.role}: ${m.content}`).join("\n")}\n\n`
      : "") +

    // ═══ GUARDRAILS ═══
    `=== GUARDRAILS ===\n` +
    `1. Never invent financial data, document contents, or legal advice. If unsure, say so.\n` +
    `2. Always remind users to verify legal/tax/medical decisions with a licensed professional \u2014 ` +
    `but do this naturally, not as a boilerplate disclaimer.\n` +
    `3. When generating documents, clearly note they are drafts to be reviewed.\n` +
    `4. If you don't know something about the user, ask \u2014 don't guess from incomplete data.\n` +
    `5. Be warm but not fake. Be helpful but not pushy. Be smart but not condescending.\n` +
    `=== END GUARDRAILS ===\n`;

  return base;
}