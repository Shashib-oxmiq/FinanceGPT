// ── Insurance Gap Analysis Service ────────────────────────────────────────────
// Analyzes user's insurance portfolio against recommended coverage.
// Identifies gaps: missing life insurance, insufficient health cover, no accident cover.

import { api } from "./api";

// Recommended insurance ratios for Indian context
export const RECOMMENDATIONS = {
  term_life: {
    label: "Term Life Insurance",
    recommended_multiple: 12, // 12x annual income
    min_cover: 5000000, // minimum ₹50L
    reason: "Term life should cover at least 12x your annual income so your family can maintain their lifestyle if you're gone.",
    urgency: "critical",
  },
  health: {
    label: "Health Insurance (Family Floater)",
    recommended_base: 500000, // ₹5L base
    metro_recommended: 1000000, // ₹10L for metro cities
    reason: "Healthcare costs in India are rising 14% annually. A single hospitalization can cost ₹2-5L in a private hospital.",
    urgency: "critical",
  },
  accident: {
    label: "Personal Accident Insurance",
    recommended_cover: 2000000, // ₹20L
    reason: "Accidents are the #1 cause of death for ages 18-40 in India. PA cover is very cheap (₹200-500/year for ₹20L).",
    urgency: "high",
  },
  critical_illness: {
    label: "Critical Illness Cover",
    recommended_cover: 1000000, // ₹10L
    reason: "Cancer, heart attack, stroke treatments cost ₹10-25L. Critical illness cover pays a lump sum on diagnosis.",
    urgency: "medium",
  },
  home_insurance: {
    label: "Home Insurance",
    recommended_cover: "structure + contents",
    reason: "Protects your biggest asset from fire, theft, natural disasters. Costs only ₹2,000-5,000/year.",
    urgency: "low",
  },
};

