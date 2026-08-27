/**
 * Demo Seed Service — Populates SQLite with realistic Indian financial data
 * for a demo user. Called when user logs in as "demo" account.
 * Seeds: investments, insurance, loans, bills, goals, property, retirement,
 * education, tax, expenses, reminders, documents, contacts, family, emergency, health.
 */

import { initDB, uuid } from "./db";

const DEMO_USER_ID = "demo-user-001";
const NOW = new Date();
const isoDate = (d) => d.toISOString().split("T")[0];
const daysFromNow = (n) => isoDate(new Date(NOW.getTime() + n * 86400000));

export async function seedDemoData(userId = DEMO_USER_ID) {
  const db = await initDB();
  const u = userId;

  // Clear existing demo data
  const tables = ["investments", "insurance", "loans", "bills", "goals", "expenses",
    "properties", "retirement_corpus", "education_plans", "tax_records", "reminders",
    "documents", "contacts", "family_members", "emergency_config", "medical_records",
    "ai_memory", "health_score_history", "coach_messages", "insights_cache"];
  for (const t of tables) {
    try { await db.runAsync(`DELETE FROM ${t} WHERE user_id = ?`, [u]); } catch (e) {}
  }

  // ═══ Investments (6) ═══
  const investments = [
    { name: "Reliance Industries", asset_type: "stock", amount_invested: 150000, current_value: 185000, ticker: "RELIANCE.NS", market: "NSE" },
    { name: "HDFC Mid-Cap Fund", asset_type: "mutual_fund", amount_invested: 300000, current_value: 380000, ticker: "HDFCMIDCAP", market: "MF" },
    { name: "Nifty 50 ETF (NIFTYBEES)", asset_type: "etf", amount_invested: 200000, current_value: 245000, ticker: "NIFTYBEES.NS", market: "NSE" },
    { name: "SBI Fixed Deposit", asset_type: "bond", amount_invested: 500000, current_value: 530000, ticker: "", market: "" },
    { name: "Gold Sovereign Bond", asset_type: "gold", amount_invested: 100000, current_value: 128000, ticker: "SGB", market: "RBI" },
    { name: "Bitcoin", asset_type: "crypto", amount_invested: 50000, current_value: 72000, ticker: "BTC", market: "WAZIRX" },
  ];
  for (const inv of investments) {
    await db.runAsync(
      `INSERT INTO investments (investment_id, user_id, name, asset_type, amount_invested, current_value, ticker, market, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [uuid(), u, inv.name, inv.asset_type, inv.amount_invested, inv.current_value, inv.ticker, inv.market]
    );
  }

  // ═══ Insurance (4) ═══
  const insurance = [
    { policy_type: "Term Life", provider: "LIC", policy_number: "LIC-TERM-987654", sum_assured: 10000000, premium_amount: 18000, premium_frequency: "annual", start_date: "2023-06-15", maturity_date: "2053-06-15", nominee: "Priya Sharma (Spouse)", notes: "Term plan, 30 years" },
    { policy_type: "Health Insurance", provider: "Star Health", policy_number: "STAR-HEALTH-456789", sum_assured: 1000000, premium_amount: 25000, premium_frequency: "annual", start_date: "2024-01-10", maturity_date: "2025-01-10", nominee: "Self + Family Floater", notes: "Family floater, ₹10L cover" },
    { policy_type: "Car Insurance", provider: "Bajaj Allianz", policy_number: "BAJAJ-CAR-123456", sum_assured: 800000, premium_amount: 12000, premium_frequency: "annual", start_date: "2024-03-01", maturity_date: "2025-03-01", nominee: "Self", notes: "Comprehensive, Hyundai Creta" },
    { policy_type: "Home Loan Insurance", provider: "ICICI Lombard", policy_number: "ICICI-HOME-789012", sum_assured: 5000000, premium_amount: 35000, premium_frequency: "annual", start_date: "2022-09-15", maturity_date: "2032-09-15", nominee: "Priya Sharma", notes: "Covers outstanding home loan" },
  ];
  for (const ins of insurance) {
    await db.runAsync(
      `INSERT INTO insurance (insurance_id, user_id, policy_type, provider, policy_number, sum_assured, premium_amount, premium_frequency, start_date, maturity_date, nominee, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuid(), u, ins.policy_type, ins.provider, ins.policy_number, ins.sum_assured, ins.premium_amount, ins.premium_frequency, ins.start_date, ins.maturity_date, ins.nominee, ins.notes]
    );
  }

  // ═══ Loans (3) ═══
  const loans = [
    { loan_type: "home", lender: "SBI", principal: 4500000, interest_rate: 8.5, tenure_months: 240, start_date: "2022-09-15", emi_amount: 38916, remaining_amount: 4200000, end_date: "2042-09-15" },
    { loan_type: "car", lender: "HDFC Bank", principal: 800000, interest_rate: 9.2, tenure_months: 60, start_date: "2023-03-01", emi_amount: 16700, remaining_amount: 580000, end_date: "2028-03-01" },
    { loan_type: "personal", lender: "Axis Bank", principal: 300000, interest_rate: 13.5, tenure_months: 36, start_date: "2024-06-01", emi_amount: 10200, remaining_amount: 210000, end_date: "2027-06-01" },
  ];
  for (const l of loans) {
    await db.runAsync(
      `INSERT INTO loans (loan_id, user_id, loan_type, lender, principal, interest_rate, tenure_months, start_date, emi_amount, remaining_amount, end_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [uuid(), u, l.loan_type, l.lender, l.principal, l.interest_rate, l.tenure_months, l.start_date, l.emi_amount, l.remaining_amount, l.end_date]
    );
  }

  // ═══ Bills (5) ═══
  const bills = [
    { bill_type: "electricity", provider: "BSES Rajdhani", amount: 3500, due_date: daysFromNow(5), frequency: "monthly", paid: 0 },
    { bill_type: "water", provider: "Delhi Jal Board", amount: 800, due_date: daysFromNow(12), frequency: "monthly", paid: 0 },
    { bill_type: "internet", provider: "Airtel", amount: 1200, due_date: daysFromNow(3), frequency: "monthly", paid: 0 },
    { bill_type: "phone", provider: "Jio Postpaid", amount: 599, due_date: daysFromNow(8), frequency: "monthly", paid: 0 },
    { bill_type: "gas", provider: "Indraprastha Gas", amount: 600, due_date: daysFromNow(15), frequency: "monthly", paid: 0 },
  ];
  for (const b of bills) {
    await db.runAsync(
      `INSERT INTO bills (bill_id, user_id, bill_type, provider, amount, due_date, frequency, paid, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [uuid(), u, b.bill_type, b.provider, b.amount, b.due_date, b.frequency, b.paid]
    );
  }

  // ═══ Goals (4) ═══
  const goals = [
    { name: "Emergency Fund", target_amount: 300000, current_amount: 150000, monthly_contribution: 5000, target_date: daysFromNow(365), goal_type: "emergency" },
    { name: "Dream Vacation (Japan)", target_amount: 200000, current_amount: 75000, monthly_contribution: 8000, target_date: daysFromNow(300), goal_type: "travel" },
    { name: "New Car", target_amount: 1200000, current_amount: 400000, monthly_contribution: 15000, target_date: daysFromNow(730), goal_type: "house" },
    { name: "Daughter's Wedding", target_amount: 1500000, current_amount: 300000, monthly_contribution: 10000, target_date: daysFromNow(1825), goal_type: "other" },
  ];
  for (const g of goals) {
    await db.runAsync(
      `INSERT INTO goals (goal_id, user_id, name, target_amount, current_amount, monthly_contribution, target_date, goal_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [uuid(), u, g.name, g.target_amount, g.current_amount, g.monthly_contribution, g.target_date, g.goal_type]
    );
  }

  // ═══ Properties (2) ═══
  const properties = [
    { property_type: "residential", address: "B-12, Sector 56, Gurugram", city: "Gurugram", state: "Haryana", purchase_price: 6500000, current_value: 8200000, purchase_date: "2021-03-10", area_sqft: 1450, ownership: "sole", property_tax_amount: 45000, property_tax_due: daysFromNow(45), mutation_status: "completed" },
    { property_type: "commercial", address: "Shop 5, Market Complex, Dwarka", city: "Delhi", state: "Delhi", purchase_price: 2500000, current_value: 3200000, purchase_date: "2020-11-20", area_sqft: 500, ownership: "joint", property_tax_amount: 30000, property_tax_due: daysFromNow(60), mutation_status: "completed" },
  ];
  for (const p of properties) {
    await db.runAsync(
      `INSERT INTO properties (property_id, user_id, property_type, address, city, state, purchase_price, current_value, purchase_date, area_sqft, ownership, property_tax_amount, property_tax_due, mutation_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [uuid(), u, p.property_type, p.address, p.city, p.state, p.purchase_price, p.current_value, p.purchase_date, p.area_sqft, p.ownership, p.property_tax_amount, p.property_tax_due, p.mutation_status]
    );
  }

  // ═══ Retirement Corpus (3 sources) ═══
  const retirement = [
    { source: "nps", current_value: 280000, monthly_contribution: 5000, employer_contribution: 5000, expected_return: 10 },
    { source: "epf", current_value: 850000, monthly_contribution: 3500, employer_contribution: 3500, expected_return: 8 },
    { source: "ppf", current_value: 420000, monthly_contribution: 10000, employer_contribution: 0, expected_return: 7.1 },
  ];
  for (const r of retirement) {
    await db.runAsync(
      `INSERT INTO retirement_corpus (corpus_id, user_id, source, current_value, monthly_contribution, employer_contribution, expected_return, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [uuid(), u, r.source, r.current_value, r.monthly_contribution, r.employer_contribution, r.expected_return]
    );
  }

  // ═══ Education Plans (1) ═══
  await db.runAsync(
    `INSERT INTO education_plans (plan_id, user_id, child_name, child_age, target_education, current_savings, monthly_contribution, estimated_cost, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [uuid(), u, "Aarav Sharma", 7, "Engineering (B.Tech)", 200000, 12000, 2500000]
  );

  // ═══ Tax Records (1) ═══
  await db.runAsync(
    `INSERT INTO tax_records (tax_id, user_id, financial_year, gross_income, deductions, regime, tax_paid, refund, itr_form, filing_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [uuid(), u, "2024-25", 1200000, 210000, "old", 96000, 5000, "ITR-1", "2025-07-15"]
  );

  // ═══ Expenses (recent 8) ═══
  const expenses = [
    { category: "groceries", description: "Big Bazaar weekly", amount: 3200, date: daysFromNow(-2) },
    { category: "dining", description: "Birthday dinner", amount: 2800, date: daysFromNow(-5) },
    { category: "transport", description: "Uber rides", amount: 650, date: daysFromNow(-1) },
    { category: "medical", description: "Pharmacy", amount: 1200, date: daysFromNow(-7) },
    { category: "entertainment", description: "Movie + popcorn", amount: 1800, date: daysFromNow(-3) },
    { category: "shopping", description: "Amazon order", amount: 3500, date: daysFromNow(-4) },
    { category: "utilities", description: "DTH recharge", amount: 500, date: daysFromNow(-6) },
    { category: "groceries", description: "Vegetables", amount: 800, date: daysFromNow(-1) },
  ];
  for (const e of expenses) {
    await db.runAsync(
      `INSERT INTO expenses (expense_id, user_id, category, description, amount, date, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      [uuid(), u, e.category, e.description, e.amount, e.date]
    );
  }

  // ═══ Reminders (5) ═══
  const reminders = [
    { title: "Pay electricity bill", due_date: daysFromNow(5), category: "bills", priority: "high" },
    { title: "Term insurance premium due", due_date: daysFromNow(25), category: "insurance", priority: "high" },
    { title: "Submit ITR for FY 2025-26", due_date: daysFromNow(300), category: "tax", priority: "medium" },
    { title: "Car service due", due_date: daysFromNow(15), category: "vehicle", priority: "medium" },
    { title: "NPS contribution this month", due_date: daysFromNow(3), category: "investment", priority: "medium" },
  ];
  for (const r of reminders) {
    await db.runAsync(
      `INSERT INTO reminders (reminder_id, user_id, title, due_date, category, priority, completed, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now'))`,
      [uuid(), u, r.title, r.due_date, r.category, r.priority]
    );
  }

  // ═══ Documents (5) ═══
  const docs = [
    { original_filename: "Aadhaar_Card.pdf", category: "Identity", content_type: "application/pdf", size: 245000, content_hash: "aadhaar_001" },
    { original_filename: "PAN_Card.jpg", category: "Identity", content_type: "image/jpeg", size: 180000, content_hash: "pan_001" },
    { original_filename: "Term_Insurance_Policy.pdf", category: "Insurance", content_type: "application/pdf", size: 520000, content_hash: "term_lic_001" },
    { original_filename: "Home_Loan_Agreement.pdf", category: "Property", content_type: "application/pdf", size: 1200000, content_hash: "home_sbi_001" },
    { original_filename: "Property_Registry.pdf", category: "Property", content_type: "application/pdf", size: 850000, content_hash: "prop_ggn_001" },
  ];
  for (const d of docs) {
    await db.runAsync(
      `INSERT INTO documents (document_id, user_id, original_filename, category, content_type, size, storage_path, content_hash, tags, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[]', datetime('now'))`,
      [uuid(), u, d.original_filename, d.category, d.content_type, d.size, "", d.content_hash]
    );
  }

  // ═══ Contacts / Trusted Contacts (3) ═══
  const contacts = [
    { name: "Priya Sharma", relationship: "Spouse", email: "priya.sharma@email.com", phone: "9876543210" },
    { name: "Rajesh Sharma (Father)", relationship: "Father", email: "rajesh.sharma@email.com", phone: "9811122233" },
    { name: "CA Deepak Verma", relationship: "Tax Advisor", email: "deepak.verma@cafirm.com", phone: "9988776655" },
  ];
  for (const c of contacts) {
    await db.runAsync(
      `INSERT INTO contacts (contact_id, user_id, name, relationship, email, phone, access_level) VALUES (?, ?, ?, ?, ?, ?, 'view')`,
      [uuid(), u, c.name, c.relationship, c.email, c.phone]
    );
  }

  // ═══ Family Members (3) ═══
  const family = [
    { name: "Priya Sharma", relationship: "spouse", age: 34, access_scope: "full" },
    { name: "Aarav Sharma", relationship: "son", age: 7, access_scope: "view" },
    { name: "Rajesh Sharma", relationship: "father", age: 65, access_scope: "parent" },
  ];
  for (const f of family) {
    await db.runAsync(
      `INSERT INTO family_members (member_id, user_id, name, relationship, age, access_scope) VALUES (?, ?, ?, ?, ?, ?)`,
      [uuid(), u, f.name, f.relationship, f.age, f.access_scope]
    );
  }

  // ═══ Emergency Config ═══
  await db.runAsync(
    `INSERT OR REPLACE INTO emergency_config (config_id, user_id, enabled, inactive_days, grace_period_days, trusted_contact_ids, kin_message, last_active, escalation_phase, updated_at)
     VALUES ('default', ?, 1, 30, 7, '[]', 'Dear family, if you are reading this, please check on me. All my financial details are here. Contact Priya for everything. - Raj', datetime('now'), 'monitoring', datetime('now'))`,
    [u]
  );

  // ═══ Medical Records (2) ═══
  const medical = [
    { type: "prescription", title: "Annual health checkup", doctor: "Dr. Mehta", hospital: "Apollo Hospital", date: daysFromNow(-30) },
    { type: "lab_report", title: "Blood test results", doctor: "Dr. Mehta", hospital: "Thyrocare", date: daysFromNow(-25) },
  ];
  for (const m of medical) {
    await db.runAsync(
      `INSERT INTO medical_records (record_id, user_id, type, title, doctor, hospital, date) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [uuid(), u, m.type, m.title, m.doctor, m.hospital, m.date]
    );
  }

  // ═══ AI Memory (3 entries) ═══
  const memories = [
    { category: "personal", key: "occupation", value: "Software Engineering Manager at a fintech company" },
    { category: "personal", key: "location", value: "Gurugram, Haryana" },
    { category: "financial", key: "risk_appetite", value: "moderate — comfortable with 60% equity, 30% debt, 10% gold" },
  ];
  for (const m of memories) {
    await db.runAsync(
      `INSERT INTO ai_memory (memory_id, user_id, category, key, value, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      [uuid(), u, m.category, m.key, m.value]
    );
  }

  // ═══ Health Score Snapshot ═══
  await db.runAsync(
    `INSERT INTO health_score_history (snapshot_id, user_id, score, breakdown, recorded_at) VALUES (?, ?, 68, '{"investments":70,"insurance":85,"debt":45,"emergency":50,"goals":60,"bills":80}', datetime('now'))`,
    [uuid(), u]
  );

  return { success: true, tables: tables.length, userId: u };
}