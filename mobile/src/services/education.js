// ── Education Planner Service (F-210) ────────────────────────────────────────
import { dbAll, dbRun, uuid } from "./db";

export async function getEducationPlans(userId) {
  return await dbAll("SELECT * FROM education_plans WHERE user_id = ?", [userId]) || [];
}
export async function createEducationPlan(userId, d) {
  const id = uuid();
  await dbRun("INSERT INTO education_plans (plan_id, user_id, child_name, child_age, current_class, target_education, target_year, estimated_cost, current_savings, monthly_contribution) VALUES (?,?,?,?,?,?,?,?,?,?)",
    [id, userId, d.child_name||"", d.child_age||0, d.current_class||"", d.target_education||"", d.target_year||"", d.estimated_cost||0, d.current_savings||0, d.monthly_contribution||0]);
  return { plan_id: id, ...d };
}
export async function deleteEducationPlan(planId) { await dbRun("DELETE FROM education_plans WHERE plan_id=?", [planId]); }

// Admission document checklist by grade level
export const ADMISSION_CHECKLISTS = {
  nursery: ["Birth certificate", "Aadhaar card (child + parents)", "Passport size photos (6)", "Address proof", "Caste certificate (if applicable)", "Income certificate (if applicable)", "Baptism certificate (for Christian schools)"],
  primary: ["Birth certificate", "Aadhaar card", "Transfer Certificate (TC) from previous school", "Report card (previous year)", "Passport size photos (4)", "Address proof", "Caste certificate (if applicable)"],
  secondary: ["Transfer Certificate (TC)", "Report cards (last 2 years)", "Aadhaar card", "Character certificate", "Migration certificate (if different board)", "Passport size photos (4)", "Caste certificate (if applicable)"],
  senior_secondary: ["Transfer Certificate (TC)", "Class 10 mark sheet/certificate", "Aadhaar card", "Character certificate", "Migration certificate (if different board)", "Passport size photos (4)", "Category certificate (if applicable)"],
  college: ["Class 12 mark sheet/certificate", "Class 10 mark sheet", "Transfer Certificate", "Character certificate", "Migration certificate", "Aadhaar card", "Passport size photos (6)", "Caste/EWS/Income certificate (if applicable)", "Entrance exam scorecard (JEE/NEET/CLAT/etc.)"],
  postgrad: ["UG degree certificate", "UG mark sheets (all semesters)", "Transfer Certificate", "Character certificate", "Migration certificate", "Aadhaar card", "Passport size photos (6)", "Entrance exam scorecard (CAT/GATE/GRE/etc.)"],
};

export const EDUCATION_COSTS = [
  { level: "Nursery (age 3-5)", annual: 25000, city_multiplier: 3 },
  { level: "Primary (class 1-5)", annual: 40000, city_multiplier: 3 },
  { level: "Secondary (class 6-10)", annual: 60000, city_multiplier: 3 },
  { level: "Senior Secondary (11-12)", annual: 80000, city_multiplier: 3 },
  { level: "Engineering (B.Tech)", annual: 150000, city_multiplier: 2 },
  { level: "Medical (MBBS)", annual: 800000, city_multiplier: 1.5 },
  { level: "Management (MBA)", annual: 1200000, city_multiplier: 1.5 },
  { level: "Law (LLB)", annual: 200000, city_multiplier: 2 },
  { level: "Arts/Science (BA/BSc)", annual: 60000, city_multiplier: 2 },
  { level: "Postgrad (MTech/MS)", annual: 200000, city_multiplier: 2 },
  { level: "Study Abroad (US/UK)", annual: 3500000, city_multiplier: 1 },
  { level: "Study Abroad (Germany/Aus)", annual: 1200000, city_multiplier: 1 },
];

// Education loans
export const EDUCATION_LOAN_INFO = {
  max_amount: "₹20L (unsecured), ₹40L+ (secured with collateral)",
  interest_rate: "8.5%-14% (PSU banks cheaper than private)",
  moratorium: "1 year after course + 6 months after getting job",
  repayment_period: "Up to 15 years",
  tax_benefit: "Section 80E — full interest deduction, no limit, for 8 years",
  govt_schemes: [
    "Vidya Lakshmi Portal — apply to 40+ banks at once",
    "Central Sector Interest Subsidy — full interest subsidy during study for EWS",
    "Padho Pardesh — interest subsidy for minority students studying abroad",
  ],
  url: "https://www.vidyalakshmi.co.in",
};

// Scholarships
export const SCHOLARSHIPS = [
  { name: "National Scholarship Portal", eligibility: "SC/ST/OBC/Minority, income < ₹2.5L", amount: "₹12K-₹20K/year", url: "scholarships.gov.in" },
  { name: "INSPIRE Scholarship", eligibility: "Top 1% in Class 12, pursuing BSc/MSc", amount: "₹80K/year", url: "online-inspire.gov.in" },
  { name: "PM Research Fellowship", eligibility: "IIT/IISc/NIT PhD students", amount: "₹70K-₹80K/month", url: "pmrf.in" },
  { name: "AICTE Pragati/Saksham", eligibility: "Girls/differently-abled, diploma/degree", amount: "₹50K/year", url: "scholarships.gov.in" },
  { name: "Buddy4Study", eligibility: "Various merit + need based", amount: "₹10K-₹2L", url: "buddy4study.com" },
  { name: "Foundation for Excellence", eligibility: "Engineering/medical, income < ₹2L", amount: "₹25K-₹1L/year", url: "ffe.org" },
];

export function calculateEducationCost(currentAge, targetEducation, cityTier = 2) {
  const edu = EDUCATION_COSTS.find(e => e.level.includes(targetEducation)) || EDUCATION_COSTS[4];
  const yearsUntil = Math.max(0, 18 - currentAge);
  const futureCost = edu.annual * (cityTier === 1 ? edu.city_multiplier : 1) * 3; // 3 year course approx
  // Inflate at 10% per year
  const inflatedCost = Math.round(futureCost * Math.pow(1.10, yearsUntil));
  const monthlyNeeded = yearsUntil > 0 ? Math.round(inflatedCost / (yearsUntil * 12)) : inflatedCost;
  return { annualCost: edu.annual, yearsUntil, inflatedCost, monthlyNeeded };
}