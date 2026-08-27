/**
 * F-222: Life Scenario Simulator
 * Lets users ask "what if I buy a house / take a loan / have a child?"
 * and see the full financial impact across all their data.
 */

import { buildFinancialProfile } from "./financialProfile";

/**
 * Simulate a life scenario and return the projected impact.
 * @param {string} userId
 * @param {object} scenario - { type: "buy_house"|"take_loan"|"have_child"|"job_change"|"major_expense", ...params }
 */
export async function simulateScenario(userId, scenario, investments = [], insurance = []) {
  try {
    const profile = await buildFinancialProfile(userId, investments, insurance);
    if (!profile) return null;

    switch (scenario.type) {
      case "buy_house":
        return simulateBuyHouse(profile, scenario);
      case "take_loan":
        return simulateTakeLoan(profile, scenario);
      case "have_child":
        return simulateHaveChild(profile, scenario);
      case "job_change":
        return simulateJobChange(profile, scenario);
      case "major_expense":
        return simulateMajorExpense(profile, scenario);
      default:
        return { error: "Unknown scenario type" };
    }
  } catch (e) {
    console.error("Scenario simulation error:", e);
    return null;
  }
}

function simulateBuyHouse(profile, s) {
  const price = s.price || 8000000;
  const downPaymentPct = s.downPaymentPct || 20;
  const downPayment = price * (downPaymentPct / 100);
  const loanAmount = price - downPayment;
  const rate = s.interestRate || 8.5;
  const tenure = s.tenureYears || 20;
  const emi = calculateEMI(loanAmount, rate, tenure * 12);
  const newDTI = profile.cashFlow.monthlyIncome > 0
    ? Math.round(((profile.cashFlow.breakdown.emi + emi) / profile.cashFlow.monthlyIncome) * 100)
    : 0;
  const newSurplus = profile.cashFlow.monthlySurplus - emi;
  const liquidSavings = profile.netWorth.breakdown.investments;
  const downPaymentPctOfSavings = liquidSavings > 0 ? Math.round((downPayment / liquidSavings) * 100) : 0;

  return {
    type: "buy_house",
    title: `Buy ₹${price.toLocaleString("en-IN")} house`,
    assumptions: { price, downPayment, loanAmount, rate, tenure: `${tenure} years`, emi },
    impact: {
      newEMI: emi,
      newDTI,
      dtiStatus: newDTI >= 50 ? "critical" : newDTI >= 40 ? "risky" : "healthy",
      newSurplus,
      surplusNegative: newSurplus < 0,
      downPaymentPctOfSavings,
      liquidAfterDownPayment: liquidSavings - downPayment,
      netWorthChange: price - loanAmount, // Asset added, debt added
    },
    tax: {
      deduction80C: Math.min(150000, emi * 12 * 0.2), // Principal portion approx 20%
      deductionInterest: Math.min(200000, emi * 12 * 0.8), // Interest portion approx 80%
      totalTaxSaving: 0, // Will depend on tax bracket
    },
    warnings: [
      newDTI >= 50 ? "DTI will exceed 50% — critical risk" : null,
      downPaymentPctOfSavings > 80 ? "Down payment drains 80%+ of liquid savings" : null,
      newSurplus < 0 ? "Monthly surplus goes negative" : null,
    ].filter(Boolean),
    recommendation: generateHouseRecommendation(newDTI, downPaymentPctOfSavings, newSurplus),
  };
}

