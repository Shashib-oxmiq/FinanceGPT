// ── Tax Filing & ITR Prep Service (F-212) ─────────────────────────────────────
import { dbAll, dbRun, uuid } from "./db";

export async function getTaxRecords(userId) {
  return await dbAll("SELECT * FROM tax_records WHERE user_id = ? ORDER BY financial_year DESC", [userId]) || [];
}
export async function createTaxRecord(userId, d) {
  const id = uuid();
  await dbRun("INSERT INTO tax_records (tax_id, user_id, financial_year, gross_income, total_deductions, tax_paid, regime, itr_form, itr_status, filing_date, refund_amount, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
    [id, userId, d.financial_year, d.gross_income||0, d.total_deductions||0, d.tax_paid||0, d.regime||"new", d.itr_form||"", d.itr_status||"not_filed", d.filing_date||"", d.refund_amount||0, d.notes||""]);
  return { tax_id: id, ...d };
}
export async function updateTaxRecord(taxId, updates) {
  const fields = [], vals = [];
  for (const [k,v] of Object.entries(updates)) { if (["itr_status","filing_date","refund_amount","tax_paid","itr_form","notes"].includes(k)) { fields.push(`${k}=?`); vals.push(v); } }
  if (fields.length) { vals.push(taxId); await dbRun(`UPDATE tax_records SET ${fields.join(",")} WHERE tax_id=?`, vals); }
}

// ── Tax Calculator (FY 2024-25 / AY 2025-26) ──
export function calculateTax(grossIncome, deductions = {}, regime = "new") {
  const gross = Number(grossIncome) || 0;

  if (regime === "old") {
    // Old regime: apply deductions
    const ded80C = Math.min(150000, Number(deductions["80C"]) || 0);
    const ded80D = Math.min(75000, Number(deductions["80D"]) || 0);
    const ded80CCD1B = Math.min(50000, Number(deductions["80CCD1B"]) || 0);
    const dedHRA = Number(deductions["HRA"]) || 0;
    const dedOther = Number(deductions["other"]) || 0;
    const totalDeductions = ded80C + ded80D + ded80CCD1B + dedHRA + dedOther;
    const taxableIncome = Math.max(0, gross - totalDeductions);
    const tax = oldRegimeTax(taxableIncome);
    const cess = Math.round(tax * 0.04);
    return { regime: "old", gross, totalDeductions, taxableIncome, tax, cess, totalTax: tax + cess, takeHome: gross - tax - cess };
  } else {
    // New regime FY 2024-25
    const stdDed = 75000; // standard deduction
    const taxableIncome = Math.max(0, gross - stdDed);
    const tax = newRegimeTax(taxableIncome);
    const cess = Math.round(tax * 0.04);
    return { regime: "new", gross, stdDeduction: stdDed, taxableIncome, tax, cess, totalTax: tax + cess, takeHome: gross - tax - cess };
  }
}

function oldRegimeTax(income) {
  let tax = 0;
  if (income <= 250000) return 0;
  if (income <= 500000) tax = (income - 250000) * 0.05;
  else if (income <= 1000000) tax = 12500 + (income - 500000) * 0.20;
  else tax = 112500 + (income - 1000000) * 0.30;
  // Rebate under 87A
  if (income <= 500000) tax = 0;
  return Math.round(tax);
}

function newRegimeTax(income) {
  let tax = 0;
  if (income <= 300000) return 0;
  if (income <= 700000) tax = (income - 300000) * 0.05;
  else if (income <= 1000000) tax = 20000 + (income - 700000) * 0.10;
  else if (income <= 1200000) tax = 50000 + (income - 1000000) * 0.15;
  else if (income <= 1500000) tax = 80000 + (income - 1200000) * 0.20;
  else tax = 140000 + (income - 1500000) * 0.30;
  // Rebate under 87A (new regime: up to ₹7L)
  if (income <= 700000) tax = 0;
  return Math.round(tax);
}

// ── Compare both regimes ──
export function compareRegimes(grossIncome, deductions) {
  const oldResult = calculateTax(grossIncome, deductions, "old");
  const newResult = calculateTax(grossIncome, {}, "new");
  const saving = oldResult.totalTax - newResult.totalTax;
  return {
    old: oldResult,
    new: newResult,
    better: saving > 0 ? "new" : "old",
    saving: Math.abs(saving),
    recommendation: saving > 0
      ? `New regime saves you ₹${saving.toLocaleString('en-IN')} in tax.`
      : `Old regime saves you ₹${Math.abs(saving).toLocaleString('en-IN')} in tax (with your deductions).`,
  };
}

