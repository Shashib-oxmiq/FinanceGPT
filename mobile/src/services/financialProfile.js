/**
 * F-220: Unified Financial Profile Engine
 * Computes a real-time composite picture of the user's entire financial life.
 * This profile gets injected into every AI conversation as system context.
 */

import { getLoans, getDebtSummary } from "./loans";
import { getBills, getBillSummary } from "./bills";
import { getRetirementCorpus, calculateRetirementNeeded } from "./retirement";
import { getEducationPlans } from "./education";
import { getProperties, getPropertySummary } from "./property";
import { getGoals } from "./goals";
import { getExpenses } from "./expenses";
import { computeHealthScore } from "./healthScore";
import { analyzePortfolio as analyzeAllocation } from "./rebalancing";

/**
 * Build the complete financial profile for a user.
 */
export async function buildFinancialProfile(userId, investments = [], insurance = [], reminders = []) {
  try {
    const [
      loans, debtSummary, bills, billSummary,
      retirement, educationPlans, properties, propSummary,
      goals, expenses, healthScore,
    ] = await Promise.all([
      getLoans(userId).catch(() => []),
      getDebtSummary(userId, 50000).catch(() => ({ dti: 0, totalEMI: 0, totalDebt: 0 })),
      getBills(userId).catch(() => []),
      getBillSummary(userId).catch(() => ({ totalUnpaid: 0, totalPaid: 0, overdue: [], dueSoon: [] })),
      getRetirementCorpus(userId).catch(() => []),
      getEducationPlans(userId).catch(() => []),
      getProperties(userId).catch(() => []),
      getPropertySummary(userId).catch(() => ({ totalValue: 0, totalAppreciation: 0, totalTaxDue: 0 })),
      getGoals(userId).catch(() => []),
      getExpenses(userId).catch(() => []),
      computeHealthScore(userId).catch(() => ({ score: 0, categories: {} })),
    ]);

    // ── Net Worth ──
    const invTotal = investments.reduce((s, i) => s + (Number(i.current_value) || 0), 0);
    const invInvested = investments.reduce((s, i) => s + (Number(i.amount_invested) || 0), 0);
    const invGain = invTotal - invInvested;
    const retirementTotal = retirement.reduce((s, r) => s + (Number(r.current_value) || 0), 0);
    const propertyTotal = propSummary?.totalValue || 0;
    const totalAssets = invTotal + retirementTotal + propertyTotal;
    const totalDebt = debtSummary?.totalDebt || 0;
    const netWorth = totalAssets - totalDebt;

    // ── Monthly Cash Flow ──
    const monthlyIncome = 50000;
    const totalEMI = debtSummary?.totalEMI || 0;
    const monthlyBills = bills.filter(b => (b.frequency || "monthly") === "monthly").reduce((s, b) => s + (Number(b.amount) || 0), 0);
    const monthlyExpenses = expenses.filter(e => {
      const d = new Date(e.date);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const totalSIPs = goals.reduce((s, g) => s + (Number(g.monthly_contribution) || 0), 0);
    const retirementMonthly = retirement.reduce((s, r) => s + (Number(r.monthly_contribution) || 0) + (Number(r.employer_contribution) || 0), 0);
    const educationMonthly = educationPlans.reduce((s, e) => s + (Number(e.monthly_contribution) || 0), 0);
    const totalOutflow = totalEMI + monthlyBills + monthlyExpenses + totalSIPs + retirementMonthly + educationMonthly;
    const monthlySurplus = monthlyIncome - totalOutflow;

    // ── Risk Exposure ──
    const rebalanceData = await analyzeAllocation(investments).catch(() => ({ suggestions: [], concentrationRisk: false }));
    const insuranceCoverage = insurance.reduce((s, i) => s + (Number(i.sum_assured) || 0), 0);
    const insuranceGap = Math.max(0, (monthlyIncome * 12 * 10) - insuranceCoverage);

    // ── Upcoming Commitments (next 30 days) ──
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 86400000);
    const upcomingBills = bills.filter(b => !b.paid && b.due_date && new Date(b.due_date) <= in30Days && new Date(b.due_date) >= now);
    const upcomingReminders = (reminders || []).filter(r => r.due_date && new Date(r.due_date) <= in30Days && new Date(r.due_date) >= now);
    const upcomingPremiums = insurance.filter(i => i.premium_amount > 0 && i.next_premium_date && new Date(i.next_premium_date) <= in30Days);
    const upcomingCommitments = [
      ...upcomingBills.map(b => ({ type: "bill", label: b.bill_type, amount: b.amount, due: b.due_date })),
      ...upcomingReminders.map(r => ({ type: "reminder", label: r.title, amount: 0, due: r.due_date })),
      ...upcomingPremiums.map(p => ({ type: "premium", label: p.policy_type, amount: p.premium_amount, due: p.next_premium_date })),
    ].sort((a, b) => new Date(a.due) - new Date(b.due));

    // ── Goal Progress ──
    const goalProgress = goals.map(g => {
      const target = Number(g.target_amount) || 0;
      const current = Number(g.current_amount) || 0;
      const pct = target > 0 ? Math.round((current / target) * 100) : 0;
      return { name: g.name, target, current, pct, shortfall: Math.max(0, target - current) };
    });

    // ── Education plans progress ──
    const eduProgress = educationPlans.map(e => {
      const cost = Number(e.estimated_cost) || 0;
      const saved = Number(e.current_savings) || 0;
      const pct = cost > 0 ? Math.round((saved / cost) * 100) : 0;
      return { name: e.child_name, target: cost, current: saved, pct, shortfall: Math.max(0, cost - saved) };
    });

    // ── Retirement projection ──
    const retirementProjection = retirement.length > 0
      ? calculateRetirementNeeded(35, 60, monthlyExpenses || 50000)
      : null;

    return {
      timestamp: now.toISOString(),
      netWorth: { totalAssets, totalDebt, netWorth, breakdown: { investments: invTotal, retirement: retirementTotal, property: propertyTotal, debt: totalDebt }, investmentGain: invGain, investmentGainPct: invInvested > 0 ? Math.round((invGain / invInvested) * 100) : 0 },
      cashFlow: { monthlyIncome, totalOutflow, monthlySurplus, surplusPct: monthlyIncome > 0 ? Math.round((monthlySurplus / monthlyIncome) * 100) : 0, breakdown: { emi: totalEMI, bills: monthlyBills, expenses: monthlyExpenses, sips: totalSIPs, retirement: retirementMonthly, education: educationMonthly }, isNegative: monthlySurplus < 0 },
      risk: { dti: debtSummary?.dti || 0, dtiStatus: (debtSummary?.dti || 0) >= 50 ? "critical" : (debtSummary?.dti || 0) >= 40 ? "risky" : "healthy", insuranceGap, insuranceCoverage, insuranceAdequate: insuranceCoverage >= monthlyIncome * 120, concentrationRisk: rebalanceData?.concentrationRisk || false, rebalanceSuggestions: rebalanceData?.suggestions || [] },
      upcoming: upcomingCommitments,
      goals: goalProgress,
      education: eduProgress,
      retirement: retirementProjection ? { corpusNeeded: retirementProjection.corpusNeeded, yearsToRetire: retirementProjection.yearsToRetire, projectedFromSources: retirement.reduce((s, r) => { const yrs = retirementProjection.yearsToRetire; const val = Number(r.current_value) || 0; const rate = (Number(r.expected_return) || 8) / 100; const monthly = (Number(r.monthly_contribution) || 0) + (Number(r.employer_contribution) || 0); return s + val * Math.pow(1 + rate, yrs) + monthly * 12 * ((Math.pow(1 + rate, yrs) - 1) / rate); }, 0) } : null,
      healthScore: healthScore?.score || 0,
      summary: generateProfileSummary({ netWorth, monthlySurplus, debtSummary, insuranceGap, healthScore: healthScore?.score || 0, goalsCount: goals.length, billsOverdue: billSummary?.overdue?.length || 0 }),
    };
  } catch (e) {
    console.error("Profile build error:", e);
    return null;
  }
}

function generateProfileSummary({ netWorth, monthlySurplus, debtSummary, insuranceGap, healthScore, goalsCount, billsOverdue }) {
  const parts = [];
  if (netWorth > 0) parts.push(`Net worth ₹${netWorth.toLocaleString("en-IN")}`);
  if (monthlySurplus < 0) parts.push(`⚠️ Monthly cash flow negative by ₹${Math.abs(monthlySurplus).toLocaleString("en-IN")}`);
  if ((debtSummary?.dti || 0) >= 40) parts.push(`⚠️ DTI at ${debtSummary.dti}% (high)`);
  if (insuranceGap > 0) parts.push(`Insurance gap: ₹${insuranceGap.toLocaleString("en-IN")}`);
  if (billsOverdue > 0) parts.push(`${billsOverdue} bills overdue`);
  parts.push(`Health score: ${healthScore}/100`);
  parts.push(`${goalsCount} active goals`);
  return parts.join(" · ");
}

/**
 * Format the profile as a system prompt context block for the AI.
 */
export function formatProfileForPrompt(profile) {
  if (!profile) return "";
  const lines = [
    `\n=== USER FINANCIAL PROFILE (real-time) ===`,
    `Net Worth: ₹${profile.netWorth.netWorth.toLocaleString("en-IN")} (Assets: ₹${profile.netWorth.totalAssets.toLocaleString("en-IN")}, Debt: ₹${profile.netWorth.totalDebt.toLocaleString("en-IN")})`,
    `Investments: ₹${profile.netWorth.breakdown.investments.toLocaleString("en-IN")} (gain: ${profile.netWorth.investmentGainPct}%)`,
    `Retirement corpus: ₹${profile.netWorth.breakdown.retirement.toLocaleString("en-IN")}`,
    `Property value: ₹${profile.netWorth.breakdown.property.toLocaleString("en-IN")}`,
    ``,
    `Monthly Cash Flow:`,
    `  Income: ₹${profile.cashFlow.monthlyIncome.toLocaleString("en-IN")}`,
    `  Outflow: ₹${profile.cashFlow.totalOutflow.toLocaleString("en-IN")} (EMI: ₹${profile.cashFlow.breakdown.emi.toLocaleString("en-IN")}, Bills: ₹${profile.cashFlow.breakdown.bills.toLocaleString("en-IN")}, Expenses: ₹${profile.cashFlow.breakdown.expenses.toLocaleString("en-IN")}, SIPs: ₹${profile.cashFlow.breakdown.sips.toLocaleString("en-IN")})`,
    `  Surplus: ₹${profile.cashFlow.monthlySurplus.toLocaleString("en-IN")} (${profile.cashFlow.surplusPct}%)${profile.cashFlow.isNegative ? " ⚠️ NEGATIVE" : ""}`,
    ``,
    `Risk:`,
    `  DTI: ${profile.risk.dti}% (${profile.risk.dtiStatus})`,
    `  Insurance gap: ₹${profile.risk.insuranceGap.toLocaleString("en-IN")} ${profile.risk.insuranceAdequate ? "✓" : "⚠️"}`,
    `  Concentration risk: ${profile.risk.concentrationRisk ? "YES ⚠️" : "no"}`,
    ``,
    `Upcoming (30 days): ${profile.upcoming.length} commitments`,
    ...profile.upcoming.slice(0, 5).map(u => `  - ${u.label}: ₹${Number(u.amount || 0).toLocaleString("en-IN")} due ${u.due}`),
    ``,
    `Goals: ${profile.goals.length} active`,
    ...profile.goals.slice(0, 5).map(g => `  - ${g.name}: ${g.pct}% (shortfall ₹${g.shortfall.toLocaleString("en-IN")})`),
    ``,
    `Health Score: ${profile.healthScore}/100`,
    `=== END PROFILE ===\n`,
  ];
  return lines.join("\n");
}