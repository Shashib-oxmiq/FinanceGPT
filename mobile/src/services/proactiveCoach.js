/**
 * F-224: Proactive Financial Coach
 * AI-initiated conversations based on scheduled scans of user data.
 * Reaches out to users proactively like a real financial advisor.
 */

import { generateInsights } from "./insightEngine";
import { buildFinancialProfile } from "./financialProfile";

const COACH_INTERVALS = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

/**
 * Check if a coaching message should be sent.
 * Returns a message if enough time has passed since the last one.
 */
export async function checkAndCoach(userId, lastCoachTime, investments = [], insurance = [], reminders = []) {
  try {
    const now = Date.now();
    const sinceLast = now - (lastCoachTime || 0);

    // Don't coach more than once per day
    if (sinceLast < COACH_INTERVALS.daily) return null;

    // Determine coaching cadence based on situation
    const profile = await buildFinancialProfile(userId, investments, insurance, reminders);
    if (!profile) return null;

    const insights = await generateInsights(userId, investments, insurance);
    const criticalCount = insights.filter(i => i.severity === "critical").length;
    const highCount = insights.filter(i => i.severity === "high").length;

    // ── Critical: coach immediately ──
    if (criticalCount > 0) {
      return generateCoachMessage("critical", insights, profile, sinceLast);
    }

    // ── Weekly checkup ──
    if (sinceLast >= COACH_INTERVALS.weekly) {
      return generateCoachMessage("weekly", insights, profile, sinceLast);
    }

    // ── Pre-deadline nudge (bill/EMI/premium due in ≤7 days) ──
    const dueSoon = profile.upcoming.filter(u => {
      const days = Math.ceil((new Date(u.due) - now) / 86400000);
      return days <= 7 && days >= 0;
    });
    if (dueSoon.length > 0 && sinceLast >= COACH_INTERVALS.daily) {
      return generateCoachMessage("deadline", insights, profile, sinceLast, dueSoon);
    }

    // ── Monthly checkup ──
    if (sinceLast >= COACH_INTERVALS.monthly) {
      return generateCoachMessage("monthly", insights, profile, sinceLast);
    }

    return null;
  } catch (e) {
    console.error("Coach error:", e);
    return null;
  }
}

function generateCoachMessage(type, insights, profile, sinceLast, dueSoon = []) {
  switch (type) {
    case "critical":
      return {
        type: "critical",
        priority: 1,
        title: "🚨 Financial Alert",
        message: buildCriticalMessage(insights, profile),
        actions: insights.filter(i => i.severity === "critical").map(i => ({ label: i.title, action: i.action })),
        insights: insights.filter(i => i.severity === "critical"),
      };

    case "weekly":
      return {
        type: "weekly",
        priority: 3,
        title: "📅 Weekly Financial Checkup",
        message: buildWeeklyMessage(profile, insights),
        actions: [
          { label: "Review portfolio", action: "Check your investment performance" },
          { label: "Plan upcoming payments", action: `${profile.upcoming.length} payments due in 30 days` },
        ],
        insights: insights.slice(0, 3),
      };

    case "deadline":
      return {
        type: "deadline",
        priority: 2,
        title: "⏰ Payment Reminder",
        message: buildDeadlineMessage(dueSoon),
        actions: dueSoon.map(d => ({ label: d.label, action: `Pay ₹${Number(d.amount||0).toLocaleString("en-IN")} due ${d.due}` })),
        insights: [],
      };

    case "monthly":
      return {
        type: "monthly",
        priority: 4,
        title: "📊 Monthly Review",
        message: buildMonthlyMessage(profile, insights),
        actions: [
          { label: "Full review", action: "Review all your financial data" },
        ],
        insights: insights.slice(0, 5),
      };

    default:
      return null;
  }
}

function buildCriticalMessage(insights, profile) {
  const critical = insights.filter(i => i.severity === "critical");
  const parts = critical.map(c => `${c.title} — ${c.action}`);
  return `I've found ${critical.length} critical issue(s) in your finances:\n\n${parts.join("\n\n")}\n\nLet's address these together. Which one would you like to tackle first?`;
}

function buildWeeklyMessage(profile, insights) {
  const parts = [];
  parts.push(`Here's your weekly financial snapshot:`);
  parts.push(`• Net worth: ₹${profile.netWorth.netWorth.toLocaleString("en-IN")}`);
  parts.push(`• Monthly surplus: ₹${profile.cashFlow.monthlySurplus.toLocaleString("en-IN")}${profile.cashFlow.isNegative ? " ⚠️" : ""}`);
  parts.push(`• Health score: ${profile.healthScore}/100`);
  if (profile.upcoming.length > 0) {
    parts.push(`• ${profile.upcoming.length} payments due in 30 days`);
  }
  if (insights.length > 0) {
    parts.push(`\nI have ${insights.length} insight(s) for you. Want me to share the top ones?`);
  }
  return parts.join("\n");
}

function buildDeadlineMessage(dueSoon) {
  const parts = dueSoon.map(d => `• ${d.label}: ₹${Number(d.amount||0).toLocaleString("en-IN")} due ${d.due}`);
  return `You have ${dueSoon.length} payment(s) due within 7 days:\n\n${parts.join("\n")}\n\nMake sure you have sufficient balance. Want me to help plan?`;
}

function buildMonthlyMessage(profile, insights) {
  const parts = [];
  parts.push("It's time for your monthly financial review. Here's where you stand:");
  parts.push("");
  parts.push("📊 Net Worth: ₹" + profile.netWorth.netWorth.toLocaleString("en-IN"));
  parts.push("💰 Investments: ₹" + profile.netWorth.breakdown.investments.toLocaleString("en-IN"));
  parts.push("🏦 Retirement: ₹" + profile.netWorth.breakdown.retirement.toLocaleString("en-IN"));
  parts.push("🏠 Property: ₹" + profile.netWorth.breakdown.property.toLocaleString("en-IN"));
  parts.push("💳 Debt: ₹" + profile.netWorth.totalDebt.toLocaleString("en-IN"));
  parts.push("");
  parts.push("Health Score: " + profile.healthScore + "/100");
  parts.push("");
  if (insights.length > 0) {
    parts.push(`I've identified ${insights.length} area(s) that need attention. Let's review them together.`);
  } else {
    parts.push("Everything looks good! No urgent actions needed. Keep up the good work! 🎉");
  }
  return parts.join("\n");
}

/**
 * Generate a milestone celebration message.
 */
export function checkMilestones(profile, previousNetWorth) {
  const current = profile?.netWorth?.netWorth || 0;
  const prev = previousNetWorth || 0;

  // Crossing ₹50L, ₹1Cr, ₹5Cr
  const milestones = [500000, 1000000, 5000000, 10000000, 50000000];
  for (const m of milestones) {
    if (prev < m && current >= m) {
      return {
        type: "milestone",
        title: "🎉 Congratulations!",
        message: `Your net worth just crossed ₹${(m / 100000).toFixed(m < 10000000 ? 1 : 0)}L! That's a big achievement. Want to see what drove this growth?`,
      };
    }
  }

  // Month-over-month gain > 5%
  if (prev > 0 && current > prev) {
    const gainPct = Math.round(((current - prev) / prev) * 100);
    if (gainPct >= 5) {
      return {
        type: "milestone",
        title: "📈 Great progress!",
        message: `Your net worth is up ${gainPct}% since last month. You gained ₹${(current - prev).toLocaleString("en-IN")}. Keep it up!`,
      };
    }
  }

  return null;
}