// ── ITR Form Selector ──
export function suggestITRForm(income, incomeSources = {}) {
  const salary = incomeSources.salary || false;
  const houseProperty = incomeSources.houseProperty || false;
  const business = incomeSources.business || false;
  const capitalGains = incomeSources.capitalGains || false;
  const foreignIncome = incomeSources.foreignIncome || false;
  const agriculturalIncome = (incomeSources.agriculturalIncome || 0) > 5000;

  if (business) return { form: "ITR-3", reason: "You have business/professional income" };
  if (foreignIncome) return { form: "ITR-2", reason: "You have foreign income/assets" };
  if (capitalGains || houseProperty) return { form: "ITR-2", reason: "You have capital gains or house property income" };
  if (salary && income <= 500000 && !houseProperty && !capitalGains) return { form: "ITR-1 (Sahaj)", reason: "Simple salary income under ₹5L" };
  if (salary) return { form: "ITR-1 (Sahaj)", reason: "Salary income — ITR-1 is the simplest form" };
  return { form: "ITR-1 (Sahaj)", reason: "Default — simplest form for most taxpayers" };
}

// ── Tax Saving Suggestions (F-215) ──
export function getTaxSavingSuggestions(grossIncome, currentDeductions = {}) {
  const suggestions = [];
  const gross = Number(grossIncome) || 0;

  // 80C — up to ₹1.5L
  const current80C = Number(currentDeductions["80C"]) || 0;
  if (current80C < 150000 && gross > 500000) {
    const remaining = 150000 - current80C;
    const saving = Math.round(remaining * 0.30); // 30% slab
    suggestions.push({
      section: "80C",
      title: "Invest ₹" + remaining.toLocaleString('en-IN') + " more in 80C",
      saving,
      options: ["ELSS Mutual Funds (best returns, 3yr lock-in)", "PPF (7.1%, 15yr lock-in, tax-free)", "NPS (10% expected, lock-in till 60)", "Life Insurance Premium", "NSC (7.7%, 5yr)", "ULIP (market-linked)"],
      recommendation: "ELSS gives best returns with shortest lock-in (3 years). Start a SIP of ₹" + Math.round(remaining/12).toLocaleString('en-IN') + "/month.",
    });
  }

  // 80D — Health Insurance
  const current80D = Number(currentDeductions["80D"]) || 0;
  if (current80D < 75000) {
    const remaining = 75000 - current80D;
    const saving = Math.round(remaining * 0.30);
    suggestions.push({
      section: "80D",
      title: "Get health insurance to save ₹" + saving.toLocaleString('en-IN'),
      saving,
      options: ["Self + family: up to ₹25K premium → ₹25K deduction", "Parents (senior): up to ₹50K premium → ₹50K deduction", "Preventive health checkup: ₹5K"],
      recommendation: "A ₹5L family floater + parents cover costs ₹15K-25K/year but saves ₹7.5K-15K in tax AND protects you from medical emergencies.",
    });
  }

  // 80CCD(1B) — NPS extra ₹50K
  const current80CCD1B = Number(currentDeductions["80CCD1B"]) || 0;
  if (current80CCD1B < 50000 && gross > 500000) {
    const remaining = 50000 - current80CCD1B;
    const saving = Math.round(remaining * 0.30);
    suggestions.push({
      section: "80CCD(1B)",
      title: "Invest ₹" + remaining.toLocaleString('en-IN') + " in NPS for extra ₹" + saving.toLocaleString('en-IN') + " saving",
      saving,
      options: ["NPS Tier-1 account — ₹50K extra deduction over 80C", "Lowest fund management charges (0.01%)", "Lock-in till age 60 (60% tax-free withdrawal)"],
      recommendation: "This is the ONLY deduction available in new tax regime too. If you're in 30% slab, ₹50K in NPS saves ₹15.6K instantly.",
    });
  }

  // 80G — Donations
  suggestions.push({
    section: "80G",
    title: "Donate to charity — 50-100% tax deduction",
    saving: 0,
    options: ["PM Relief Fund: 100% deduction", "GiveIndia/verified NGOs: 50% deduction", "Govt-approved educational institutions"],
    recommendation: "Donations to PM Relief Fund give 100% deduction with no limit. If you're donating anyway, get tax benefit too.",
  });

  // Home loan principal
  suggestions.push({
    section: "80C (Home Loan)",
    title: "Home loan principal repayment = 80C deduction",
    saving: 0,
    options: ["Principal portion of EMI is deductible under 80C", "Interest portion: up to ₹2L under Section 24", "First-time buyer: up to ₹3.5L extra (Sections 80EE/80EEA)"],
    recommendation: "If you have a home loan, your principal EMI portion counts toward 80C. Track it to maximize deductions.",
  });

  // Sort by saving amount
  suggestions.sort((a, b) => (b.saving || 0) - (a.saving || 0));
  return suggestions;
}