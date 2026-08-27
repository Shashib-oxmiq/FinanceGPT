/**
 * F-223: Goal Optimization Engine
 * When a user has multiple goals competing for the same money,
 * recommends optimal monthly allocation across all goals.
 */

import { getGoals } from "./goals";
import { getRetirementCorpus, calculateRetirementNeeded } from "./retirement";
import { getEducationPlans } from "./education";
import { buildFinancialProfile } from "./financialProfile";

const PRIORITY = {
  emergency: 1,   // Non-negotiable, immediate
  insurance: 2,   // Protection before growth
  debt: 3,        // High-interest debt before investing
  education: 4,   // Non-negotiable timeline
  retirement: 5,  // Long horizon, compound growth
  house: 6,       // Flexible timeline
  travel: 7,      // Discretionary
  other: 8,       // Lowest priority
};

/**
 * Analyze all goals and recommend optimal monthly allocation.
 */
export async function optimizeGoals(userId, investments = [], insurance = []) {
  try {
    const profile = await buildFinancialProfile(userId, investments, insurance);
    const goals = await getGoals(userId).catch(() => []);
    const retirement = await getRetirementCorpus(userId).catch(() => []);
    const education = await getEducationPlans(userId).catch(() => []);

    if (!profile) return null;

    // Build unified goal list
    const allGoals = [];

    // Emergency fund (always priority 1 if not met)
    const emergencyTarget = profile.cashFlow.monthlyIncome * 6;
    const emergencyCurrent = Math.min(emergencyTarget, profile.netWorth.breakdown.investments * 0.3); // Assume 30% liquid
    allGoals.push({
      id: "emergency",
      name: "Emergency Fund",
      type: "emergency",
      priority: PRIORITY.emergency,
      target: emergencyTarget,
      current: emergencyCurrent,
      monthlyNeed: Math.max(2000, Math.ceil((emergencyTarget - emergencyCurrent) / 12)),
      timeline: 12, // Build in 12 months
      flexible: false,
    });

    // Insurance gap (priority 2)
    if (profile.risk.insuranceGap > 0) {
      allGoals.push({
        id: "insurance_gap",
        name: "Term Insurance",
        type: "insurance",
        priority: PRIORITY.insurance,
        target: 1500, // Monthly premium for ₹1 crore cover
        current: 0,
        monthlyNeed: 1500,
        timeline: 1,
        flexible: false,
        note: "₹1 crore term plan, ~₹1500/month",
      });
    }

    // High-interest debt (priority 3)
    if (profile.risk.dti >= 40) {
      allGoals.push({
        id: "debt_reduction",
        name: "Debt Reduction",
        type: "debt",
        priority: PRIORITY.debt,
        target: profile.netWorth.totalDebt,
        current: 0,
        monthlyNeed: Math.max(3000, Math.ceil(profile.cashFlow.breakdown.emi * 0.2)),
        timeline: 24,
        flexible: true,
        note: "Prepay 20% extra on highest-interest loan",
      });
    }

    // Education plans (priority 4)
    education.forEach((e, i) => {
      const cost = Number(e.estimated_cost) || 0;
      const saved = Number(e.current_savings) || 0;
      const monthly = Number(e.monthly_contribution) || 0;
      allGoals.push({
        id: `education_${e.plan_id || i}`,
        name: `Education: ${e.child_name}`,
        type: "education",
        priority: PRIORITY.education,
        target: cost,
        current: saved,
        monthlyNeed: monthly,
        timeline: (Number(e.child_age) || 5) + 13, // Until college
        flexible: false,
      });
    });

    // Retirement (priority 5)
    if (retirement.length > 0) {
      const retirementCalc = calculateRetirementNeeded(35, 60, profile.cashFlow.monthlyExpenses || 50000);
      const projected = retirement.reduce((s, r) => {
        const yrs = retirementCalc.yearsToRetire;
        const val = Number(r.current_value) || 0;
        const rate = (Number(r.expected_return) || 8) / 100;
        const monthly = (Number(r.monthly_contribution) || 0) + (Number(r.employer_contribution) || 0);
        return s + val * Math.pow(1 + rate, yrs) + monthly * 12 * ((Math.pow(1 + rate, yrs) - 1) / rate);
      }, 0);
      const shortfall = Math.max(0, retirementCalc.corpusNeeded - projected);
      const monthlyForRetirement = shortfall > 0 ? Math.ceil(shortfall / (retirementCalc.yearsToRetire * 12)) : 0;
      allGoals.push({
        id: "retirement",
        name: "Retirement Corpus",
        type: "retirement",
        priority: PRIORITY.retirement,
        target: retirementCalc.corpusNeeded,
        current: projected,
        monthlyNeed: monthlyForRetirement,
        timeline: retirementCalc.yearsToRetire,
        flexible: true,
      });
    }

    // User goals (priority 6-8 by type)
    goals.forEach((g, i) => {
      const target = Number(g.target_amount) || 0;
      const current = Number(g.current_amount) || 0;
      const monthly = Number(g.monthly_contribution) || 0;
      const type = g.goal_type || "other";
      allGoals.push({
        id: `goal_${g.goal_id || i}`,
        name: g.name,
        type,
        priority: PRIORITY[type] || PRIORITY.other,
        target,
        current,
        monthlyNeed: monthly,
        timeline: g.target_date ? Math.max(1, Math.ceil((new Date(g.target_date) - new Date()) / (365 * 86400000))) : 60,
        flexible: type !== "education",
      });
    });

    // Sort by priority
    allGoals.sort((a, b) => a.priority - b.priority);

    // ── Optimize allocation ──
    const availableSurplus = profile.cashFlow.monthlySurplus;
    let remaining = availableSurplus;
    const allocation = [];

    for (const goal of allGoals) {
      if (remaining <= 0) {
        allocation.push({ ...goal, allocated: 0, status: "unfunded", pct: goal.target > 0 ? Math.round((goal.current / goal.target) * 100) : 0 });
        continue;
      }
      const allocated = Math.min(goal.monthlyNeed, remaining);
      remaining -= allocated;
      const pct = goal.target > 0 ? Math.round((goal.current / goal.target) * 100) : 0;
      allocation.push({
        ...goal,
        allocated,
        status: allocated >= goal.monthlyNeed ? "fully_funded" : "partially_funded",
        pct,
      });
    }

    // ── Generate recommendation ──
    const recommendation = generateOptimizationRecommendation(allocation, availableSurplus);

    return {
      totalSurplus: availableSurplus,
      totalAllocated: availableSurplus - remaining,
      remainingUnallocated: remaining,
      goals: allocation,
      recommendation,
      priorityOrder: allGoals.map(g => `${g.priority}. ${g.name}`),
    };
  } catch (e) {
    console.error("Goal optimization error:", e);
    return null;
  }
}