export async function analyzeInsuranceGaps(userId, profile = {}) {
  let policies = [];
  try {
    policies = await api.getInsurance(userId);
  } catch (e) { /* non-fatal */ }

  const annualIncome = Number(profile.income) || 300000; // default ₹3L if unknown
  const isMetro = profile.location && ["mumbai", "delhi", "bangalore", "bengaluru", "pune", "chennai", "hyderabad", "kolkata", "ahmedabad"].includes(profile.location?.toLowerCase());

  const gaps = [];
  const covered = [];
  let totalCover = 0;

  // Check each insurance type
  const hasType = (types) => policies.some(p => {
    const t = (p.policy_type || "").toLowerCase();
    return types.some(type => t.includes(type));
  });

  const getPolicy = (types) => policies.find(p => {
    const t = (p.policy_type || "").toLowerCase();
    return types.some(type => t.includes(type));
  });

  // 1. Term Life
  const lifePolicy = getPolicy(["term", "life"]);
  if (lifePolicy) {
    const cover = Number(lifePolicy.sum_assured) || 0;
    const recommended = Math.max(RECOMMENDATIONS.term_life.min_cover, annualIncome * RECOMMENDATIONS.term_life.recommended_multiple);
    if (cover < recommended) {
      gaps.push({
        type: "term_life",
        label: "Life Insurance — Insufficient Cover",
        current: cover,
        recommended,
        shortfall: recommended - cover,
        reason: `Your life cover is ₹${cover.toLocaleString('en-IN')} but you need ₹${recommended.toLocaleString('en-IN')} (${RECOMMENDATIONS.term_life.recommended_multiple}x your income). Your family would face a shortfall of ₹${(recommended - cover).toLocaleString('en-IN')}.`,
        urgency: "critical",
        action: "Increase your term life cover or buy a second policy for the shortfall.",
      });
    } else {
      covered.push({ type: "term_life", label: "Term Life Insurance", cover });
      totalCover += cover;
    }
  } else {
    const recommended = Math.max(RECOMMENDATIONS.term_life.min_cover, annualIncome * RECOMMENDATIONS.term_life.recommended_multiple);
    gaps.push({
      type: "term_life",
      label: "No Life Insurance",
      current: 0,
      recommended,
      shortfall: recommended,
      reason: `You have NO life insurance. If something happens to you, your family gets nothing. You need at least ₹${recommended.toLocaleString('en-IN')} of term life cover. A term plan costs just ₹${Math.round(recommended / 30000)}/month.`,
      urgency: "critical",
      action: "Buy a term life plan from LIC, HDFC Life, or SBI Life. Online plans are 40% cheaper.",
    });
  }

  // 2. Health Insurance
  const healthPolicy = getPolicy(["health", "mediclaim", "family floater"]);
  if (healthPolicy) {
    const cover = Number(healthPolicy.sum_assured) || 0;
    const recommended = isMetro ? RECOMMENDATIONS.health.metro_recommended : RECOMMENDATIONS.health.recommended_base;
    if (cover < recommended) {
      gaps.push({
        type: "health",
        label: "Health Insurance — Insufficient Cover",
        current: cover,
        recommended,
        shortfall: recommended - cover,
        reason: `Your health cover is ₹${cover.toLocaleString('en-IN')}. For ${isMetro ? "metro cities" : "your location"}, you need at least ₹${recommended.toLocaleString('en-IN')}. A single ICU stay can cost ₹3-5L.`,
        urgency: "critical",
        action: `Increase your health cover to ₹${recommended.toLocaleString('en-IN')} or buy a super top-up plan (cheaper than increasing base cover).`,
      });
    } else {
      covered.push({ type: "health", label: "Health Insurance", cover });
    }
  } else {
    gaps.push({
      type: "health",
      label: "No Health Insurance",
      current: 0,
      recommended: isMetro ? RECOMMENDATIONS.health.metro_recommended : RECOMMENDATIONS.health.recommended_base,
      shortfall: isMetro ? RECOMMENDATIONS.health.metro_recommended : RECOMMENDATIONS.health.recommended_base,
      reason: "You have NO health insurance. One hospitalization can wipe out your savings. A ₹5L family floater costs just ₹8,000-12,000/year.",
      urgency: "critical",
      action: "Buy a family floater health plan from Star Health, Niva Bupa, or HDFC Ergo.",
    });
  }

  // 3. Personal Accident
  if (!hasType(["accident", "personal accident"])) {
    gaps.push({
      type: "accident",
      label: "No Accident Insurance",
      current: 0,
      recommended: RECOMMENDATIONS.accident.recommended_cover,
      shortfall: RECOMMENDATIONS.accident.recommended_cover,
      reason: "You have no personal accident cover. For just ₹200-500/year you can get ₹20L coverage. Accidents are the #1 cause of death for ages 18-40.",
      urgency: "high",
      action: "Add PA cover — it's the cheapest insurance you can buy. Available from any general insurer.",
    });
  } else {
    covered.push({ type: "accident", label: "Personal Accident", cover: 2000000 });
  }

  // 4. Critical Illness
  if (!hasType(["critical illness", "critical_illness", "ci"])) {
    gaps.push({
      type: "critical_illness",
      label: "No Critical Illness Cover",
      current: 0,
      recommended: RECOMMENDATIONS.critical_illness.recommended_cover,
      shortfall: RECOMMENDATIONS.critical_illness.recommended_cover,
      reason: "No critical illness cover. Cancer treatment alone costs ₹10-25L. A CI plan pays a lump sum on diagnosis — no bills needed.",
      urgency: "medium",
      action: "Consider a critical illness rider with your term plan or standalone CI cover.",
    });
  } else {
    covered.push({ type: "critical_illness", label: "Critical Illness", cover: 1000000 });
  }

  // 5. Home insurance (only suggest if user likely owns a home)
  if (profile.owns_home && !hasType(["home", "property"])) {
    gaps.push({
      type: "home_insurance",
      label: "No Home Insurance",
      current: 0,
      recommended: "structure + contents",
      shortfall: 0,
      reason: "Your home is likely your biggest asset. Home insurance costs just ₹2,000-5,000/year but protects against fire, theft, earthquakes, floods.",
      urgency: "low",
      action: "Add home insurance from any general insurer. Covers structure and contents.",
    });
  }

  // Sort gaps by urgency
  const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  gaps.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

  const totalShortfall = gaps.reduce((s, g) => s + (Number(g.shortfall) || 0), 0);
  const protectionScore = Math.max(0, 100 - (gaps.length * 20) - (gaps.filter(g => g.urgency === "critical").length * 15));

  return { gaps, covered, totalCover, totalShortfall, protectionScore, hasPolicies: policies.length > 0 };
}