function simulateTakeLoan(profile, s) {
  const principal = s.principal || 500000;
  const rate = s.interestRate || 12;
  const tenureMonths = s.tenureMonths || 36;
  const emi = calculateEMI(principal, rate, tenureMonths);
  const newDTI = profile.cashFlow.monthlyIncome > 0
    ? Math.round(((profile.cashFlow.breakdown.emi + emi) / profile.cashFlow.monthlyIncome) * 100)
    : 0;
  const newSurplus = profile.cashFlow.monthlySurplus - emi;
  const totalInterest = emi * tenureMonths - principal;

  return {
    type: "take_loan",
    title: `Take ₹${principal.toLocaleString("en-IN")} loan at ${rate}%`,
    assumptions: { principal, rate, tenureMonths, emi },
    impact: {
      newEMI: emi,
      newDTI,
      dtiStatus: newDTI >= 50 ? "critical" : newDTI >= 40 ? "risky" : "healthy",
      newSurplus,
      surplusNegative: newSurplus < 0,
      totalInterest,
      totalRepayment: emi * tenureMonths,
    },
    warnings: [
      newDTI >= 50 ? "DTI will exceed 50% — critical" : null,
      newSurplus < 0 ? "Cash flow goes negative" : null,
      rate > 14 ? "Interest rate very high — consider alternatives" : null,
    ].filter(Boolean),
    recommendation: rate > 12
      ? "Interest rate is high. Consider: 1) Loan against FD (lower rate), 2) Loan against securities, 3) Top-up on existing home loan."
      : newDTI >= 50
      ? "This loan will push DTI to critical levels. Avoid or prepay existing debt first."
      : "Loan is affordable but ensure you maintain emergency fund.",
  };
}

function simulateHaveChild(profile, s) {
  const extraMonthlyCost = s.monthlyCost || 15000;
  const educationFund = s.educationFund || 5000000;
  const yearsToCollege = s.yearsToCollege || 15;
  const monthlySIPForEducation = calculateSIP(educationFund, yearsToCollege, 10);
  const newSurplus = profile.cashFlow.monthlySurplus - extraMonthlyCost - monthlySIPForEducation;

  return {
    type: "have_child",
    title: "Have a child — financial impact",
    impact: {
      extraMonthlyCost,
      educationSIP: monthlySIPForEducation,
      totalNewMonthly: extraMonthlyCost + monthlySIPForEducation,
      newSurplus,
      surplusNegative: newSurplus < 0,
      educationCorpusNeeded: educationFund,
      yearsToCollege,
    },
    timeline: [
      { year: 0, event: "Birth — hospital costs ₹30K-80K", cost: 50000 },
      { year: 1, event: "Daycare/nanny ₹8K-15K/month", cost: 120000 },
      { year: 3, event: "School admission ₹50K-2L", cost: 100000 },
      { year: 6, event: "School fees ₹60K-1.5L/year", cost: 100000 },
      { year: yearsToCollege, event: `College ₹${educationFund.toLocaleString("en-IN")}`, cost: educationFund },
    ],
    warnings: [
      newSurplus < 0 ? `Monthly surplus goes negative by ₹${Math.abs(newSurplus).toLocaleString("en-IN")}` : null,
    ].filter(Boolean),
    recommendation: newSurplus < 0
      ? `Start saving ₹${(extraMonthlyCost + monthlySIPForEducation).toLocaleString("en-IN")}/month before the child arrives. Consider term insurance for family protection.`
      : `You can afford this. Start education SIP of ₹${Math.round(monthlySIPForEducation).toLocaleString("en-IN")}/month now. Buy term insurance (₹1 crore).`,
  };
}

