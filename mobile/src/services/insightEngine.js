/**
 * F-221: Cross-Feature Intelligence Layer
 * Scans all user data and generates cross-feature observations and insights.
 * Finds connections between siloed features that a human advisor would catch.
 */

import { buildFinancialProfile } from "./financialProfile";

/**
 * Generate cross-feature insights by analyzing the unified profile.
 * Returns ranked list of insights by urgency and impact.
 */
export async function generateInsights(userId, investments = [], insurance = []) {
  try {
    const profile = await buildFinancialProfile(userId, investments, insurance);
    if (!profile) return [];

    const insights = [];

    // ── Cash flow negative ──
    if (profile.cashFlow.isNegative) {
      insights.push({
        id: "negative_cashflow",
        severity: "critical",
        title: "Monthly cash flow is negative",
        detail: `Your monthly outflow (₹${profile.cashFlow.totalOutflow.toLocaleString("en-IN")}) exceeds income by ₹${Math.abs(profile.cashFlow.monthlySurplus).toLocaleString("en-IN")}. Largest outflow: ${getLargestOutflow(profile.cashFlow.breakdown)}.`,
        action: "Review your largest expense category and consider trimming EMI burden or reducing discretionary spending.",
        category: "cashflow",
      });
    }

    // ── High DTI with investments in low-return instruments ──
    if (profile.risk.dti >= 40) {
      const lowReturnInv = investments.filter(i => (i.asset_type === "bond" || i.asset_type === "other") && (Number(i.amount_invested) || 0) > 50000);
      if (lowReturnInv.length > 0) {
        const totalLowReturn = lowReturnInv.reduce((s, i) => s + Number(i.amount_invested || 0), 0);
        insights.push({
          id: "dti_low_return",
          severity: "high",
          title: "High debt but money in low-return investments",
          detail: `Your DTI is ${profile.risk.dti}% but you have ₹${totalLowReturn.toLocaleString("en-IN")} in bonds/FDs earning ~4-6%. Your loans likely cost 10-14%.`,
          action: `Consider prepaying high-interest loans with ₹${totalLowReturn.toLocaleString("en-IN")} from low-return investments. Save ~₹${Math.round(totalLowReturn * 0.08).toLocaleString("en-IN")}/year in interest.`,
          category: "debt",
        });
      }
    }

    // ── Insurance gap ──
    if (profile.risk.insuranceGap > 0 && profile.risk.insuranceGap < 10000000) {
      insights.push({
        id: "insurance_gap",
        severity: "high",
        title: "Underinsured — family at risk",
        detail: `You need ~₹${(50000 * 120).toLocaleString("en-IN")} life cover (10x annual income). Current coverage: ₹${profile.risk.insuranceCoverage.toLocaleString("en-IN")}. Gap: ₹${profile.risk.insuranceGap.toLocaleString("en-IN")}.`,
        action: "Buy a term insurance plan to cover the gap. A ₹1 crore term plan costs ~₹600-1500/month.",
        category: "insurance",
      });
    }

    // ── Goal shortfalls ──
    profile.goals.forEach(g => {
      if (g.shortfall > 0 && g.pct < 50) {
        insights.push({
          id: `goal_shortfall_${g.name}`,
          severity: "medium",
          title: `Goal "${g.name}" is ${g.pct}% funded`,
          detail: `Target: ₹${g.target.toLocaleString("en-IN")}, Current: ₹${g.current.toLocaleString("en-IN")}, Shortfall: ₹${g.shortfall.toLocaleString("en-IN")}.`,
          action: `Increase monthly SIP by ₹${Math.ceil(g.shortfall / 60).toLocaleString("en-IN")} to close the gap in 5 years.`,
          category: "goals",
        });
      }
    });

    // ── Education shortfall ──
    profile.education.forEach(e => {
      if (e.shortfall > 0 && e.pct < 40) {
        insights.push({
          id: `edu_shortfall_${e.name}`,
          severity: "medium",
          title: `Education plan for ${e.name} needs attention`,
          detail: `Only ${e.pct}% funded. Shortfall: ₹${e.shortfall.toLocaleString("en-IN")}.`,
          action: "Consider education loan (Section 80E tax benefit on interest) or increase monthly contribution.",
          category: "education",
        });
      }
    });

    // ── Retirement shortfall ──
    if (profile.retirement) {
      const r = profile.retirement;
      const shortfall = r.corpusNeeded - r.projectedFromSources;
      if (shortfall > 0) {
        insights.push({
          id: "retirement_shortfall",
          severity: r.yearsToRetire < 10 ? "high" : "medium",
          title: `Retirement corpus shortfall: ₹${shortfall.toLocaleString("en-IN")}`,
          detail: `Need ₹${r.corpusNeeded.toLocaleString("en-IN")} in ${r.yearsToRetire} years. Projected: ₹${Math.round(r.projectedFromSources).toLocaleString("en-IN")}.`,
          action: `Add ₹${Math.ceil(shortfall / (r.yearsToRetire * 12)).toLocaleString("en-IN")}/month to NPS (extra 50K deduction under 80CCD1B).`,
          category: "retirement",
        });
      }
    }

    // ── Concentration risk ──
    if (profile.risk.concentrationRisk) {
      insights.push({
        id: "concentration_risk",
        severity: "medium",
        title: "Portfolio concentration risk detected",
        detail: "One or more positions dominate your portfolio. Diversification reduces risk.",
        action: "Rebalance: trim overweight positions and add to underweight sectors. Use index funds for broad exposure.",
        category: "investments",
      });
    }

    // ── Upcoming commitments alert ──
    if (profile.upcoming.length >= 3) {
      const totalDue = profile.upcoming.reduce((s, u) => s + Number(u.amount || 0), 0);
      insights.push({
        id: "upcoming_cluster",
        severity: "medium",
        title: `${profile.upcoming.length} payments due in 30 days (₹${totalDue.toLocaleString("en-IN")})`,
        detail: profile.upcoming.map(u => `${u.label}: ₹${Number(u.amount||0).toLocaleString("en-IN")} on ${u.due}`).join("; "),
        action: "Ensure sufficient balance. Consider setting up auto-pay for recurring bills.",
        category: "cashflow",
      });
    }

    // ── Positive insight: surplus available ──
    if (profile.cashFlow.monthlySurplus > 10000 && !profile.cashFlow.isNegative) {
      insights.push({
        id: "surplus_available",
        severity: "info",
        title: `₹${profile.cashFlow.monthlySurplus.toLocaleString("en-IN")}/month surplus available`,
        detail: `You have surplus cash flow. Direct it toward your highest-priority shortfall.`,
        action: getSurplusRecommendation(profile),
        category: "investments",
      });
    }

    // ── Health score trend ──
    if (profile.healthScore < 50) {
      insights.push({
        id: "low_health_score",
        severity: "high",
        title: `Financial health score is ${profile.healthScore}/100`,
        detail: "Your financial health needs attention across multiple dimensions.",
        action: "Focus on: 1) Emergency fund (6 months expenses), 2) Term insurance, 3) Debt reduction, 4) Start SIP.",
        category: "overview",
      });
    }

    // Sort by severity: critical > high > medium > info
    const sevOrder = { critical: 0, high: 1, medium: 2, info: 3 };
    insights.sort((a, b) => (sevOrder[a.severity] || 9) - (sevOrder[b.severity] || 9));

    return insights;
  } catch (e) {
    console.error("Insight generation error:", e);
    return [];
  }
}

