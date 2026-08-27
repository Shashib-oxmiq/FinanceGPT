// ── Smart Reminders Service ───────────────────────────────────────────────────
// Links reminders to documents and life events. Instead of generic reminders,
// creates contextual reminders: "Renew passport before your March trip"
// "Pay LIC premium (policy in vault)", "File ITR before July 31"

import { api } from "./api";
import { getDocumentExpiries } from "./docExpiry";
import { getUpcomingTaxEvents, getAdvanceTaxStatus, getProjectedTax } from "./tax";

// ── Generate smart reminders from user data ──
export async function generateSmartReminders(userId) {
  const smart = [];

  // 1. Document expiry reminders
  try {
    const expiries = await getDocumentExpiries(userId);
    for (const exp of expiries) {
      if (exp.daysLeft <= 90) {
        smart.push({
          id: `expiry_${exp.id}`,
          type: "document_expiry",
          title: exp.label,
          due_date: exp.expiryDate,
          priority: exp.urgency === "expired" || exp.urgency === "critical" ? "high" : "medium",
          category: "document_renewal",
          notes: exp.action,
          daysLeft: exp.daysLeft,
          icon: "document-text",
          color: exp.urgency === "expired" ? "#ef4444" : exp.urgency === "critical" ? "#ef4444" : "#f59e0b",
        });
      }
    }
  } catch (e) { /* non-fatal */ }

  // 2. Insurance premium reminders
  try {
    const policies = await api.getInsurance(userId);
    for (const p of policies) {
      if (p.premium_amount && p.premium_frequency) {
        const nextDue = calculateNextPremium(p);
        if (nextDue) {
          const daysLeft = Math.ceil((nextDue - new Date()) / (1000 * 60 * 60 * 24));
          if (daysLeft <= 60) {
            smart.push({
              id: `premium_${p.insurance_id || p.policy_id}`,
              type: "insurance_premium",
              title: `Pay ${p.policy_type} premium — ${p.provider}`,
              due_date: nextDue.toISOString().split("T")[0],
              priority: daysLeft <= 15 ? "high" : "medium",
              category: "insurance",
              notes: `Premium: ₹${Number(p.premium_amount).toLocaleString('en-IN')} (${p.premium_frequency})`,
              daysLeft,
              icon: "shield-checkmark",
              color: daysLeft <= 15 ? "#ef4444" : "#3b82f6",
            });
          }
        }
      }
    }
  } catch (e) { /* non-fatal */ }

  // 3. Year-round tax calendar (advance tax, ITR, 80C deadline, etc.)
  try {
    const taxEvents = getUpcomingTaxEvents(userId, 6);
    for (const ev of taxEvents) {
      const daysLeft = ev.daysUntil !== undefined ? ev.daysUntil : 999;
      if (daysLeft <= 60 || ev.urgency === "overdue") {
        smart.push({
          id: `tax_cal_${ev.label || ev.title}`.replace(/\s+/g, "_").substring(0, 40),
          type: "tax_calendar",
          title: ev.label || ev.title,
          due_date: ev.date || `${ev.month}/${ev.day}`,
          priority: ev.urgency === "overdue" ? "high" : daysLeft <= 15 ? "high" : "medium",
          category: "tax",
          notes: ev.note || (ev.urgency === "overdue" ? "This deadline has passed — take action if not done." : "Tax planning deadline approaching. Ask AI for help."),
          daysLeft: daysLeft < 0 ? 0 : daysLeft,
          icon: "calculator",
          color: ev.urgency === "overdue" ? "#ef4444" : daysLeft <= 15 ? "#ef4444" : "#f59e0b",
        });
      }
    }
  } catch (e) { /* non-fatal */ }

  // 3b. Advance tax reminder (if projected tax > 10K and payment due soon)
  try {
    const proj = await getProjectedTax(userId);
    if (proj?.projectedTax > 10000) {
      const at = getAdvanceTaxStatus(proj.projectedTax, proj.tdsAlreadyPaid || 0);
      if (at.daysUntil <= 30 || at.isOverdue) {
        smart.push({
          id: `tax_advance_${at.label}`.replace(/\s+/g, "_").substring(0, 40),
          type: "tax_advance",
          title: `Pay advance tax: ${at.label}`,
          due_date: at.nextDueDate,
          priority: at.isOverdue ? "high" : at.daysUntil <= 7 ? "high" : "medium",
          category: "tax",
          notes: `Pay Rs.${at.nextDueAmount.toLocaleString('en-IN')} (${at.percentage}% of estimated annual tax). Total paid so far: Rs.${(proj.tdsAlreadyPaid || 0).toLocaleString('en-IN')}`,
          daysLeft: at.daysUntil < 0 ? 0 : at.daysUntil,
          icon: "cash",
          color: at.isOverdue ? "#ef4444" : "#f59e0b",
        });
      }
    }
  } catch (e) { /* non-fatal */ }

  // 4. Goal contribution reminders
  try {
    const { getGoals } = require("./goals");
    const goals = await getGoals(userId);
    for (const g of goals) {
      if (g.monthly_contribution && g.status === "active") {
        const today = now.getDate();
        const dueDay = 5; // suggest contributing by 5th of each month
        let nextDue = new Date(now.getFullYear(), now.getMonth(), dueDay);
        if (today > dueDay) nextDue = new Date(now.getFullYear(), now.getMonth() + 1, dueDay);
        const daysLeft = Math.ceil((nextDue - now) / (1000 * 60 * 60 * 24));
        if (daysLeft <= 15) {
          smart.push({
            id: `goal_${g.goal_id}`,
            type: "goal_contribution",
            title: `Contribute to goal: ${g.title}`,
            due_date: nextDue.toISOString().split("T")[0],
            priority: "medium",
            category: "goal",
            notes: `Monthly contribution: ₹${Number(g.monthly_contribution).toLocaleString('en-IN')}`,
            daysLeft,
            icon: "flag",
            color: "#10b981",
          });
        }
      }
    }
  } catch (e) { /* non-fatal */ }

  // Sort by days left
  smart.sort((a, b) => a.daysLeft - b.daysLeft);
  return smart;
}

function calculateNextPremium(policy) {
  if (!policy.premium_frequency) return null;
  const now = new Date();
  const freq = policy.premium_frequency.toLowerCase();

  // Try to use last payment date or start date
  let baseDate = policy.last_premium_date || policy.start_date || policy.created_at;
  if (baseDate) {
    baseDate = new Date(baseDate);
  } else {
    // If no base date, assume premium due at start of next period
    baseDate = now;
  }

  const next = new Date(baseDate);
  if (freq.includes("month")) next.setMonth(next.getMonth() + 1);
  else if (freq.includes("quarter")) next.setMonth(next.getMonth() + 3);
  else if (freq.includes("semi")) next.setMonth(next.getMonth() + 6);
  else next.setFullYear(next.getFullYear() + 1);

  // If next is still in past, keep advancing
  while (next < now) {
    if (freq.includes("month")) next.setMonth(next.getMonth() + 1);
    else if (freq.includes("quarter")) next.setMonth(next.getMonth() + 3);
    else if (freq.includes("semi")) next.setMonth(next.getMonth() + 6);
    else next.setFullYear(next.getFullYear() + 1);
  }

  return next;
}