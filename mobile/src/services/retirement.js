// ── Retirement Planning Service (F-211) ──────────────────────────────────────
import { dbAll, dbRun, uuid } from "./db";

export async function getRetirementCorpus(userId) {
  return await dbAll("SELECT * FROM retirement_corpus WHERE user_id = ?", [userId]) || [];
}
export async function addCorpusSource(userId, d) {
  const id = uuid();
  await dbRun("INSERT INTO retirement_corpus (corpus_id, user_id, source, current_value, monthly_contribution, employer_contribution, expected_return, vesting_age, notes) VALUES (?,?,?,?,?,?,?,?,?)",
    [id, userId, d.source, d.current_value||0, d.monthly_contribution||0, d.employer_contribution||0, d.expected_return||8, d.vesting_age||60, d.notes||""]);
  return { corpus_id: id, ...d };
}
export async function deleteCorpusSource(corpusId) { await dbRun("DELETE FROM retirement_corpus WHERE corpus_id=?", [corpusId]); }

export const RETIREMENT_SOURCES = [
  { key: "nps", label: "NPS (National Pension System)", icon: "shield-checkmark", color: "#10b981", return: 10, tax_benefit: "₹50K extra under 80CCD(1B)" },
  { key: "epf", label: "EPF (Employee Provident Fund)", icon: "briefcase", color: "#3b82f6", return: 8.25, tax_benefit: "80C up to ₹1.5L" },
  { key: "ppf", label: "PPF (Public Provident Fund)", icon: "lock-closed", color: "#8b5cf6", return: 7.1, tax_benefit: "80C, tax-free interest, 15yr lock-in" },
  { key: "gratuity", label: "Gratuity", icon: "cash", color: "#f59e0b", return: 0, tax_benefit: "Tax-free up to ₹20L" },
  { key: "annuity", label: "Annuity (Pension Plan)", icon: "calendar", color: "#ec4899", return: 6, tax_benefit: "Taxed as income" },
  { key: "mutual_fund", label: "Retirement Mutual Fund", icon: "trending-up", color: "#06b6d4", return: 12, tax_benefit: "LTCG 10% > ₹1L" },
  { key: "gold", label: "Gold (SGB/Physical)", icon: "diamond", color: "#eab308", return: 8, tax_benefit: "SBG tax-free" },
  { key: "real_estate", label: "Real Estate (Rental)", icon: "home", color: "#f97316", return: 7, tax_benefit: "Rental income taxed" },
  { key: "fd", label: "Fixed Deposit (Senior)", icon: "card", color: "#14b8a6", return: 7.5, tax_benefit: "80C 5yr FD, taxable" },
  { key: "scss", label: "Senior Citizens SCSS", icon: "happy", color: "#a78bfa", return: 8.2, tax_benefit: "80C, quarterly payout" },
];

// ── Calculate retirement corpus needed ──
export function calculateRetirementNeeded(currentAge, retirementAge, monthlyExpenses, inflationRate = 6, preRetReturn = 10, postRetReturn = 7) {
  const yearsToRetire = Math.max(0, retirementAge - currentAge);
  
  // Future monthly expenses at retirement (inflated)
  const futureMonthlyExp = Math.round(monthlyExpenses * Math.pow(1 + inflationRate/100, yearsToRetire));
  
  // Annual expenses at retirement
  const annualExpensesAtRetirement = futureMonthlyExp * 12;
  
  // Corpus needed (using 25x rule for 30-year retirement, adjusted for returns vs inflation)
  // Real return = post-retirement return - inflation
  const realReturn = postRetReturn - inflationRate;
  // If real return is positive, corpus = annualExpenses / (realReturn/100) — safe withdrawal
  // But cap at 30x annual expenses for safety
  const withdrawalRate = Math.max(3, Math.min(6, realReturn)); // conservative 3-6%
  const corpusNeeded = Math.round(annualExpensesAtRetirement * 25); // 25x rule

  // Monthly investment needed
  // Future value of monthly annuity: FV = PMT * [((1+r)^n - 1) / r]
  const r = preRetReturn / 12 / 100;
  const n = yearsToRetire * 12;
  let monthlyNeeded = 0;
  if (r > 0 && n > 0) {
    monthlyNeeded = Math.round(corpusNeeded * r / (Math.pow(1 + r, n) - 1));
  } else if (n > 0) {
    monthlyNeeded = Math.round(corpusNeeded / n);
  }

  return {
    yearsToRetire,
    futureMonthlyExp,
    annualExpensesAtRetirement,
    corpusNeeded,
    monthlyNeeded,
    currentAge,
    retirementAge,
  };
}

// ── Project corpus from current sources ──
export function projectCorpus(sources, yearsToRetire, currentAge) {
  let projectedTotal = 0;
  let currentTotal = 0;
  let monthlyContribution = 0;
  const breakdown = [];

  for (const s of sources) {
    const current = Number(s.current_value) || 0;
    const monthly = Number(s.monthly_contribution) || 0;
    const employer = Number(s.employer_contribution) || 0;
    const ret = (Number(s.expected_return) || 8) / 100;
    const r = ret / 12;
    const n = yearsToRetire * 12;
    
    // FV = PV*(1+r)^n + PMT*[((1+r)^n - 1)/r]
    let fv = current;
    if (r > 0 && n > 0) {
      fv = current * Math.pow(1 + r, n) + (monthly + employer) * (Math.pow(1 + r, n) - 1) / r;
    } else if (n > 0) {
      fv = current + (monthly + employer) * n;
    }
    
    projectedTotal += Math.round(fv);
    currentTotal += current;
    monthlyContribution += monthly + employer;
    breakdown.push({ source: s.source, current, monthly: monthly + employer, projected: Math.round(fv) });
  }

  return { projectedTotal, currentTotal, monthlyContribution, breakdown };
}