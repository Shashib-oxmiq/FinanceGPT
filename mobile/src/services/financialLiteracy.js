/**
 * F-226: Adaptive Financial Literacy
 * Identifies knowledge gaps based on user's actions and teaches proactively.
 * Uses simple analogies and 3-sentence explanations tailored to the user's level.
 */

import { buildFinancialProfile } from "./financialProfile";
import { generateInsights } from "./insightEngine";

const LESSONS = {
  term_insurance: {
    trigger: "no_term_insurance",
    title: "Why term insurance is your first financial need",
    level: "beginner",
    analogy: "Term insurance is like a helmet. You don't wear it because you expect to crash — you wear it because the cost of not wearing it is catastrophic. It's the cheapest way to protect your family.",
    keyPoints: [
      "Term insurance pays your family a lump sum if you die during the policy term.",
      "Unlike ULIP/endowment, it doesn't give money back if you survive — that's why it's 10x cheaper.",
      "Buy ₹1 crore cover for ~₹600-1500/month (age 30, non-smoker).",
      "Buy before health issues develop — premiums rise with age and health conditions.",
    ],
    actionPrompt: "Would you like me to help you compare term insurance plans?",
  },
  inflation: {
    trigger: "all_fd",
    title: "Your savings are losing to inflation",
    level: "beginner",
    analogy: "Inflation is like a slow leak in a balloon. Your ₹100 today buys ₹92 next year. In 10 years, it buys ₹44. If your money grows at 4% (FD) but inflation is 6%, you're losing 2% every year.",
    keyPoints: [
      "FD returns ~4-6% after tax. Inflation averages 6% in India.",
      "Equity mutual funds average 10-12% long-term (with ups and downs).",
      "You don't need to invest everything in equity — even 30% equity, 70% FD beats 100% FD over 10 years.",
      "Start with a simple index fund (Nifty 50). ₹500/month is enough to begin.",
    ],
    actionPrompt: "Want me to explain how to start a SIP in a Nifty 50 index fund?",
  },
  emergency_fund: {
    trigger: "low_savings",
    title: "The emergency fund: your financial airbag",
    level: "beginner",
    analogy: "An emergency fund is like an airbag. You hope you never need it, but when you do, it saves you from disaster. Without it, a medical emergency or job loss forces you to take expensive loans.",
    keyPoints: [
      "Keep 6 months of expenses in a separate, easily accessible account.",
      "Use a savings account or liquid mutual fund — NOT fixed deposit (you'll need it fast).",
      "Don't invest your emergency fund in stocks — it can drop 30% when you need it most.",
      "Build it gradually: save 10% of income for 12 months.",
    ],
    actionPrompt: "Shall I help you set up an emergency fund goal?",
  },
  compound_interest: {
    trigger: "not_investing",
    title: "The magic of compound interest",
    level: "beginner",
    analogy: "Compound interest is like a snowball rolling down a hill. It starts small, but the longer it rolls, the bigger it gets — exponentially. ₹5000/month at 10% becomes ₹1.14 crore in 30 years, but only ₹38 lakh in 20 years. Those extra 10 years more than double your money.",
    keyPoints: [
      "Start NOW. ₹5000/month at 10% for 30 years = ₹1.14 crore. Starting 5 years late = only ₹68 lakh.",
      "Time matters more than amount. ₹2000/month for 35 years beats ₹10000/month for 15 years.",
      "Don't stop during market crashes — that's when investments are on sale.",
      "Use SIP (Systematic Investment Plan) — auto-debit monthly so you don't forget.",
    ],
    actionPrompt: "Want to start a SIP with just ₹500/month?",
  },
  tax_regimes: {
    trigger: "tax_filing",
    title: "Old vs New tax regime — which saves you more?",
    level: "intermediate",
    analogy: "Think of the old regime as a discount coupon — you have to spend on specific things (insurance, PPF, home loan) to get the discount. The new regime is a flat low price — no coupons needed, but no discounts either.",
    keyPoints: [
      "New regime: lower tax rates, but no deductions (except standard ₹50K).",
      "Old regime: higher rates, but 80C (₹1.5L), 80D (₹25-50K), HRA, home loan interest.",
      "If your deductions < ₹3-4L, new regime is usually better.",
      "You can switch regimes each year (for salary income).",
    ],
    actionPrompt: "Want me to calculate which regime is better for your income?",
  },
  asset_allocation: {
    trigger: "concentrated_portfolio",
    title: "Don't put all eggs in one basket",
    level: "intermediate",
    analogy: "Asset allocation is like a balanced diet. Eating only protein (equity) gives growth but risks health. Only carbs (FD) gives stability but makes you sluggish. You need a mix: protein, carbs, fats, vitamins (equity, debt, gold, international).",
    keyPoints: [
      "100% equity is risky — you could lose 40% in a crash.",
      "100% FD loses to inflation — guaranteed slow loss.",
      "A 60/30/10 split (equity/debt/gold) balances growth and safety.",
      "Rebalance yearly: if equity grew to 70%, sell some, buy debt. Buy low, sell high automatically.",
    ],
    actionPrompt: "Want me to analyze your current allocation and suggest rebalancing?",
  },
  credit_score: {
    trigger: "high_dti",
    title: "Your credit score affects everything",
    level: "intermediate",
    analogy: "A credit score is like a financial reputation. A good one (750+) opens doors — lower loan rates, higher limits, faster approvals. A bad one (<650) makes everything expensive or impossible.",
    keyPoints: [
      "Pay EMIs and credit card bills before the due date — every time.",
      "Don't use more than 30% of your credit card limit.",
      "Don't apply for multiple loans/cards in a short period.",
      "Check your score free at CIBIL once a year.",
    ],
    actionPrompt: "Want me to help you make a plan to improve your credit score?",
  },
  diversification: {
    trigger: "single_stock",
    title: "Why diversification matters",
    level: "intermediate",
    analogy: "Diversification is like having multiple income sources. If you have only one job and lose it, you're in trouble. But if you have a job, a side business, and rental income, losing one doesn't hurt as much.",
    keyPoints: [
      "Don't put more than 10% of investments in any single stock.",
      "Index funds (Nifty 50, S&P 500) give instant diversification with one investment.",
      "Add international exposure — India is only 3% of world market cap.",
      "Different asset classes (equity, debt, gold) don't all fall at the same time.",
    ],
    actionPrompt: "Want me to suggest a simple 3-fund portfolio for you?",
  },
  "power_of_attorney": {
    trigger: "no_will",
    title: "Why you need a Will and Nominee",
    level: "intermediate",
    analogy: "A Will is like leaving clear directions for your family after you're gone. Without it, they'll navigate a legal maze — court fees, delays, family disputes. With it, everything transfers smoothly.",
    keyPoints: [
      "Make a Will even if you're young — accidents happen.",
      "Nominate family members on all bank accounts, investments, insurance, PF.",
      "Register the Will (optional but stronger legally).",
      "Update it when life changes: marriage, children, property purchase.",
    ],
    actionPrompt: "Want me to help you create a basic Will document?",
  },
};

