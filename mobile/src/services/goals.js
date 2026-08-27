// ── Goals Service ─────────────────────────────────────────────────────────────
// Goal-based planning: create, track, and update financial goals.
// Uses SQLite on native, in-memory on web (via db.js factory).

import { dbGet, dbAll, dbRun, uuid } from "./db";

export async function getGoals(userId) {
  const rows = await dbAll("SELECT * FROM goals WHERE user_id = ? AND status = 'active' ORDER BY target_date ASC", [userId]);
  return rows || [];
}

export async function createGoal(userId, { title, target_amount, current_amount = 0, target_date, monthly_contribution = 0, category = "savings" }) {
  const id = uuid();
  await dbRun(
    "INSERT INTO goals (goal_id, user_id, title, target_amount, current_amount, target_date, monthly_contribution, category, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')",
    [id, userId, title, target_amount, current_amount, target_date, monthly_contribution, category]
  );
  return { goal_id: id, title, target_amount, current_amount, target_date, monthly_contribution, category, status: "active" };
}

export async function updateGoal(goalId, updates) {
  const fields = [];
  const vals = [];
  for (const [k, v] of Object.entries(updates)) {
    if (["title", "target_amount", "current_amount", "target_date", "monthly_contribution", "category", "status"].includes(k)) {
      fields.push(`${k} = ?`);
      vals.push(v);
    }
  }
  if (fields.length === 0) return;
  vals.push(goalId);
  await dbRun(`UPDATE goals SET ${fields.join(", ")} WHERE goal_id = ?`, vals);
}

export async function deleteGoal(goalId) {
  await dbRun("UPDATE goals SET status = 'deleted' WHERE goal_id = ?", [goalId]);
}

export async function contributeToGoal(goalId, amount) {
  await dbRun("UPDATE goals SET current_amount = current_amount + ? WHERE goal_id = ?", [amount, goalId]);
}

// ── Calculate progress for a goal ──
export function getGoalProgress(goal) {
  const target = Number(goal.target_amount) || 0;
  const current = Number(goal.current_amount) || 0;
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;

  // Calculate months remaining
  let monthsLeft = null;
  if (goal.target_date) {
    const target = new Date(goal.target_date);
    const now = new Date();
    monthsLeft = Math.max(0, (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth()));
  }

  // Calculate required monthly contribution
  let requiredMonthly = null;
  if (monthsLeft !== null && monthsLeft > 0) {
    const remaining = target - current;
    requiredMonthly = Math.ceil(remaining / monthsLeft);
  }

  // On track?
  const monthlyContribution = Number(goal.monthly_contribution) || 0;
  const onTrack = requiredMonthly !== null && monthlyContribution >= requiredMonthly;

  return { pct, monthsLeft, requiredMonthly, onTrack, remaining: target - current };
}

// ── AI goal planning: parse a goal from conversation ──
export function parseGoalFromText(text) {
  // Simple extraction — the AI will do better, but this is a fallback
  const amountMatch = text.match(/₹?\s*(\d[\d,]*)\s*(lakh|lac|crore|k|thousand)?/i);
  let amount = 0;
  if (amountMatch) {
    amount = parseInt(amountMatch[1].replace(/,/g, ""), 10);
    const unit = (amountMatch[2] || "").toLowerCase();
    if (unit === "lakh" || unit === "lac") amount *= 100000;
    else if (unit === "crore") amount *= 10000000;
    else if (unit === "k" || unit === "thousand") amount *= 1000;
  }

  const dateMatch = text.match(/(\d+)\s*(year|yr|month)/i);
  let targetDate = null;
  if (dateMatch) {
    const num = parseInt(dateMatch[1], 10);
    const unit = dateMatch[2].toLowerCase();
    const d = new Date();
    if (unit.startsWith("year")) d.setFullYear(d.getFullYear() + num);
    else d.setMonth(d.getMonth() + num);
    targetDate = d.toISOString().split("T")[0];
  }

  return { target_amount: amount, target_date: targetDate };
}