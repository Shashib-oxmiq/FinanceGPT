// ── Premium Payment Calendar Service (F-214) ──────────────────────────────────
// Unified timeline of all insurance premium payments.

import { api } from "./api";

export async function getPremiumCalendar(userId) {
  let policies = [];
  try { policies = await api.getInsurance(userId); } catch { /* */ }

  const now = new Date();
  const premiums = [];

  for (const p of policies) {
    if (!p.premium_amount || p.premium_amount <= 0) continue;

    const freq = (p.premium_frequency || "annual").toLowerCase();
    let baseDate = p.last_premium_date || p.start_date || p.created_at;
    if (baseDate) baseDate = new Date(baseDate);
    else baseDate = new Date();

    // Generate next 3 payment dates
    const dates = [];
    let d = new Date(baseDate);
    for (let i = 0; i < 3; i++) {
      if (freq.includes("month")) d.setMonth(d.getMonth() + 1);
      else if (freq.includes("quarter")) d.setMonth(d.getMonth() + 3);
      else if (freq.includes("semi")) d.setMonth(d.getMonth() + 6);
      else d.setFullYear(d.getFullYear() + 1);
      dates.push(new Date(d));
    }

    for (const dueDate of dates) {
      const daysLeft = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
      premiums.push({
        id: `${p.insurance_id || p.policy_id}_${dueDate.getTime()}`,
        policy_id: p.insurance_id || p.policy_id,
        policy_type: p.policy_type,
        provider: p.provider,
        amount: Number(p.premium_amount),
        frequency: p.premium_frequency,
        dueDate: dueDate.toISOString().split("T")[0],
        daysLeft,
        urgency: daysLeft < 0 ? "overdue" : daysLeft <= 15 ? "critical" : daysLeft <= 30 ? "high" : daysLeft <= 60 ? "medium" : "low",
        paid: false, // would track with bill payments
      });
    }
  }

  // Sort by due date
  premiums.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  // Group by month
  const byMonth = {};
  for (const p of premiums) {
    const month = p.dueDate.substring(0, 7); // YYYY-MM
    if (!byMonth[month]) byMonth[month] = { month, total: 0, premiums: [] };
    byMonth[month].total += p.amount;
    byMonth[month].premiums.push(p);
  }

  const months = Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month));
  const totalAnnual = premiums.reduce((s, p) => s + p.amount, 0) / 3; // average annual (3 future payments)

  return { premiums, months, totalAnnual, count: premiums.length };
}