/**
 * Identify which lessons the user needs based on their financial profile.
 */
export async function identifyKnowledgeGaps(userId, investments = [], insurance = []) {
  try {
    const profile = await buildFinancialProfile(userId, investments, insurance);
    if (!profile) return [];

    const gaps = [];
    const insights = await generateInsights(userId, investments, insurance);

    // No term insurance
    const hasTerm = insurance.some(i => i.policy_type?.toLowerCase().includes("term"));
    if (!hasTerm) gaps.push(LESSONS.term_insurance);

    // All money in FD/low-return
    const totalInv = profile.netWorth.breakdown.investments;
    const fdAmount = investments.filter(i => i.asset_type === "bond" || i.asset_type === "other").reduce((s, i) => s + Number(i.amount_invested || 0), 0);
    if (totalInv > 0 && fdAmount / totalInv > 0.8) gaps.push(LESSONS.inflation);

    // Low savings / no emergency fund
    if (profile.netWorth.breakdown.investments < profile.cashFlow.monthlyIncome * 3) gaps.push(LESSONS.emergency_fund);

    // Not investing at all
    if (totalInv === 0 && profile.cashFlow.monthlySurplus > 2000) gaps.push(LESSONS.compound_interest);

    // Tax filing (if income > 5L and no tax records)
    if (profile.cashFlow.monthlyIncome > 40000) gaps.push(LESSONS.tax_regimes);

    // Concentrated portfolio
    if (profile.risk.concentrationRisk) gaps.push(LESSONS.asset_allocation);

    // High DTI
    if (profile.risk.dti >= 40) gaps.push(LESSONS.credit_score);

    // Single stock concentration
    if (investments.length === 1 && investments[0].asset_type === "stock") gaps.push(LESSONS.diversification);

    // No Will (we can't directly check, but if user has significant assets)
    if (profile.netWorth.netWorth > 2000000) gaps.push(LESSONS.power_of_attorney);

    return gaps;
  } catch (e) {
    console.error("Literacy gap error:", e);
    return [];
  }
}

/**
 * Get the most relevant lesson for the user's current situation.
 */
export async function getNextLesson(userId, investments = [], insurance = []) {
  const gaps = await identifyKnowledgeGaps(userId, investments, insurance);
  if (gaps.length === 0) return null;
  return gaps[0]; // Return highest-priority gap
}

/**
 * Format a lesson for AI prompt injection.
 */
export function formatLessonForPrompt(lesson) {
  if (!lesson) return "";
  return [
    `\n=== FINANCIAL LITERACY OPPORTUNITY ===`,
    `The user may benefit from this lesson: "${lesson.title}"`,
    `Level: ${lesson.level}`,
    `Analogy: ${lesson.analogy}`,
    `Key points:`,
    ...lesson.keyPoints.map(p => `  - ${p}`),
    `Suggested action: ${lesson.actionPrompt}`,
    `Use this naturally in conversation when relevant. Don't lecture — teach through the user's questions.`,
    `=== END LESSON ===\n`,
  ].join("\n");
}

/**
 * Format all gaps for prompt (shorter version — just titles).
 */
export function formatGapsForPrompt(gaps) {
  if (!gaps || gaps.length === 0) return "";
  return `\n=== KNOWLEDGE GAPS DETECTED ===\n${gaps.map((g, i) => `${i + 1}. ${g.title} (${g.level})`).join("\n")}\n=== END GAPS ===\n`;
}