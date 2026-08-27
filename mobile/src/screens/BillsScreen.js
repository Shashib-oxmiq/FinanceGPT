import React, { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Modal, TextInput, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { getBills, createBill, markBillPaid, deleteBill, getBillSummary, BILL_TYPES } from "../services/bills";
import { theme, formatMoney } from "../theme";
import PanelChat from "../components/PanelChat";

export default function BillsScreen({ navigation }) {
  const { user } = useAuth();
  const [bills, setBills] = useState([]);
  const [summary, setSummary] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ bill_type: "electricity", provider: "", amount: "", due_date: "" });

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const b = await getBills(user.user_id);
      setBills(b);
      const s = await getBillSummary(user.user_id);
      setSummary(s);
    } catch (e) { console.error(e); }
  }, [user]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const handleAdd = async () => {
    if (!form.amount) { Alert.alert("Enter amount"); return; }
    await createBill(user.user_id, { ...form, amount: parseFloat(form.amount) });
    setForm({ bill_type: "electricity", provider: "", amount: "", due_date: "" });
    setShowAdd(false);
    await load();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Bills & Utilities</Text>
        <TouchableOpacity onPress={() => setShowAdd(true)}>
          <Ionicons name="add-circle" size={28} color={theme.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}>
        {summary && (
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryStat}>
                <Text style={[styles.summaryVal, { color: "#ef4444" }]}>{formatMoney(summary.totalUnpaid)}</Text>
                <Text style={styles.summaryLabel}>Unpaid</Text>
              </View>
              <View style={styles.summaryStat}>
                <Text style={[styles.summaryVal, { color: theme.accent }]}>{formatMoney(summary.totalPaid)}</Text>
                <Text style={styles.summaryLabel}>Paid</Text>
              </View>
            </View>
            {summary.overdue.length > 0 && (
              <View style={styles.alertRow}>
                <Ionicons name="warning" size={14} color="#ef4444" />
                <Text style={styles.alertText}>{summary.overdue.length} bill{summary.overdue.length > 1 ? "s" : ""} overdue!</Text>
              </View>
            )}
            {summary.dueSoon.length > 0 && (
              <View style={styles.alertRow}>
                <Ionicons name="time" size={14} color="#f59e0b" />
                <Text style={[styles.alertText, { color: "#f59e0b" }]}>{summary.dueSoon.length} due within 7 days</Text>
              </View>
            )}
          </View>
        )}

        {bills.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="receipt" size={48} color={theme.muted} />
            <Text style={styles.emptyTitle}>No bills tracked</Text>
            <Text style={styles.emptySub}>Track electricity, water, gas, phone, internet, rent — all in one place</Text>
          </View>
        )}

        {bills.map((bill) => {
          const typeInfo = BILL_TYPES.find(t => t.key === bill.bill_type) || BILL_TYPES[10];
          const isOverdue = !bill.paid && bill.due_date && new Date(bill.due_date) < new Date();
          return (
            <View key={bill.bill_id} style={[styles.billCard, isOverdue && { borderLeftColor: "#ef4444", borderLeftWidth: 4 }]}>
              <View style={styles.billHeader}>
                <View style={[styles.billIcon, { backgroundColor: typeInfo.color + "20" }]}>
                  <Ionicons name={typeInfo.icon} size={18} color={typeInfo.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.billType}>{typeInfo.label}</Text>
                  <Text style={styles.billProvider}>{bill.provider || ""}</Text>
                </View>
                {bill.paid ? (
                  <View style={styles.paidBadge}><Ionicons name="checkmark" size={12} color="#fff" /><Text style={styles.paidText}>Paid</Text></View>
                ) : (
                  <TouchableOpacity style={styles.payBtn} onPress={async () => { await markBillPaid(bill.bill_id); await load(); }}>
                    <Text style={styles.payBtnText}>Mark Paid</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.billStats}>
                <Text style={styles.billAmount}>{formatMoney(bill.amount)}</Text>
                {bill.due_date && <Text style={[styles.billDue, isOverdue && { color: "#ef4444" }]}>{isOverdue ? "Overdue: " : "Due: "}{bill.due_date}</Text>}
              </View>
              <TouchableOpacity style={styles.deleteBtn} onPress={() => { deleteBill(bill.bill_id); load(); }}>
                <Ionicons name="trash-outline" size={14} color={theme.muted} />
              </TouchableOpacity>
            </View>
          );
        })}

        <View style={{ paddingBottom: 16 }}>
          <PanelChat context="Bills" title="Ask AI about your bills" />
        </View>
      </ScrollView>

      <Modal visible={showAdd} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Bill</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {BILL_TYPES.map((t) => (
                <TouchableOpacity key={t.key} style={[styles.typeChip, form.bill_type === t.key && { backgroundColor: t.color, borderColor: t.color }]} onPress={() => setForm({ ...form, bill_type: t.key })}>
                  <Ionicons name={t.icon} size={12} color={form.bill_type === t.key ? "#fff" : theme.muted} />
                  <Text style={[styles.typeChipText, form.bill_type === t.key && { color: "#fff" }]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TextInput style={styles.input} placeholder="Provider (e.g. BSES, Airtel)" value={form.provider} onChangeText={(v) => setForm({ ...form, provider: v })} />
            <TextInput style={styles.input} placeholder="Amount (₹)" keyboardType="numeric" value={form.amount} onChangeText={(v) => setForm({ ...form, amount: v })} />
            <TextInput style={styles.input} placeholder="Due date (YYYY-MM-DD)" value={form.due_date} onChangeText={(v) => setForm({ ...form, due_date: v })} />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAdd(false)}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleAdd}><Text style={styles.saveText}>Save</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 60, paddingBottom: 12 },
  title: { fontSize: 22, fontWeight: "800", color: theme.text, flex: 1, marginLeft: 12 },
  summaryCard: { marginHorizontal: 16, marginTop: 8, backgroundColor: theme.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: theme.border },
  summaryRow: { flexDirection: "row", justifyContent: "space-around" },
  summaryStat: { alignItems: "center" },
  summaryVal: { fontSize: 22, fontWeight: "800" },
  summaryLabel: { fontSize: 11, color: theme.muted, marginTop: 2, textTransform: "uppercase" },
  alertRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 },
  alertText: { fontSize: 13, color: "#ef4444", fontWeight: "600" },
  emptyState: { alignItems: "center", paddingVertical: 50, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: theme.text, marginTop: 16 },
  emptySub: { fontSize: 13, color: theme.muted, marginTop: 8, textAlign: "center" },
  billCard: { marginHorizontal: 16, marginBottom: 10, backgroundColor: theme.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: theme.border },
  billHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  billIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: "center", alignItems: "center" },
  billType: { fontSize: 15, fontWeight: "700", color: theme.text },
  billProvider: { fontSize: 12, color: theme.muted, marginTop: 2 },
  paidBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: theme.accent, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  paidText: { fontSize: 11, color: "#fff", fontWeight: "600" },
  payBtn: { backgroundColor: theme.primary + "20", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  payBtnText: { fontSize: 12, color: theme.primary, fontWeight: "600" },
  billStats: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.border },
  billAmount: { fontSize: 18, fontWeight: "800", color: theme.text },
  billDue: { fontSize: 12, color: theme.muted },
  deleteBtn: { position: "absolute", top: 10, right: 10 },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  modalContent: { backgroundColor: theme.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, maxHeight: "90%" },
  modalTitle: { fontSize: 20, fontWeight: "800", color: theme.text, marginBottom: 12 },
  typeChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: theme.border, marginRight: 6 },
  typeChipText: { fontSize: 11, color: theme.textSecondary },
  input: { backgroundColor: theme.background, borderRadius: 10, padding: 10, fontSize: 15, color: theme.text, marginBottom: 8, borderWidth: 1, borderColor: theme.border },
  modalBtns: { flexDirection: "row", gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center", borderWidth: 1, borderColor: theme.border },
  cancelText: { fontSize: 16, color: theme.muted, fontWeight: "600" },
  saveBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center", backgroundColor: theme.primary },
  saveText: { fontSize: 16, color: "#fff", fontWeight: "700" },
});