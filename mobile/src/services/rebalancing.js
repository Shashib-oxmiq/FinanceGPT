// ── Portfolio Rebalancing Service (F-219) ─────────────────────────────────────
// Analyzes investment portfolio allocation and suggests rebalancing.

import { api } from "./api";

const ASSET_CLASSES = {
  stock: { label: "Equity (Stocks)", category: "equity", risk: "high", recommended_pct: { aggressive: 70, moderate: 55, conservative: 30 } },
  etf: { label: "ETF (Index/Factor)", category: "equity", risk: "medium", recommended_pct: { aggressive: 15, moderate: 15, conservative: 10 } },
  mutual_fund: { label: "Mutual Funds", category: "equity", risk: "medium", recommended_pct: { aggressive: 10, moderate: 15, conservative: 10 } },
  bond: { label: "Bonds/Debt", category: "debt", risk: "low", recommended_pct: { aggressive: 5, moderate: 15, conservative: 30 } },
  fd: { label: "Fixed Deposit", category: "debt", risk: "low", recommended_pct: { aggressive: 5, moderate: 10, conservative: 25 } },
  gold: { label: "Gold (SGB/Physical)", category: "gold", risk: "medium", recommended_pct: { aggressive: 10, moderate: 10, conservative: 10 } },
  crypto: { label: "Crypto", category: "alternative", risk: "very_high", recommended_pct: { aggressive: 5, moderate: 3, conservative: 0 } },
  real_estate: { label: "Real Estate (REIT)", category: "real_estate", risk: "medium", recommended_pct: { aggressive: 10, moderate: 7, conservative: 5 } },
  ppf: { label: "PPF", category: "debt", risk: "low", recommended_pct: { aggressive: 3, moderate: 5, conservative: 10 } },
  nps: { label: "NPS", category: "debt", risk: "low", recommended_pct: { aggressive: 5, moderate: 8, conservative: 10 } },
  epf: { label: "EPF", category: "debt", risk: "low", recommended_pct: { aggressive: 3, moderate: 5, conservative: 10 } },
  other: { label: "Other", category: "other", risk: "medium", recommended_pct: { aggressive: 5, moderate: 5, conservative: 5 } },
};

