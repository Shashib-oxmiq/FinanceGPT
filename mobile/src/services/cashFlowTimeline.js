/**
 * F-225: Cash Flow Timeline
 * 12-month cash flow calendar showing income vs outflow with stress testing.
 */

import { buildFinancialProfile } from "./financialProfile";
import { getBills } from "./bills";
import { getLoans } from "./loans";
import { getGoals } from "./goals";
import { getRetirementCorpus } from "./retirement";
import { getEducationPlans } from "./education";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Build a 12-month cash flow projection.
 */
export async function buildCashFlowTimeline(userId, investments = [], insurance = []) {
  try {
    const profile = await buildFinancialProfile(userId, investments, insurance);
    if (!profile) return null;

    const [bills, loans, goals, retirement, education] = await Promise.all([
      getBills(userId).catch(() => []),
      getLoans(userId).catch(() => []),
      getGoals(userId).catch(() => []),
      getRetirementCorpus(userId).catch(() => []),
      getEducationPlans(userId).catch(() => []),
    ]);

    const now = new Date();
    const currentMonth = now.getMonth();
    const monthlyIncome = profile.cashFlow.monthlyIncome;

    // Recurring monthly outflows
    const recurringMonthly = {
      emi: loans.reduce((s, l) => s + (Number(l.emi_amount) || 0), 0),
      bills: bills.filter(b => (b.frequency || "monthly") === "monthly").reduce((s, b) => s + (Number(b.amount) || 0), 0),
      sips: goals.reduce((s, g) => s + (Number(g.monthly_contribution) || 0), 0),
      retirement: retirement.reduce((s, r) => s + (Number(r.monthly_contribution) || 0) + (Number(r.employer_contribution) || 0), 0),
      education: education.reduce((s, e) => s + (Number(e.monthly_contribution) || 0), 0),
    };

    // Non-recurring bills (one-time with specific due dates)
    const oneTimeBills = bills.filter(b => b.due_date && (b.frequency || "monthly") !== "monthly" && !b.paid);

    // Insurance premiums (annual/semi-annual)
    const premiums = insurance.filter(i => i.premium_amount > 0 && i.premium_frequency !== "monthly").map(i => {
      const dueDate = i.next_premium_date || i.start_date;
      return { month: dueDate ? new Date(dueDate).getMonth() : -1, amount: Number(i.premium_amount) || 0, label: i.policy_type };
    });

    // Build 12 months
    const months = [];
    for (let i = 0; i < 12; i++) {
      const monthIdx = (currentMonth + i) % 12;
      const monthName = MONTH_NAMES[monthIdx];
      const year = now.getFullYear() + (currentMonth + i >= 12 ? 1 : 0);

      // Recurring outflow
      const recurringTotal = Object.values(recurringMonthly).reduce((s, v) => s + v, 0);

      // One-time bills this month
      const oneTimeThisMonth = oneTimeBills.filter(b => {
        if (!b.due_date) return false;
        const d = new Date(b.due_date);
        return d.getMonth() === monthIdx && d.getFullYear() === year;
      }).reduce((s, b) => s + Number(b.amount || 0), 0);

      // Premiums this month
      const premiumsThisMonth = premiums.filter(p => p.month === monthIdx).reduce((s, p) => s + p.amount, 0);

      // Festival/seasonal adjustments (rough estimates)
      const seasonalAdjust = getSeasonalAdjustment(monthIdx);

      const totalOutflow = recurringTotal + oneTimeThisMonth + premiumsThisMonth + seasonalAdjust;
      const surplus = monthlyIncome - totalOutflow;

      months.push({
        month: monthName,
        monthIdx,
        year,
        income: monthlyIncome,
        outflow: totalOutflow,
        surplus,
        surplusPct: monthlyIncome > 0 ? Math.round((surplus / monthlyIncome) * 100) : 0,
        isNegative: surplus < 0,
        breakdown: {
          recurring: recurringTotal,
          oneTime: oneTimeThisMonth,
          premiums: premiumsThisMonth,
          seasonal: seasonalAdjust,
        },
        premiums: premiums.filter(p => p.month === monthIdx),
        warnings: surplus < 0 ? ["Cash flow negative"] : [],
      });
    }

    // ── Stress test: what if income drops 20%? ──
    const stressTest = months.map(m => ({
      month: m.month,
      stressedIncome: Math.round(monthlyIncome * 0.8),
      stressedSurplus: Math.round(monthlyIncome * 0.8 - m.outflow),
      wouldBeNegative: Math.round(monthlyIncome * 0.8 - m.outflow) < 0,
    }));

    // ── Summary ──
    const totalSurplus = months.reduce((s, m) => s + m.surplus, 0);
    const negativeMonths = months.filter(m => m.isNegative);
    const worstMonth = negativeMonths.length > 0
      ? negativeMonths.reduce((min, m) => m.surplus < min.surplus ? m : min)
      : null;

    return {
      months,
      stressTest,
      summary: {
        totalAnnualSurplus: totalSurplus,
        averageMonthlySurplus: Math.round(totalSurplus / 12),
        negativeMonthCount: negativeMonths.length,
        negativeMonths: negativeMonths.map(m => m.month),
        worstMonth: worstMonth ? { month: worstMonth.month, deficit: Math.abs(worstMonth.surplus) } : null,
        stressedNegativeCount: stressTest.filter(s => s.wouldBeNegative).length,
      },
      recurringMonthly,
    };
  } catch (e) {
    console.error("Cash flow timeline error:", e);
    return null;
  }
}

/**
 * Seasonal spending adjustments for India (rough estimates).
 * Oct: Diwali shopping, Nov: Wedding season, Dec: Year-end, Mar: Holi
 */
function getSeasonalAdjustment(monthIdx) {
  const adjustments = {
    0: 0,   // Jan
    1: 0,   // Feb
    2: 5000, // Mar — Holi, financial year-end spending
    3: 0,   // Apr
    4: 0,   // May
    5: 0,   // Jun
    6: 0,   // Jul
    7: 0,   // Aug — Raksha Bandhan (small)
    8: 0,   // Sep
    9: 15000, // Oct — Diwali, Navratri
    10: 10000, // Nov — Wedding season, festive sales
    11: 5000,  // Dec — Year-end, Christmas
  };
  return adjustments[monthIdx] || 0;
}

/**
 * Format timeline for AI prompt.
 */
export function formatTimelineForPrompt(timeline) {
  if (!timeline) return "";
  const lines = [
    `\n=== CASH FLOW TIMELINE (12 months) ===`,
    `Average monthly surplus: ₹${timeline.summary.averageMonthlySurplus.toLocaleString("en-IN")}`,
    `Negative months: ${timeline.summary.negativeMonthCount} (${(timeline.summary.negativeMonths || []).join(", ") || "none"})`,
  ];
  if (timeline.summary.worstMonth) {
    lines.push(`Worst month: ${timeline.summary.worstMonth.month} (deficit ₹${timeline.summary.worstMonth.deficit.toLocaleString("en-IN")})`);
  }
  lines.push(`Stress test (20% income cut): ${timeline.summary.stressedNegativeCount} months go negative`);
  lines.push("");
  timeline.months.forEach(m => {
    const flag = m.isNegative ? " ⚠️" : "";
    lines.push(`${m.month}: In ₹${m.income.toLocaleString("en-IN")} — Out ₹${m.outflow.toLocaleString("en-IN")} = Surplus ₹${m.surplus.toLocaleString("en-IN")}${flag}`);
  });
  lines.push(`=== END TIMELINE ===\n`);
  return lines.join("\n");
}