// ── Financial Health Score Service ────────────────────────────────────────────
// Computes a 0-100 score from existing user data.
// Categories: emergency fund (20), insurance (20), diversification (15),
// debt-to-income (15), document completeness (15), profile (15).

import { api } from "./api";

export async function computeHealthScore(userId) {
  if (!userId) return { score: 0, breakdown: {}, tips: [] };

  let investments = [];
  let insurance = [];
  let documents = [];
  let profile = {};

  try {
    investments = await api.getInvestments(userId);
    insurance = await api.getInsurance(userId);
    documents = await api.getDocuments(userId);
  } catch (e) { /* non-fatal */ }

  const tips = [];
  let score = 0;
  const breakdown = {};

  // 1. Emergency fund (20 pts) — 3+ months of expenses saved
  const totalCurrent = investments.reduce((s, i) => s + (Number(i.current_value) || 0), 0);
  const monthlyIncome = Number(profile?.income || 0) / 12 || 50000; // assume 50k if unknown
  const monthsCovered = totalCurrent / Math.max(monthlyIncome, 1);
  const emergencyPts = monthsCovered >= 3 ? 20 : Math.min(20, Math.round((monthsCovered / 3) * 20));
  score += emergencyPts;
  breakdown.emergency = { pts: emergencyPts, max: 20, label: "Emergency Fund", detail: `${monthsCovered.toFixed(1)} months of expenses saved` };
  if (emergencyPts < 20) tips.push("Build an emergency fund covering 3-6 months of expenses.");

  // 2. Insurance coverage (20 pts) — term life >= 10x income, health >= 5L
  let hasTermLife = false;
  let hasHealth = false;
  for (const p of insurance) {
    const type = (p.policy_type || "").toLowerCase();
    if (type.includes("term") || type.includes("life")) hasTermLife = true;
    if (type.includes("health") || type.includes("mediclaim")) hasHealth = true;
  }
  const insPts = (hasTermLife ? 12 : 0) + (hasHealth ? 8 : 0);
  score += insPts;
  breakdown.insurance = { pts: insPts, max: 20, label: "Insurance Coverage", detail: hasTermLife && hasHealth ? "Life + Health insurance active" : hasTermLife ? "Has life insurance, no health insurance" : hasHealth ? "Has health insurance, no life insurance" : "No insurance policies" };
  if (!hasTermLife) tips.push("Get term life insurance covering at least 10x your annual income.");
  if (!hasHealth) tips.push("Get health/mediclaim insurance of at least ₹5 lakh coverage.");

  // 3. Diversification (15 pts) — not all in one asset type
  const byType = {};
  for (const i of investments) {
    const t = i.asset_type || "other";
    byType[t] = (byType[t] || 0) + (Number(i.current_value) || 0);
  }
  const types = Object.keys(byType);
  let diversificationPts = 0;
  if (types.length >= 4) diversificationPts = 15;
  else if (types.length === 3) diversificationPts = 12;
  else if (types.length === 2) diversificationPts = 8;
  else if (types.length === 1) {
    // All eggs in one basket — check if it's a broad category
    const onlyType = types[0];
    if (onlyType === "mutual_fund" || onlyType === "etf") diversificationPts = 8;
    else diversificationPts = 4;
  }
  score += diversificationPts;
  breakdown.diversification = { pts: diversificationPts, max: 15, label: "Diversification", detail: `${types.length} asset type${types.length !== 1 ? "s" : ""}: ${types.join(", ") || "none"}` };
  if (diversificationPts < 12) tips.push("Diversify across 3+ asset types (stocks, mutual funds, gold, bonds, etc.).");

  // 4. Document completeness (15 pts) — PAN, Aadhaar, Will, Insurance docs
  const docNames = documents.map((d) => (d.original_filename || "").toLowerCase());
  const docCats = documents.map((d) => (d.category || "").toLowerCase());
  let docPts = 0;
  if (docNames.some((n) => n.includes("pan") || docCats.includes("identity"))) docPts += 3;
  if (docNames.some((n) => n.includes("aadhaar") || n.includes("aadhar"))) docPts += 3;
  if (docNames.some((n) => n.includes("will"))) docPts += 3;
  if (docCats.includes("insurance") || docNames.some((n) => n.includes("policy"))) docPts += 3;
  if (documents.length >= 5) docPts += 3;
  score += docPts;
  breakdown.documents = { pts: docPts, max: 15, label: "Document Vault", detail: `${documents.length} documents in vault` };
  if (docPts < 15) tips.push("Upload your PAN, Aadhaar, insurance policies, and will to your vault.");

  // 5. Profile completeness (15 pts)
  try {
    const profResp = await api.getProfile(userId);
    profile = profResp?.profile || profResp || {};
  } catch (e) { /* non-fatal */ }
  const profileFields = [profile?.name, profile?.phone, profile?.dob, profile?.address, profile?.income];
  const filled = profileFields.filter((f) => f && String(f).trim()).length;
  const profilePts = Math.round((filled / profileFields.length) * 15);
  score += profilePts;
  breakdown.profile = { pts: profilePts, max: 15, label: "Profile Completeness", detail: `${filled}/${profileFields.length} fields filled` };
  if (profilePts < 15) tips.push("Complete your profile for better AI recommendations.");

  // 6. Debt-to-income (15 pts) — estimate from investments vs no data
  // Since we don't track debts, give benefit of doubt if investments > 0
  const debtPts = totalCurrent > 0 ? 12 : 0;
  score += debtPts;
  breakdown.debt = { pts: debtPts, max: 15, label: "Debt Management", detail: totalCurrent > 0 ? "Has investments (debt tracking coming soon)" : "No financial data available" };

  return { score: Math.min(100, score), breakdown, tips };
}

export function getScoreColor(score) {
  if (score >= 70) return "#10b981"; // green
  if (score >= 40) return "#f59e0b"; // amber
  return "#ef4444"; // red
}

export function getScoreLabel(score) {
  if (score >= 70) return "Healthy";
  if (score >= 40) return "Needs Attention";
  return "At Risk";
}