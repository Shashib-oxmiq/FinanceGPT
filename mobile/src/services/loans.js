// ── Credit & Loan Manager Service (F-208) ─────────────────────────────────────
import { dbAll, dbRun, uuid } from "./db";

export async function getLoans(userId) {
  return await dbAll("SELECT * FROM loans WHERE user_id = ? AND status = 'active' ORDER BY next_emi_date ASC", [userId]) || [];
}
export async function createLoan(userId, d) {
  const id = uuid();
  const emi = d.emi_amount || calculateEMI(d.principal, d.interest_rate, d.tenure_months);
  const end = d.end_date || calculateEndDate(d.start_date, d.tenure_months);
  await dbRun("INSERT INTO loans (loan_id, user_id, loan_type, lender, principal, interest_rate, tenure_months, emi_amount, remaining_amount, start_date, end_date, next_emi_date, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'active')",
    [id, userId, d.loan_type, d.lender||"", d.principal, d.interest_rate||0, d.tenure_months||0, emi, d.remaining_amount||d.principal, d.start_date, end, d.next_emi_date||d.start_date]);
  return { loan_id: id, ...d, emi_amount: emi, end_date: end };
}
export async function updateLoan(loanId, updates) {
  const fields = [], vals = [];
  for (const [k,v] of Object.entries(updates)) { if (["remaining_amount","next_emi_date","status","emi_amount"].includes(k)) { fields.push(`${k}=?`); vals.push(v); } }
  if (fields.length) { vals.push(loanId); await dbRun(`UPDATE loans SET ${fields.join(",")} WHERE loan_id=?`, vals); }
}
export async function deleteLoan(loanId) { await dbRun("UPDATE loans SET status='closed' WHERE loan_id=?", [loanId]); }

export function calculateEMI(principal, annualRate, months) {
  if (!principal || !months) return 0;
  const r = annualRate / 12 / 100;
  if (r === 0) return Math.round(principal / months);
  return Math.round(principal * r * Math.pow(1+r, months) / (Math.pow(1+r, months) - 1));
}
function calculateEndDate(startDate, months) {
  if (!startDate || !months) return null;
  const d = new Date(startDate); d.setMonth(d.getMonth() + months);
  return d.toISOString().split("T")[0];
}

export async function getDebtSummary(userId, monthlyIncome) {
  const loans = await getLoans(userId);
  const totalEMI = loans.reduce((s,l) => s + (Number(l.emi_amount)||0), 0);
  const totalDebt = loans.reduce((s,l) => s + (Number(l.remaining_amount)||0), 0);
  const dti = monthlyIncome > 0 ? Math.round((totalEMI / monthlyIncome) * 100) : 0;
  const isRisky = dti > 40;
  const isCritical = dti > 50;

  // Check for refinance opportunities
  const refinanceSuggestions = [];
  for (const loan of loans) {
    if (loan.interest_rate && loan.interest_rate > 12) {
      refinanceSuggestions.push({ loan, currentRate: loan.interest_rate, suggestedRate: 9.5, savings: Math.round(loan.remaining_amount * (loan.interest_rate - 9.5) / 100) });
    }
  }

  return { loans, totalEMI, totalDebt, dti, isRisky, isCritical, refinanceSuggestions, payoffYears: totalEMI > 0 ? Math.ceil(totalDebt / (totalEMI * 12) * 10) / 10 : 0 };
}

export const LOAN_TYPES = [
  { key: "home", label: "Home Loan", icon: "home", color: "#10b981" },
  { key: "car", label: "Car Loan", icon: "car", color: "#3b82f6" },
  { key: "personal", label: "Personal Loan", icon: "cash", color: "#f59e0b" },
  { key: "education", label: "Education Loan", icon: "school", color: "#8b5cf6" },
  { key: "credit_card", label: "Credit Card", icon: "card", color: "#ef4444" },
  { key: "gold", label: "Gold Loan", icon: "diamond", color: "#eab308" },
  { key: "business", label: "Business Loan", icon: "briefcase", color: "#06b6d4" },
  { key: "other", label: "Other", icon: "ellipsis-circle", color: "#6b7280" },
];