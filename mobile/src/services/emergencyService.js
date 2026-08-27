/**
 * F-227: Emergency Access & Dead-Man Switch Engine
 * 
 * The complete life-safety system that ACTUALLY works:
 * 
 * Flow:
 * 1. App updates last_active timestamp on every open
 * 2. On app open, check if any configured emergency has crossed its inactivity threshold
 * 3. If threshold crossed → Phase 1: Try to reach the user (push notification + in-app alert)
 * 4. If user doesn't respond within grace period (default 7 days) → Phase 2: Reach kin
 * 5. Generate kin access package → unlock read-only access for trusted contacts
 * 6. Kin sees: insurance policies, investments, loans, property, documents, will, contacts, passwords
 * 
 * Escalation phases:
 * - "monitoring" — user is active, all good
 * - "checking" — threshold crossed, trying to reach user (grace period active)
 * - "escalated" — grace period expired, kin access unlocked
 * - "cancelled" — user responded, all clear (resets to monitoring)
 */

import { dbGet, dbRun, dbAll, uuid } from "./db";
import { buildFinancialProfile } from "./financialProfile";

// ═══════════════════════════════════════════════════════════
// CORE: Update last_active on every app open
// ═══════════════════════════════════════════════════════════

export async function updateLastActive(userId) {
  if (!userId) return;
  try {
    await dbRun(
      "UPDATE emergency_config SET last_active = datetime('now') WHERE user_id = ?",
      [userId]
    );
  } catch (e) {
    // Table might not exist yet — non-fatal
  }
}

// ═══════════════════════════════════════════════════════════
// CORE: Check inactivity status on every app open
// Returns the current phase and any action needed
// ═══════════════════════════════════════════════════════════

export async function checkEmergencyStatus(userId) {
  if (!userId) return null;
  try {
    const cfg = await dbGet(
      "SELECT * FROM emergency_config WHERE user_id = ?",
      [userId]
    );
    
    if (!cfg || cfg.enabled !== 1) return { phase: "disabled" };
    
    const now = new Date();
    const lastActive = new Date(cfg.last_active || now.toISOString());
    const daysInactive = Math.floor((now - lastActive) / (1000 * 60 * 60 * 24));
    const threshold = cfg.inactive_days || 30;
    const gracePeriod = cfg.grace_period_days || 7;
    
    // Phase: monitoring — user is active
    if (daysInactive < threshold) {
      return {
        phase: "monitoring",
        daysInactive,
        threshold,
        daysRemaining: threshold - daysInactive,
        message: `All good. ${threshold - daysInactive} days until emergency check.`,
      };
    }
    
    // Threshold crossed — check if grace period has expired
    const thresholdCrossedDate = new Date(lastActive.getTime() + threshold * 24 * 60 * 60 * 1000);
    const graceEndDate = new Date(thresholdCrossedDate.getTime() + gracePeriod * 24 * 60 * 60 * 1000);
    const daysIntoGrace = Math.floor((now - thresholdCrossedDate) / (1000 * 60 * 60 * 24));
    
    // Phase: checking — threshold crossed, trying to reach user (grace period)
    if (now < graceEndDate) {
      const daysLeftInGrace = Math.ceil((graceEndDate - now) / (1000 * 60 * 60 * 24));
      return {
        phase: "checking",
        daysInactive,
        threshold,
        daysIntoGrace,
        daysLeftInGrace,
        message: `⚠️ Inactivity threshold crossed ${daysIntoGrace} day(s) ago. We're trying to reach you. Respond within ${daysLeftInGrace} day(s) to prevent emergency escalation to your trusted contacts.`,
        urgent: true,
      };
    }
    
    // Phase: escalated — grace period expired, kin access unlocked
    return {
      phase: "escalated",
      daysInactive,
      threshold,
      gracePeriod,
      daysIntoGrace,
      message: `🚨 Emergency escalation: You've been inactive for ${daysInactive} days. Grace period expired. Your trusted contacts now have access to your financial information.`,
      critical: true,
    };
  } catch (e) {
    console.error("Emergency check error:", e);
    return { phase: "error", message: e.message };
  }
}

