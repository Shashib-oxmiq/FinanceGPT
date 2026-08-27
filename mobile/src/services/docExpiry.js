// ── Document Expiry Tracking Service ──────────────────────────────────────────
// Tracks expiry dates of passports, driving licenses, insurance policies,
// vehicle registration, and other time-sensitive documents.
// Generates proactive alerts before expiry.

import { api } from "./api";
import { Platform } from "react-native";

const EXPIRY_TYPES = {
  passport: { label: "Passport", default_validity_years: 10, alert_days: 180, icon: "airplane" },
  driving_license: { label: "Driving License", default_validity_years: 20, alert_days: 90, icon: "car" },
  vehicle_registration: { label: "Vehicle Registration (RC)", default_validity_years: 15, alert_days: 60, icon: "car-sport" },
  insurance_policy: { label: "Insurance Policy", default_validity_years: 1, alert_days: 30, icon: "shield-checkmark" },
  health_policy: { label: "Health Insurance", default_validity_years: 1, alert_days: 30, icon: "medkit" },
  pollution_cert: { label: "Pollution Certificate (PUC)", default_validity_years: 1, alert_days: 15, icon: "leaf" },
  trade_license: { label: "Trade License", default_validity_years: 5, alert_days: 60, icon: "briefcase" },
  gst_reg: { label: "GST Registration", default_validity_years: 99, alert_days: 0, icon: "receipt" },
  fssai: { label: "FSSAI License", default_validity_years: 5, alert_days: 60, icon: "nutrition" },
  passport_renewal: { label: "Passport Renewal", default_validity_years: 10, alert_days: 180, icon: "airplane" },
  visa: { label: "Visa", default_validity_years: 1, alert_days: 60, icon: "globe" },
  aadhaar_lock: { label: "Aadhaar Biometric Lock Check", default_validity_years: 99, alert_days: 365, icon: "lock-closed" },
};

export function getExpiryTypes() {
  return Object.entries(EXPIRY_TYPES).map(([key, val]) => ({ key, ...val }));
}

// ── Get documents with expiry info ──
// Scans vault documents and insurance policies for expiry dates
export async function getDocumentExpiries(userId) {
  let documents = [];
  let insurance = [];

  try {
    documents = await api.getDocuments(userId);
    insurance = await api.getInsurance(userId);
  } catch (e) { /* non-fatal */ }

  const expiries = [];
  const now = new Date();
  const ALERT_DAYS = 180; // max alert window

  // Check insurance policies
  for (const policy of insurance) {
    if (policy.maturity_date || policy.renewal_date || policy.end_date) {
      const dateStr = policy.maturity_date || policy.renewal_date || policy.end_date;
      const expiry = new Date(dateStr);
      if (!isNaN(expiry.getTime())) {
        const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
        if (daysLeft <= ALERT_DAYS) {
          expiries.push({
            id: policy.insurance_id || policy.policy_id,
            type: "insurance_policy",
            label: `${policy.policy_type || "Insurance"} — ${policy.provider || ""}`,
            expiryDate: dateStr,
            daysLeft,
            urgency: getUrgency(daysLeft),
            action: daysLeft < 0 ? "EXPIRED — Renew immediately" : `Renew within ${daysLeft} days`,
          });
        }
      }
    }
  }

  // Check vault documents for expiry keywords
  for (const doc of documents) {
    const name = (doc.original_filename || "").toLowerCase();
    const meta = (doc.metadata || "").toLowerCase();

    for (const [typeKey, typeInfo] of Object.entries(EXPIRY_TYPES)) {
      const keywords = typeKey.split("_");
      const matches = keywords.some(k => name.includes(k) || meta.includes(k));

      if (matches && doc.expiry_date) {
        const expiry = new Date(doc.expiry_date);
        if (!isNaN(expiry.getTime())) {
          const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
          if (daysLeft <= typeInfo.alert_days) {
            expiries.push({
              id: doc.document_id,
              type: typeKey,
              label: `${typeInfo.label} — ${doc.original_filename}`,
              expiryDate: doc.expiry_date,
              daysLeft,
              urgency: getUrgency(daysLeft),
              action: daysLeft < 0 ? `EXPIRED — ${getRenewalAction(typeKey)}` : `${getRenewalAction(typeKey)} within ${daysLeft} days`,
            });
          }
        }
      }
    }
  }

  // Sort by days left (most urgent first)
  expiries.sort((a, b) => a.daysLeft - b.daysLeft);

  return expiries;
}

function getUrgency(daysLeft) {
  if (daysLeft < 0) return "expired";
  if (daysLeft <= 15) return "critical";
  if (daysLeft <= 60) return "high";
  if (daysLeft <= 90) return "medium";
  return "low";
}

function getRenewalAction(type) {
  const actions = {
    passport: "Renew passport at passportindia.gov.in",
    driving_license: "Renew DL at RTO or Parivahan portal",
    vehicle_registration: "Renew RC at RTO",
    insurance_policy: "Renew insurance policy",
    health_policy: "Renew health insurance",
    pollution_cert: "Get new PUC at any pollution check center",
    trade_license: "Renew trade license at municipal office",
    fssai: "Renew FSSAI license at foscos.fssai.gov.in",
    visa: "Apply for visa renewal",
  };
  return actions[type] || "Renew this document";
}

export function getUrgencyColor(urgency) {
  const colors = {
    expired: "#ef4444",
    critical: "#ef4444",
    high: "#f59e0b",
    medium: "#3b82f6",
    low: "#10b981",
  };
  return colors[urgency] || "#6b7280";
}

// ── Auto-create reminders for critical expiries ──
export async function autoCreateExpiryReminders(userId, expiries) {
  const critical = expiries.filter(e => e.urgency === "expired" || e.urgency === "critical" || e.urgency === "high");
  for (const exp of critical) {
    try {
      await api.addReminder(userId, {
        title: `Document Expiry: ${exp.label}`,
        due_date: exp.expiryDate,
        priority: exp.urgency === "expired" || exp.urgency === "critical" ? "high" : "medium",
        category: "document_renewal",
        notes: exp.action,
      });
    } catch (e) { /* may already exist */ }
  }
}