// ── AI Service (Yolo-Auto) — Smart Chat with Tool Actions ────────────────────
// Upgraded system prompt includes vault docs, investments, forms knowledge
// AI can: add/edit/delete investments, generate documents, change language,
//          find forms, check vault for missing docs, manage insurance/reminders

import { CONFIG } from "../config";
import { api } from "./api";
import { FORMS_DATA, DOC_TEMPLATES } from "./formsData";

const BASE_URL = CONFIG.AI_BASE_URL;
let apiKey = null;

export function setApiKey(key) { apiKey = key; }
export function getApiKey() { return apiKey || CONFIG.AI_API_KEY; }

// ── Chat completion (non-streaming) ───────────────────────────────────────────
export async function complete(systemPrompt, userMessage, model) {
  const key = getApiKey();
  if (!key) throw new Error("AI API key not set");
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

// ── Build smart system prompt (mirrors desktop backend) ──────────────────────
// This is what makes the chat "smart" — it knows everything about the user
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

  // Format investments for AI
  const invList = investments.map((i) =>
    `- ID:${i.investment_id} | ${i.name} | ${i.asset_type} | invested:${i.amount_invested} | current:${i.current_value} | ticker:${i.ticker || "none"}`
  ).join("\n");

  // Format insurance for AI
  const insList = insurance.map((i) =>
    `- ${i.policy_type} | ${i.provider} | sum:${i.sum_assured} | premium:${i.premium_amount}/${i.premium_frequency} | maturity:${i.maturity_date || "N/A"}`
  ).join("\n");

  // Format vault documents for AI
  const docList = documents.map((d) =>
    `- ${d.original_filename} | category:${d.category} | ${d.content_type || "unknown"}`
  ).join("\n");

  // Format reminders for AI
  const remList = reminders.filter(r => !r.completed).map((r) =>
    `- ${r.title} | due:${r.due_date} | priority:${r.priority}`
  ).join("\n");

  // Form categories summary (don't list all 100 — let user ask)
  const formCats = [...new Set(FORMS_DATA.map(f => f.category))].join(", ");
  const formCount = FORMS_DATA.length;

  // Document templates
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

  let base =
    "You are Everkin — the personal AI assistant that matters most in someone's life. " +
    "You help with EVERYTHING important: money, health, insurance, property, vehicles, " +
    "education, legal/estate matters, employment, immigration and family. " +
    "You keep the user's important documents organized, answer questions about ROI and " +
    "investments, help with credit and expense management, review bank statements, " +
    "explain insurance corner cases, and guide them through major life steps.\n\n" +
    "Goals: (1) warm, trustworthy, concise conversation, (2) proactively ask for missing " +
    "profile details one topic at a time, (3) give practical guidance while reminding them " +
    "to confirm legal/tax/medical decisions with a licensed professional. Never invent data.\n\n" +
    `=== USER PROFILE ===\n${JSON.stringify(profile)}\n\n`;

  // ── User's data ──
  if (invList) base += `=== USER'S INVESTMENTS ===\n${invList}\n\n`;
  if (insList) base += `=== USER'S INSURANCE ===\n${insList}\n\n`;
  if (docList) base += `=== USER'S VAULT DOCUMENTS ===\n${docList}\n\n`;
  if (remList) base += `=== PENDING REMINDERS ===\n${remList}\n\n`;

  // ── Forms knowledge ──
  base +=
    `=== FORMS DATABASE ===\n` +
    `You have access to ${formCount} Indian government forms across categories: ${formCats}.\n` +
    `When a user needs a form, DON'T list all forms. Ask what they need help with, then ` +
    `recommend the specific form(s) and explain what documents they need.\n` +
    `If they already have some documents in their vault (listed above), tell them which ` +
    `required documents they already have and which are still missing.\n` +
    `To recommend a specific form, use: [FORM_REC:form_id]\n` +
    `=== END FORMS ===\n\n`;

  // ── Document generation ──
  base +=
    `=== DOCUMENT GENERATION ===\n` +
    `Available templates: ${tplList}\n` +
    `When a user asks to create/generate/make a document, fill in the fields from their ` +
    `profile data and conversation context. Don't ask for information you already have.\n` +
    `Only ask for missing critical fields.\n` +
    `To generate: [DOC_GEN:{"template_id":"rental_agreement","format":"pdf","data":{"landlord_name":"...","tenant_name":"..."}}]\n` +
    `The generated document will appear inline in the chat — no separate download needed.\n` +
    `=== END DOCUMENT GENERATION ===\n\n`;

  // ── Investment actions ──
  base +=
    `=== INVESTMENT ACTIONS ===\n` +
    `To ADD: [INV_ADD:{"name":"...","asset_type":"stock","amount_invested":1000,"current_value":1100}]\n` +
    `To EDIT: [INV_EDIT:{"name":"Apple","updates":{"current_value":3200}}]\n` +
    `To DELETE: [INV_DELETE:Apple]\n` +
    `=== END INVESTMENT ACTIONS ===\n\n`;

  // ── Insurance actions ──
  base +=
    `=== INSURANCE ACTIONS ===\n` +
    `To ADD policy: [INS_ADD:{"policy_type":"Term Life","provider":"LIC","sum_assured":5000000,"premium_amount":25000,"premium_frequency":"annual"}]\n` +
    `=== END INSURANCE ACTIONS ===\n\n`;

  // ── Reminder actions ──
  base +=
    `=== REMINDER ACTIONS ===\n` +
    `To create a reminder: [REM_ADD:{"title":"Pay insurance premium","due_date":"2025-12-15","priority":"high"}]\n` +
    `=== END REMINDER ACTIONS ===\n\n`;

  // ── Language ──
  const aiLang = AI_LANG_NAMES[langCode || "en"] || "English";
  base +=
    `=== LANGUAGE INSTRUCTION ===\n` +
    `You MUST respond in ${aiLang}. Always write your entire response in ${aiLang}. ` +
    `If the user asks to change the app language, include [LANG_CHANGE:CODE] at the START ` +
    `of your response where CODE is the ISO 639-1 code.\n` +
    `=== END LANGUAGE INSTRUCTION ===\n\n`;

  // ── Conversation context ──
  if (history && history.length > 0) {
    const convo = history.slice(-12).map((m) => `${m.role}: ${m.content}`).join("\n");
    base += `=== CONVERSATION SO FAR ===\n${convo}\n\n`;
  }

  // ── Behavioral guidelines ──
  base +=
    `=== BEHAVIOR ===\n` +
    `1. Be proactive — if the user mentions a life event (marriage, home, child), offer relevant forms and documents.\n` +
    `2. When recommending a form, check their vault first — tell them what they already have and what's missing.\n` +
    `3. When generating a document, pre-fill from their profile. Only ask for truly missing info.\n` +
    `4. Keep responses concise — 2-3 paragraphs max unless the user asks for detail.\n` +
    `5. Use bullet points for lists. Be warm but professional.\n` +
    `6. If you don't know something, say so. Never invent financial data.\n` +
    `=== END BEHAVIOR ===\n`;

  return base;
}