function generateOptimizationRecommendation(allocation, surplus) {
  const unfunded = allocation.filter(a => a.status === "unfunded");
  const partially = allocation.filter(a => a.status === "partially_funded");
  const fully = allocation.filter(a => a.status === "fully_funded");

  if (surplus < 0) {
    return `Your monthly cash flow is negative. You cannot fund new goals right now. Focus on reducing expenses and prepaying high-interest debt first.`;
  }

  if (surplus === 0) {
    return `Your surplus is ₹0. All available income is already allocated. To fund new goals, increase income or reduce existing commitments.`;
  }

  const parts = [];
  if (fully.length > 0) parts.push(`${fully.length} goal(s) fully funded in this plan`);
  if (partially.length > 0) parts.push(`${partially.length} partially funded`);
  if (unfunded.length > 0) parts.push(`${unfunded.length} unfunded — need more surplus or extend timeline`);

  if (unfunded.length > 0) {
    const u = unfunded[0];
    parts.push(`\nNext priority: "${u.name}" needs ₹${u.monthlyNeed.toLocaleString("en-IN")}/month. Increase income by ₹${u.monthlyNeed.toLocaleString("en-IN")} or extend timeline.`);
  }

  return parts.join(". ");
}

/**
 * Format optimization for AI prompt.
 */
export function formatOptimizationForPrompt(opt) {
  if (!opt) return "";
  const lines = [
    `\n=== GOAL OPTIMIZATION ===`,
    `Monthly surplus: ₹${opt.totalSurplus.toLocaleString("en-IN")}`,
    `Allocated: ₹${opt.totalAllocated.toLocaleString("en-IN")}, Unallocated: ₹${opt.remainingUnallocated.toLocaleString("en-IN")}`,
    ``,
    "Priority allocation:",
    ...opt.goals.map((g, i) =>
      `${i + 1}. ${g.name}: ₹${g.allocated.toLocaleString("en-IN")}/mo (${g.status === "fully_funded" ? "✓" : g.status === "partially_funded" ? "partial" : "unfunded"}) — ${g.pct}% complete`
    ),
    ``,
    `Recommendation: ${opt.recommendation}`,
    `=== END OPTIMIZATION ===\n`,
  ];
  return lines.join("\n");
}