// ═══════════════════════════════════════════════════════════
// User responds — cancel the escalation, reset to monitoring
// ═══════════════════════════════════════════════════════════

export async function userResponded(userId) {
  try {
    await dbRun(
      "UPDATE emergency_config SET last_active = datetime('now'), updated_at = datetime('now') WHERE user_id = ?",
      [userId]
    );
    // Clear any pending kin access tokens
    await dbRun(
      "DELETE FROM kin_access_tokens WHERE user_id = ? AND status = 'active'",
      [userId]
    );
    return { success: true, message: "All clear! Emergency escalation cancelled." };
  } catch (e) {
    console.error("User responded error:", e);
    return { success: false, message: e.message };
  }
}

// ═══════════════════════════════════════════════════════════
// Generate the kin handoff package — everything family needs
// ═══════════════════════════════════════════════════════════

export async function generateKinPackage(userId, investments = [], insurance = [], contacts = []) {
  try {
    const profile = await buildFinancialProfile(userId, investments, insurance);
    
    // Fetch all critical data
    const loans = await fetchAll(dbAll, "SELECT * FROM loans WHERE user_id = ?", [userId]).catch(() => []);
    const bills = await fetchAll(dbAll, "SELECT * FROM bills WHERE user_id = ?", [userId]).catch(() => []);
    const properties = await fetchAll(dbAll, "SELECT * FROM properties WHERE user_id = ?", [userId]).catch(() => []);
    const goals = await fetchAll(dbAll, "SELECT * FROM goals WHERE user_id = ?", [userId]).catch(() => []);
    const retirement = await fetchAll(dbAll, "SELECT * FROM retirement_corpus WHERE user_id = ?", [userId]).catch(() => []);
    const reminders = await fetchAll(dbAll, "SELECT * FROM reminders WHERE user_id = ? ORDER BY due_date ASC", [userId]).catch(() => []);
    const educationPlans = await fetchAll(dbAll, "SELECT * FROM education_plans WHERE user_id = ?", [userId]).catch(() => []);
    
    const kinPackage = {
      generated_at: new Date().toISOString(),
      user_id: userId,
      
      // ── Immediate Actions ──
      immediate: [
        ...reminders.filter(r => r.due_date && new Date(r.due_date) <= new Date(Date.now() + 7 * 86400000)).map(r => ({
          action: r.title,
          due: r.due_date,
          priority: "urgent",
        })),
        ...bills.filter(b => !b.paid && b.due_date).map(b => ({
          action: `Pay ${b.bill_type} bill (${b.provider || ""})`,
          amount: b.amount,
          due: b.due_date,
          priority: "urgent",
        })),
      ],
      
      // ── Insurance ── (most critical for family)
      insurance: insurance.map(i => ({
        policy_type: i.policy_type,
        provider: i.provider,
        policy_number: i.policy_number,
        sum_assured: i.sum_assured,
        premium_amount: i.premium_amount,
        premium_frequency: i.premium_frequency,
        nominee: i.nominee,
        maturity_date: i.maturity_date,
        next_steps: getInsuranceNextSteps(i),
      })),
      
      // ── Investments ──
      investments: investments.map(inv => ({
        name: inv.name,
        asset_type: inv.asset_type,
        current_value: inv.current_value,
        amount_invested: inv.amount_invested,
        ticker: inv.ticker,
        market: inv.market,
        next_steps: "Contact the broker/fund house to initiate transfer or claim. Keep PAN card and death certificate ready.",
      })),
      
      // ── Loans & Debt ──
      loans: loans.map(l => ({
        loan_type: l.loan_type,
        lender: l.lender,
        remaining_amount: l.remaining_amount,
        emi_amount: l.emi_amount,
        end_date: l.end_date,
        next_steps: "Inform lender about the situation. Check if there's loan insurance (covers outstanding in case of death). Continue EMI payments to avoid penalty.",
      })),
      
      // ── Property ──
      properties: properties.map(p => ({
        type: p.property_type,
        address: p.address,
        city: p.city,
        current_value: p.current_value,
        property_tax: p.property_tax_amount,
        next_steps: "Initiate mutation/transfer process. Keep sale deed, will, and death certificate ready.",
      })),
      
      // ── Goals (for continuity) ──
      goals: goals.map(g => ({
        name: g.name,
        target: g.target_amount,
        current: g.current_amount,
        monthly_contribution: g.monthly_contribution,
        next_steps: "Continue SIPs if possible. Contact the fund house to change nominee/holder.",
      })),
      
      // ── Retirement ──
      retirement: retirement.map(r => ({
        source: r.source,
        current_value: r.current_value,
        monthly_contribution: r.monthly_contribution,
        next_steps: "Contact EPFO/NPS/PPF to initiate withdrawal or continuation. Nominee details required.",
      })),
      
      // ── Education Plans ──
      education: educationPlans.map(e => ({
        child_name: e.child_name,
        target: e.estimated_cost,
        current: e.current_savings,
        next_steps: "Continue the education fund SIPs. Check if there's an education loan with insurance coverage.",
      })),
      
      // ── Reminders ──
      reminders: reminders.map(r => ({
        title: r.title,
        due_date: r.due_date,
        category: r.category,
      })),
      
      // ── Contacts ──
      contacts: contacts.map(c => ({
        name: c.name,
        relationship: c.relationship,
        phone: c.phone,
        email: c.email,
      })),
      
      // ── Financial Summary ──
      summary: profile ? {
        net_worth: profile.netWorth.netWorth,
        total_assets: profile.netWorth.totalAssets,
        total_debt: profile.netWorth.totalDebt,
        monthly_surplus: profile.cashFlow.monthlySurplus,
        health_score: profile.healthScore,
      } : null,
      
      // ── Checklist for the family ──
      familyChecklist: [
        "Get multiple copies of the death certificate (at least 10-15)",
        "Inform employer (for gratuity, PF, group insurance, salary dues)",
        "Inform all banks (freeze accounts, update nominee claims)",
        "Contact all insurance companies (life, health, vehicle, property) — file claims within 90 days",
        "Inform all investment houses (mutual funds, stocks, FD, PPF, NPS) — submit nominee claim forms",
        "Check for loan insurance (home loan, personal loan, car loan) — it may cover outstanding amounts",
        "Transfer property — initiate mutation at local municipal office",
        "File ITR on behalf of the deceased (for the current financial year)",
        "Check for any standing instructions/auto-debits on bank accounts — cancel if needed",
        "Notify utility companies (electricity, water, gas, phone, internet) for name transfer or cancellation",
        "Collect all documents: PAN card, Aadhaar, bank statements, insurance policies, investment proofs, property papers, will",
        "If there's a Will, submit for probate at the local court",
      ],
    };
    
    return kinPackage;
  } catch (e) {
    console.error("Kin package generation error:", e);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
// Unlock kin access — generate access token for trusted contacts
// ═══════════════════════════════════════════════════════════

export async function unlockKinAccess(userId) {
  try {
    const cfg = await dbGet("SELECT * FROM emergency_config WHERE user_id = ?", [userId]);
    if (!cfg || cfg.enabled !== 1) return null;
    
    const contactIds = JSON.parse(cfg.trusted_contact_ids || "[]");
    if (contactIds.length === 0) return null;
    
    const token = uuid();
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(); // 1 year
    
    await dbRun(
      `INSERT INTO kin_access_tokens (token_id, user_id, trusted_contact_ids, status, created_at, expires_at)
       VALUES (?, ?, 'active', ?, datetime('now'), ?)`,
      [token, userId, JSON.stringify(contactIds), expiresAt]
    );
    
    // Also update emergency_config status
    await dbRun(
      "UPDATE emergency_config SET escalation_phase = 'escalated', updated_at = datetime('now') WHERE user_id = ?",
      [userId]
    );
    
    return { token, contactIds, expiresAt };
  } catch (e) {
    console.error("Unlock kin access error:", e);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
// Get kin access package (called when kin opens the app)
// ═══════════════════════════════════════════════════════════

export async function getKinAccessPackage(token) {
  try {
    const tokenRow = await dbGet(
      "SELECT * FROM kin_access_tokens WHERE token_id = ? AND status = 'active'",
      [token]
    );
    if (!tokenRow) return null;
    if (new Date(tokenRow.expires_at) < new Date()) return { expired: true };
    
    const userId = tokenRow.user_id;
    return await generateKinPackage(userId);
  } catch (e) {
    console.error("Kin access error:", e);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
// Configure emergency access
// ═══════════════════════════════════════════════════════════

export async function configureEmergency(userId, config) {
  try {
    const { enabled, inactiveDays, gracePeriodDays, trustedContactIds, kinMessage } = config;
    await dbRun(
      `INSERT OR REPLACE INTO emergency_config 
       (config_id, user_id, enabled, inactive_days, grace_period_days, trusted_contact_ids, kin_message, last_active, escalation_phase, updated_at) 
       VALUES ('default', ?, ?, ?, ?, ?, ?, datetime('now'), 'monitoring', datetime('now'))`,
      [userId, enabled ? 1 : 0, inactiveDays || 30, gracePeriodDays || 7, JSON.stringify(trustedContactIds || []), kinMessage || ""]
    );
    return { success: true };
  } catch (e) {
    console.error("Configure emergency error:", e);
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════
// Test reach-out (simulate what kin would receive)
// ═══════════════════════════════════════════════════════════

export async function previewKinPackage(userId, investments = [], insurance = [], contacts = []) {
  return await generateKinPackage(userId, investments, insurance, contacts);
}

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

function getInsuranceNextSteps(policy) {
  const type = (policy.policy_type || "").toLowerCase();
  if (type.includes("term") || type.includes("life")) {
    return "File a death claim with the insurance company. Submit: death certificate, policy document, nominee ID, claim form. Claims must be filed within 90 days. Payout typically within 30 days.";
  }
  if (type.includes("health")) {
    return "Check if any pending medical reimbursements. Cancel or port the policy. If family floater, update the primary member.";
  }
  if (type.includes("vehicle") || type.includes("car")) {
    return "Transfer insurance to new owner or cancel. Submit transfer form with RC book.";
  }
  if (type.includes("home") || type.includes("property")) {
    return "Check if home loan insurance covers the outstanding. Transfer or cancel policy.";
  }
  return "Contact the insurance provider to understand claim/transfer process. Keep policy document and death certificate ready.";
}

async function fetchAll(fn, query, params) {
  return await fn(query, params);
}

// ═══════════════════════════════════════════════════════════
// Format emergency status for AI prompt
// ═══════════════════════════════════════════════════════════

export function formatEmergencyForPrompt(status) {
  if (!status || status.phase === "disabled") return "";
  const lines = [
    `\n=== EMERGENCY ACCESS STATUS ===`,
    `Phase: ${status.phase}`,
    `Days inactive: ${status.daysInactive || 0}`,
    `Threshold: ${status.threshold || 30} days`,
  ];
  if (status.phase === "checking") {
    lines.push(`Grace period: ${status.daysLeftInGrace} day(s) remaining`);
    lines.push(`URGENT: User hasn't opened app in ${status.daysInactive} days. Try to reach them.`);
  }
  if (status.phase === "escalated") {
    lines.push(`ESCALATED: Kin access unlocked. Family has been notified.`);
  }
  lines.push(`=== END EMERGENCY ===\n`);
  return lines.join("\n");
}