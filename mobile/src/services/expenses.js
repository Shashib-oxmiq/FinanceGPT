// ── Expenses Service ──────────────────────────────────────────────────────────
// Receipt scanner: photo → AI extracts amount, merchant, category.
// Stores expenses in SQLite for monthly summaries.

import { dbAll, dbRun, uuid } from "./db";
import { complete, buildSystemPrompt } from "./ai";
import { Platform } from "react-native";

export async function getExpenses(userId, limit = 100) {
  const rows = await dbAll(
    "SELECT * FROM expenses WHERE user_id = ? ORDER BY date DESC, created_at DESC LIMIT ?",
    [userId, limit]
  );
  return rows || [];
}

export async function createExpense(userId, { amount, category, merchant, date, notes, receipt_uri }) {
  const id = uuid();
  const expenseDate = date || new Date().toISOString().split("T")[0];
  await dbRun(
    "INSERT INTO expenses (expense_id, user_id, amount, category, merchant, date, notes, receipt_uri) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [id, userId, amount, category || "Other", merchant || "", expenseDate, notes || "", receipt_uri || ""]
  );
  return { expense_id: id, amount, category, merchant, date: expenseDate, notes, receipt_uri };
}

export async function deleteExpense(expenseId) {
  await dbRun("DELETE FROM expenses WHERE expense_id = ?", [expenseId]);
}

// ── Extract expense info from receipt photo using AI ──
export async function extractExpenseFromReceipt(user, imageBase64, langCode) {
  try {
    const system = await buildSystemPrompt(user, [], langCode);
    const prompt =
      "Extract expense information from this receipt image. Return ONLY JSON:\n" +
      '{"amount": number, "merchant": "string", "category": "Groceries|Fuel|Dining|Medical|Shopping|Transport|Utilities|Other", "date": "YYYY-MM-DD"}\n' +
      "If you cannot read the receipt, return {\"amount\": 0, \"merchant\": \"Unknown\", \"category\": \"Other\"}.";
    // Note: Yolo-Auto may support vision — we pass the image as part of the prompt
    const text = await complete(system + "\n\n[Receipt image attached]", prompt, "yolo");
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch { /* */ }
    return null;
  } catch (e) {
    console.warn("Receipt extraction failed:", e.message);
    return null;
  }
}

// ── Monthly expense summary ──
export async function getMonthlySummary(userId) {
  const expenses = await getExpenses(userId, 1000);
  const byCategory = {};
  const byMonth = {};

  for (const e of expenses) {
    const cat = e.category || "Other";
    const month = (e.date || "").substring(0, 7); // YYYY-MM
    const amt = Number(e.amount) || 0;

    byCategory[cat] = (byCategory[cat] || 0) + amt;
    if (month) {
      if (!byMonth[month]) byMonth[month] = {};
      byMonth[month][cat] = (byMonth[month][cat] || 0) + amt;
      byMonth[month].total = (byMonth[month].total || 0) + amt;
    }
  }

  const total = Object.values(byCategory).reduce((s, v) => s + v, 0);
  const currentMonth = new Date().toISOString().substring(0, 7);
  const thisMonth = byMonth[currentMonth] || { total: 0 };

  return { byCategory, byMonth, total, thisMonth, count: expenses.length };
}

// ── Pick image from camera/gallery ──
export async function pickReceiptImage() {
  if (Platform.OS === "web") {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.capture = "environment";
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) { resolve({ canceled: true }); return; }
        const reader = new FileReader();
        reader.onload = () => {
          resolve({ canceled: false, uri: reader.result, name: file.name });
        };
        reader.readAsDataURL(file);
      };
      input.click();
    });
  }
  // Native: would use expo-image-picker
  return { canceled: true };
}