// ── Bill & Utility Tracker Service (F-209) ───────────────────────────────────
import { dbAll, dbRun, uuid } from "./db";

export async function getBills(userId) {
  return await dbAll("SELECT * FROM bills WHERE user_id = ? ORDER BY due_date ASC", [userId]) || [];
}
export async function createBill(userId, d) {
  const id = uuid();
  await dbRun("INSERT INTO bills (bill_id, user_id, bill_type, provider, amount, due_date, paid, recurring, recurrence, account_number, notes) VALUES (?,?,?,?,?,?,0,?,?,?,?)",
    [id, userId, d.bill_type, d.provider||"", d.amount, d.due_date, d.recurring!==false?1:0, d.recurrence||"monthly", d.account_number||"", d.notes||""]);
  return { bill_id: id, ...d, paid: 0 };
}
export async function markBillPaid(billId, paidDate) {
  await dbRun("UPDATE bills SET paid=1, paid_date=? WHERE bill_id=?", [paidDate || new Date().toISOString().split("T")[0], billId]);
}
export async function deleteBill(billId) { await dbRun("DELETE FROM bills WHERE bill_id=?", [billId]); }

export async function getBillSummary(userId) {
  const bills = await getBills(userId);
  const unpaid = bills.filter(b => !b.paid);
  const totalUnpaid = unpaid.reduce((s,b) => s + (Number(b.amount)||0), 0);
  const paid = bills.filter(b => b.paid);
  const totalPaid = paid.reduce((s,b) => s + (Number(b.amount)||0), 0);
  const now = new Date();
  const overdue = unpaid.filter(b => b.due_date && new Date(b.due_date) < now);
  const dueSoon = unpaid.filter(b => b.due_date && new Date(b.due_date) >= now && (new Date(b.due_date) - now) / (1000*60*60*24) <= 7);
  const byType = {};
  for (const b of bills) { byType[b.bill_type] = (byType[b.bill_type]||0) + (Number(b.amount)||0); }
  return { bills, unpaid, totalUnpaid, totalPaid, overdue, dueSoon, byType };
}

export const BILL_TYPES = [
  { key: "electricity", label: "Electricity", icon: "flash", color: "#f59e0b" },
  { key: "water", label: "Water", icon: "water", color: "#3b82f6" },
  { key: "gas", label: "Gas (LPG/PNG)", icon: "flame", color: "#ef4444" },
  { key: "phone", label: "Mobile/Phone", icon: "call", color: "#10b981" },
  { key: "internet", label: "Internet/Broadband", icon: "wifi", color: "#8b5cf6" },
  { key: "dth", label: "DTH/Cable TV", icon: "tv", color: "#ec4899" },
  { key: "rent", label: "House Rent", icon: "home", color: "#06b6d4" },
  { key: "society", label: "Society/Maintenance", icon: "business", color: "#6b7280" },
  { key: "insurance_premium", label: "Insurance Premium", icon: "shield-checkmark", color: "#14b8a6" },
  { key: "loan_emi", label: "Loan EMI", icon: "cash", color: "#f97316" },
  { key: "other", label: "Other", icon: "ellipsis-circle", color: "#94a3b8" },
];