export async function analyzePortfolio(userId, riskProfile = "moderate") {
  let investments = [];
  try { investments = await api.getInvestments(userId); } catch { /* */ }

  if (investments.length === 0) {
    return { totalValue: 0, allocation: {}, suggestions: [], riskProfile };
  }

  const totalValue = investments.reduce((s, i) => s + (Number(i.current_value) || 0), 0);

  // Calculate current allocation by asset class
  const byClass = {};
  const byType = {};
  for (const inv of investments) {
    const type = (inv.asset_type || "other").toLowerCase();
    const value = Number(inv.current_value) || 0;
    const assetInfo = ASSET_CLASSES[type] || ASSET_CLASSES.other;
    const cls = assetInfo.category;

    byClass[cls] = (byClass[cls] || 0) + value;
    byType[type] = (byType[type] || 0) + value;
  }

  // Convert to percentages
  const allocation = {};
  for (const [cls, val] of Object.entries(byClass)) {
    allocation[cls] = { value: val, pct: Math.round((val / totalValue) * 100) };
  }

  const typeAllocation = {};
  for (const [type, val] of Object.entries(byType)) {
    typeAllocation[type] = { value: val, pct: Math.round((val / totalValue) * 100), label: ASSET_CLASSES[type]?.label || type };
  }

  // Recommended allocation
  const recommended = {};
  for (const [type, info] of Object.entries(ASSET_CLASSES)) {
    const recPct = info.recommended_pct[riskProfile] || 0;
    if (recPct > 0) {
      const cls = info.category;
      if (!recommended[cls]) recommended[cls] = 0;
      recommended[cls] += recPct;
    }
  }

  // Generate suggestions
  const suggestions = [];
  const equityPct = allocation.equity?.pct || 0;
  const debtPct = allocation.debt?.pct || 0;
  const goldPct = allocation.gold?.pct || 0;
  const cryptoPct = allocation.alternative?.pct || 0;

  const recEquity = recommended.equity || 0;
  const recDebt = recommended.debt || 0;
  const recGold = recommended.gold || 0;

  // Equity over/under weight
  if (equityPct > recEquity + 10) {
    const excessValue = Math.round(totalValue * (equityPct - recEquity) / 100);
    suggestions.push({
      type: "overweight_equity",
      severity: "high",
      title: "Overweight in Equity",
      current: equityPct,
      recommended: recEquity,
      excessValue,
      message: `Equity is ${equityPct}% of your portfolio (recommended: ${recEquity}%). Consider rebalancing ₹${excessValue.toLocaleString('en-IN')} from equity to debt/gold.`,
      action: `Sell some equity holdings or redirect new investments to PPF/NPS/Bonds to bring equity down to ${recEquity}%.`,
    });
  } else if (equityPct < recEquity - 10 && equityPct > 0) {
    const shortfallValue = Math.round(totalValue * (recEquity - equityPct) / 100);
    suggestions.push({
      type: "underweight_equity",
      severity: "medium",
      title: "Underweight in Equity",
      current: equityPct,
      recommended: recEquity,
      shortfallValue,
      message: `Equity is only ${equityPct}% of your portfolio (recommended: ${recEquity}%). You're missing growth potential.`,
      action: `Increase equity allocation by investing ₹${shortfallValue.toLocaleString('en-IN')} in index funds/ETFs.`,
    });
  }

  // Gold allocation
  if (goldPct > recGold + 5) {
    suggestions.push({
      type: "overweight_gold",
      severity: "low",
      title: "High Gold Allocation",
      current: goldPct,
      recommended: recGold,
      message: `Gold is ${goldPct}% (recommended: ${recGold}%). Gold is a hedge, not a growth asset. Consider trimming.`,
      action: "Gold should be 5-10% of portfolio for hedging. Excess gold reduces long-term returns.",
    });
  } else if (goldPct === 0 && totalValue > 100000) {
    suggestions.push({
      type: "no_gold",
      severity: "low",
      title: "No Gold in Portfolio",
      current: 0,
      recommended: recGold,
      message: "You have no gold allocation. Gold provides inflation protection and reduces portfolio volatility.",
      action: "Consider 5-10% in Sovereign Gold Bonds (SGB) — tax-free and 2.5% annual interest.",
    });
  }

  // Crypto warning
  if (cryptoPct > 5) {
    suggestions.push({
      type: "high_crypto",
      severity: "high",
      title: "High Crypto Allocation",
      current: cryptoPct,
      recommended: riskProfile === "aggressive" ? 5 : 0,
      message: `Crypto is ${cryptoPct}% of your portfolio. Crypto is extremely volatile — consider limiting to 5% max.`,
      action: "Reduce crypto exposure to protect against extreme drawdowns. Crypto can lose 50%+ in weeks.",
    });
  }

  // Concentration risk — single investment > 25%
  for (const [type, info] of Object.entries(typeAllocation)) {
    if (info.pct > 25) {
      suggestions.push({
        type: "concentration",
        severity: "high",
        title: `Concentration in ${info.label}`,
        current: info.pct,
        recommended: 25,
        message: `${info.label} is ${info.pct}% of your portfolio. Over-concentration in one asset increases risk.`,
        action: `Diversify — no single asset type should exceed 25% of portfolio. Consider reducing or adding other asset classes.`,
      });
    }
  }

  // No debt at all
  if (debtPct === 0 && totalValue > 200000) {
    suggestions.push({
      type: "no_debt",
      severity: "medium",
      title: "No Debt Allocation",
      current: 0,
      recommended: recDebt,
      message: "Your portfolio has no debt allocation. Debt provides stability during market crashes.",
      action: "Add 10-15% in PPF, NPS, or debt mutual funds for portfolio stability.",
    });
  }

  // Sort by severity
  const sevOrder = { high: 0, medium: 1, low: 2 };
  suggestions.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);

  return {
    totalValue,
    allocation,
    typeAllocation,
    recommended,
    suggestions,
    riskProfile,
    investmentCount: investments.length,
  };
}

export function getRiskProfiles() {
  return [
    { key: "conservative", label: "Conservative", description: "Capital preservation. 30% equity, 60% debt, 10% gold. Suitable for age 50+ or risk-averse." },
    { key: "moderate", label: "Moderate (Recommended)", description: "Balanced growth. 55-70% equity, 15-25% debt, 10% gold. Suitable for most investors age 25-50." },
    { key: "aggressive", label: "Aggressive", description: "Maximum growth. 70-85% equity, 5-15% debt, 10% gold. Suitable for age < 35 with high risk tolerance." },
  ];
}