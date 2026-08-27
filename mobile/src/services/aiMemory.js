// ── AI Memory Service ─────────────────────────────────────────────────────────
// Persistent memory across chat sessions. The AI remembers user's life context,
// preferences, family details, goals, and past conversations — even after the
// app is closed and reopened. This makes the AI feel like a real companion
// who knows you, not a tool that resets every time.

import { dbAll, dbRun, uuid } from "./db";

const MEMORY_TABLE = "ai_memory";

export async function ensureMemoryTable() {
  await dbRun(`CREATE TABLE IF NOT EXISTS ${MEMORY_TABLE} (
    memory_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    category TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    confidence REAL DEFAULT 1.0,
    source TEXT DEFAULT 'conversation',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);
}

export const MEMORY_CATEGORIES = {
  personal: "Personal Info (name, age, birthday, location)",
  family: "Family (spouse, children, parents, siblings)",
  financial: "Financial (income, expenses, debts, assets)",
  goals: "Goals & Aspirations",
  preferences: "Preferences (language, communication style, risk tolerance)",
  life_events: "Life Events (marriage, job change, relocation, illness)",
  health: "Health Context (conditions, medications, allergies)",
  work: "Work & Career (occupation, company, salary, career goals)",
  property: "Property & Assets (home, vehicle, land)",
  legal: "Legal Matters (court cases, disputes, documentation)",
  context: "Conversation Context (ongoing situations, pending decisions)",
};

export async function storeMemory(userId, category, key, value, confidence = 1.0, source = "conversation") {
  await ensureMemoryTable();
  const existing = await dbAll(`SELECT * FROM ${MEMORY_TABLE} WHERE user_id = ? AND key = ?`, [userId, key]);
  if (existing && existing.length > 0) {
    await dbRun(
      `UPDATE ${MEMORY_TABLE} SET value = ?, confidence = ?, source = ?, updated_at = datetime('now') WHERE user_id = ? AND key = ?`,
      [value, confidence, source, userId, key]
    );
  } else {
    const id = uuid();
    await dbRun(
      `INSERT INTO ${MEMORY_TABLE} (memory_id, user_id, category, key, value, confidence, source) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, userId, category, key, value, confidence, source]
    );
  }
}

export async function getAllMemories(userId) {
  await ensureMemoryTable();
  return await dbAll(`SELECT * FROM ${MEMORY_TABLE} WHERE user_id = ? ORDER BY updated_at DESC`, [userId]) || [];
}

export async function getMemoriesByCategory(userId, category) {
  await ensureMemoryTable();
  return await dbAll(`SELECT * FROM ${MEMORY_TABLE} WHERE user_id = ? AND category = ? ORDER BY updated_at DESC`, [userId, category]) || [];
}

export async function deleteMemory(userId, key) {
  await dbRun(`DELETE FROM ${MEMORY_TABLE} WHERE user_id = ? AND key = ?`, [userId, key]);
}

// ── Build memory context string for AI system prompt ──
export async function getMemoryContext(userId) {
  const memories = await getAllMemories(userId);
  if (!memories || memories.length === 0) return "";

  const byCategory = {};
  for (const m of memories) {
    if (!byCategory[m.category]) byCategory[m.category] = [];
    byCategory[m.category].push(`${m.key}: ${m.value}`);
  }

  let context = "=== WHAT YOU REMEMBER ABOUT THIS USER ===\n";
  for (const [cat, items] of Object.entries(byCategory)) {
    const label = MEMORY_CATEGORIES[cat]?.split(" (")[0] || cat;
    context += `${label}:\n${items.map(i => `  • ${i}`).join("\n")}\n`;
  }
  context += "=== END MEMORY ===\n\nUse this remembered context naturally. Don't say 'I remember you said...' — just use the information as if you've known them for years. If something has changed (they mention a new job), update your understanding silently.\n\n";

  return context;
}

// ── Extract memories from AI conversation ──
// The AI can tag important facts with [MEMORY:category:key=value]
export function extractMemoryMarkers(text) {
  const matches = [...text.matchAll(/\[MEMORY:(\w+):([^=]+)=([^\]]+)\]/g)];
  return matches.map(m => ({ category: m[1], key: m[2].trim(), value: m[3].trim() }));
}

export async function processMemoryMarkers(userId, text) {
  const markers = extractMemoryMarkers(text);
  for (const m of markers) {
    await storeMemory(userId, m.category, m.key, m.value);
  }
  return markers.length;
}

// ── Auto-extract memories from user messages (heuristic) ──
export async function autoExtractMemories(userId, userMessage) {
  const lower = userMessage.toLowerCase();
  const extracted = [];

  // Name detection
  const nameMatch = userMessage.match(/(?:my name is|i am|i'm)\s+([A-Z][a-z]+)/);
  if (nameMatch) {
    await storeMemory(userId, "personal", "name", nameMatch[1]);
    extracted.push({ key: "name", value: nameMatch[1] });
  }

  // Age detection
  const ageMatch = userMessage.match(/(?:i am|i'm)\s+(\d{1,2})\s*(?:years? old|y\/o)/i);
  if (ageMatch) {
    await storeMemory(userId, "personal", "age", ageMatch[1]);
    extracted.push({ key: "age", value: ageMatch[1] });
  }

  // Income detection
  const incomeMatch = userMessage.match(/(?:my (?:monthly |annual )?(?:salary|income) is|i earn|i make)\s+₹?\s*([\d,]+)/i);
  if (incomeMatch) {
    const income = parseInt(incomeMatch[1].replace(/,/g, ""));
    await storeMemory(userId, "financial", "income", String(income));
    extracted.push({ key: "income", value: String(income) });
  }

  // Occupation detection
  const jobMatch = userMessage.match(/(?:i work (?:as|at)|i'm a|my job is|i am a)\s+(?:an?\s+)?(\w+(?:\s+\w+)?)/i);
  if (jobMatch && !["the", "this", "that"].includes(jobMatch[1].toLowerCase())) {
    await storeMemory(userId, "work", "occupation", jobMatch[1]);
    extracted.push({ key: "occupation", value: jobMatch[1] });
  }

  // Location detection
  const locMatch = userMessage.match(/(?:i live in|i'm from|i am from|based in)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
  if (locMatch) {
    await storeMemory(userId, "personal", "location", locMatch[1]);
    extracted.push({ key: "location", value: locMatch[1] });
  }

  // Family detection
  if (lower.includes("my wife") || lower.includes("my husband") || lower.includes("my spouse")) {
    await storeMemory(userId, "family", "marital_status", "married");
    extracted.push({ key: "marital_status", value: "married" });
  }
  const childMatch = userMessage.match(/my (?:son|daughter|child)(?:'s)?\s+(?:is|name is)\s+([A-Z][a-z]+)?/);
  if (childMatch) {
    const count = (lower.match(/my (?:son|daughter|child)/g) || []).length;
    await storeMemory(userId, "family", "children", `${count} child(ren)`);
    extracted.push({ key: "children", value: `${count} child(ren)` });
  }

  return extracted;
}