function getLargestOutflow(breakdown) {
  const entries = Object.entries(breakdown).filter(([k, v]) => v > 0);
  if (entries.length === 0) return "none";
  entries.sort((a, b) => b[1] - a[1]);
  return `${entries[0][0]} (₹${entries[0][1].toLocaleString("en-IN")})`;
}

function getSurplusRecommendation(profile) {
  if (profile.goals.some(g => g.shortfall > 0)) {
    const goal = profile.goals.find(g => g.shortfall > 0);
    return `Direct surplus to goal "${goal.name}" — shortfall is ₹${goal.shortfall.toLocaleString("en-IN")}.`;
  }
  if (profile.retirement && profile.retirement.corpusNeeded > profile.retirement.projectedFromSources) {
    return "Increase NPS contribution — retirement has a shortfall.";
  }
  if (profile.risk.insuranceGap > 0) {
    return "First buy term insurance (₹500-1500/month), then invest surplus in index funds.";
  }
  return "Invest surplus in a diversified equity index fund via monthly SIP. Build emergency fund first (6 months expenses).";
}

/**
 * Format insights for AI system prompt injection.
 */
export function formatInsightsForPrompt(insights) {
  if (!insights || insights.length === 0) return "";
  const lines = [
    `\n=== ACTIVE INSIGHTS (cross-feature) ===`,
    ...insights.slice(0, 5).map((i, idx) =>
      `[${idx + 1}] (${i.severity}) ${i.title}\n    Detail: ${i.detail}\n    Action: ${i.action}`
    ),
    `=== END INSIGHTS ===\n`,
  ];
  return lines.join("\n");
}