function simulateJobChange(profile, s) {
  const newSalary = s.newSalary || 60000;
  const oldSalary = profile.cashFlow.monthlyIncome;
  const changePct = oldSalary > 0 ? Math.round(((newSalary - oldSalary) / oldSalary) * 100) : 0;
  const newSurplus = profile.cashFlow.monthlySurplus + (newSalary - oldSalary);
  const newDTI = newSalary > 0 ? Math.round((profile.cashFlow.breakdown.emi / newSalary) * 100) : 0;

  return {
    type: "job_change",
    title: `Salary change: ₹${oldSalary.toLocaleString("en-IN")} → ₹${newSalary.toLocaleString("en-IN")}`,
    impact: {
      salaryChange: newSalary - oldSalary,
      changePct,
      newSurplus,
      newDTI,
      newSavingsCapacity: newSurplus,
    },
    suggestions: [
      newSalary > oldSalary ? `Redirect ₹${(newSalary - oldSalary).toLocaleString("en-IN")} increase to retirement (NPS) for 80CCD1B benefit.` : null,
      "Update your term insurance coverage to match new income (10x salary).",
      newSalary > oldSalary ? "Increase SIP proportionally — don't inflate lifestyle immediately." : "Review budget — your income decreased.",
    ].filter(Boolean),
    recommendation: newSalary > oldSalary
      ? "Great move! Direct at least 50% of the salary increase to investments before lifestyle inflation. Increase term insurance."
      : "Income decreased. Cut discretionary spending, preserve emergency fund, and review EMI obligations.",
  };
}

function simulateMajorExpense(profile, s) {
  const amount = s.amount || 200000;
  const isFromSavings = s.fromSavings !== false;
  const newLiquid = profile.netWorth.breakdown.investments - (isFromSavings ? amount : 0);
  const newEMI = isFromSavings ? 0 : calculateEMI(amount, 12, 24);
  const newSurplus = profile.cashFlow.monthlySurplus - (isFromSavings ? 0 : newEMI);

  return {
    type: "major_expense",
    title: `Major expense: ₹${amount.toLocaleString("en-IN")}`,
    impact: {
      amount,
      fromSavings: isFromSavings,
      newLiquidSavings: newLiquid,
      liquidPctRemaining: profile.netWorth.breakdown.investments > 0 ? Math.round((newLiquid / profile.netWorth.breakdown.investments) * 100) : 0,
      newEMI: isFromSavings ? 0 : newEMI,
      newSurplus,
    },
    warnings: [
      isFromSavings && newLiquid < 100000 ? "This will leave less than ₹1L in liquid savings — risky" : null,
      !isFromSavings && newSurplus < 0 ? "EMI will make cash flow negative" : null,
    ].filter(Boolean),
    recommendation: isFromSavings
      ? newLiquid < 100000
        ? "Avoid — this drains your emergency fund. Save for 3-6 more months first."
        : "Affordable from savings. Replenish your emergency fund over the next 6 months."
      : newSurplus < 0
      ? "EMI will strain cash flow. Consider saving upfront instead of financing."
      : "EMI is manageable. Ensure you have emergency fund coverage.",
  };
}

// ── Utilities ──

function calculateEMI(principal, annualRate, months) {
  const r = annualRate / 12 / 100;
  if (r === 0) return Math.round(principal / months);
  return Math.round(principal * r * Math.pow(1 + r, months) / (Math.pow(1 + r, months) - 1));
}

function calculateSIP(target, years, annualReturn) {
  const r = annualReturn / 12 / 100;
  const n = years * 12;
  if (r === 0) return Math.round(target / n);
  return Math.round(target * r / (Math.pow(1 + r, n) - 1));
}

/**
 * Format scenario result for AI chat display.
 */
export function formatScenarioResult(result) {
  if (!result || result.error) return result?.error || "Could not simulate.";
  const lines = [
    `📊 ${result.title}`,
    "",
    result.assumptions ? "Assumptions:" : "",
    ...Object.entries(result.assumptions || {}).map(([k, v]) => `  ${k}: ${typeof v === "number" ? "₹" + v.toLocaleString("en-IN") : v}`),
    "",
    "Impact:",
    ...Object.entries(result.impact || {}).map(([k, v]) => `  ${k}: ${typeof v === "number" ? "₹" + v.toLocaleString("en-IN") : v}`),
    "",
    result.warnings?.length > 0 ? "⚠️ Warnings:" : "",
    ...result.warnings.map(w => `  • ${w}`),
    "",
    result.recommendation ? `💡 ${result.recommendation}` : "",
  ].filter(l => l !== "" || true);
  return lines.join("\n");
}