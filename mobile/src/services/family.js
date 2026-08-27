// ── Family Vault Service ──────────────────────────────────────────────────────
// Scoped access for family members: spouse, parent, CA/tax advisor.
// Each member gets their own login with limited visibility.

import { dbAll, dbRun, uuid } from "./db";

export async function getFamilyMembers(userId) {
  const rows = await dbAll("SELECT * FROM family_members WHERE user_id = ? ORDER BY invited_at DESC", [userId]);
  return rows || [];
}

export async function addFamilyMember(userId, { name, email, phone, relationship, access_scope = "view" }) {
  const id = uuid();
  await dbRun(
    "INSERT INTO family_members (member_id, user_id, name, email, phone, relationship, access_scope) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [id, userId, name, email || "", phone || "", relationship || "Family", access_scope]
  );
  return { member_id: id, name, email, phone, relationship, access_scope };
}

export async function updateFamilyMember(memberId, updates) {
  const fields = [];
  const vals = [];
  for (const [k, v] of Object.entries(updates)) {
    if (["name", "email", "phone", "relationship", "access_scope"].includes(k)) {
      fields.push(`${k} = ?`);
      vals.push(v);
    }
  }
  if (fields.length === 0) return;
  vals.push(memberId);
  await dbRun(`UPDATE family_members SET ${fields.join(", ")} WHERE member_id = ?`, vals);
}

export async function removeFamilyMember(memberId) {
  await dbRun("DELETE FROM family_members WHERE member_id = ?", [memberId]);
}

// ── Scope definitions ──
export const ACCESS_SCOPES = {
  full: { label: "Full Access", description: "Can see everything: investments, insurance, vault, reminders", color: "#ef4444" },
  spouse: { label: "Spouse", description: "Investments, insurance, vault, can add documents", color: "#10b981" },
  parent: { label: "Parent/Elder", description: "Insurance policies and emergency contacts only", color: "#3b82f6" },
  advisor: { label: "CA/Tax Advisor", description: "Tax documents and investment summaries only", color: "#8b5cf6" },
  view: { label: "View Only", description: "Can see shared documents only", color: "#6b7280" },
};

export function getScopeLabel(scope) {
  return ACCESS_SCOPES[scope]?.label || "Custom";
}

export function getScopeDescription(scope) {
  return ACCESS_SCOPES[scope]?.description || "Limited access";
}