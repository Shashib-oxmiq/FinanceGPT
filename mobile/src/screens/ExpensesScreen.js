import React, { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { getExpenses, createExpense, deleteExpense, getMonthlySummary, pickReceiptImage, extractExpenseFromReceipt } from "../services/expenses";
import { theme, formatMoney } from "../theme";
import PanelChat from "../components/PanelChat";

const CATEGORIES = ["Groceries", "Fuel", "Dining", "Medical", "Shopping", "Transport", "Utilities", "Other"];
const CAT_COLORS = {
  Groceries: "#10b981", Fuel: "#f59e0b", Dining: "#ec4899", Medical: "#ef4444",
  Shopping: "#8b5cf6", Transport: "#3b82f6", Utilities: "#06b6d4", Other: "#6b7280",
};

export default function ExpensesScreen({ navigation }) {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualForm, setManualForm] = useState({ amount: "", category: "Other", merchant: "" });

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const e = await getExpenses(user.user_id);
      setExpenses(e);
      const s = await getMonthlySummary(user.user_id);
      setSummary(s);
    } catch (err) { console.error(err); }
  }, [user]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const handleScan = async () => {
    setScanning(true);
    try {
      const result = await pickReceiptImage();
      if (result.canceled) { setScanning(false); return; }

      // Try AI extraction
      const extracted = await extractExpenseFromReceipt(user, result.uri);
      if (extracted && extracted.amount > 0) {
        await createExpense(user.user_id, {
          amount: extracted.amount,
          category: extracted.category,
          merchant: extracted.merchant,
          date: extracted.date,
          receipt_uri: result.uri,
        });
        Alert.alert("Receipt Scanned!", `${extracted.merchant}: ${formatMoney(extracted.amount)} (${extracted.category})`);
        await load();
      } else {
        // Fallback: manual entry with the image
        Alert.alert("Couldn't read receipt", "Please enter the details manually", [
          { text: "OK", onPress: () => setShowManual(true) },
        ]);
      }
    } catch (e) {
      Alert.alert("Error", e.message);
    }
    setScanning(false);
  };

  const handleManualSave = async () => {
    const amt = parseFloat(manualForm.amount);
    if (isNaN(amt) || amt <= 0) { Alert.alert("Invalid amount"); return; }
    await createExpense(user.user_id, { amount: amt, category: manualForm.category, merchant: manualForm.merchant });
    setManualForm({ amount: "", category: "Other", merchant: "" });
    setShowManual(false);
    await load();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Expenses</Text>
        <TouchableOpacity onPress={handleScan} disabled={scanning}>
          {scanning ? <ActivityIndicator size="small" color={theme.primary} /> : <Ionicons name="camera" size={26} color={theme.primary} />}
        </TouchableOpacity>
      </View>

      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}>
        {/* Monthly summary */}
        {summary && (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>This Month</Text>
            <Text style={styles.summaryTotal}>{formatMoney(summary.thisMonth.total)}</Text>
            <View style={styles.catBreakdown}>
              {Object.entries(summary.byCategory)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([cat, amt]) => (
                  <View key={cat} style={styles.catRow}>
                    <View style={[styles.catDot, { backgroundColor: CAT_COLORS[cat] || "#6b7280" }]} />
                    <Text style={styles.catName}>{cat}</Text>
                    <Text style={styles.catAmt}>{formatMoney(amt)}</Text>
                  </View>
                ))}
            </View>
          </View>
        )}

        {/* Add manual button */}
        <TouchableOpacity style={styles.manualBtn} onPress={() => setShowManual(!showManual)}>
          <Ionicons name="create" size={18} color={theme.primary} />
          <Text style={styles.manualBtnText}>Add expense manually</Text>
        </TouchableOpacity>

        {showManual && (
          <View style={styles.manualForm}>
            <TextInput style={styles.input} placeholder="Amount (₹)" keyboardType="numeric" value={manualForm.amount} onChangeText={(v) => setManualForm({ ...manualForm, amount: v })} />
            <TextInput style={styles.input} placeholder="Merchant" value={manualForm.merchant} onChangeText={(v) => setManualForm({ ...manualForm, merchant: v })} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity key={cat} style={[styles.catChip, manualForm.category === cat && styles.catChipActive]} onPress={() => setManualForm({ ...manualForm, category: cat })}>
                  <Text style={[styles.catChipText, manualForm.category === cat && styles.catChipTextActive]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.saveBtn} onPress={handleManualSave}>
              <Text style={styles.saveBtnText}>Save Expense</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Expense list */}
        <Text style={styles.listTitle}>Recent Expenses</Text>
        {expenses.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="receipt" size={48} color={theme.muted} />
            <Text style={styles.emptyText}>No expenses tracked yet</Text>
            <Text style={styles.emptySub}>Tap the camera icon to scan a receipt</Text>
          </View>
        ) : (
          expenses.map((e) => (
            <View key={e.expense_id} style={styles.expenseItem}>
              <View style={[styles.expenseIcon, { backgroundColor: (CAT_COLORS[e.category] || "#6b7280") + "20" }]}>
                <Ionicons name="receipt" size={16} color={CAT_COLORS[e.category] || "#6b7280"} />
              </View>
              <View style={styles.expenseInfo}>
                <Text style={styles.expenseMerchant}>{e.merchant || e.category}</Text>
                <Text style={styles.expenseMeta}>{e.category} • {e.date}</Text>
              </View>
              <Text style={styles.expenseAmount}>{formatMoney(e.amount)}</Text>
              <TouchableOpacity onPress={() => { deleteExpense(e.expense_id); load(); }}>
                <Ionicons name="trash-outline" size={16} color={theme.muted} />
              </TouchableOpacity>
            </View>
          ))
        )}

        <View style={{ paddingBottom: 16 }}>
          <PanelChat context="Expenses" title="Ask AI about your spending" />
        </View>
      </ScrollView>
    </View>
  );
}

// Need TextInput import
import { TextInput } from "react-native";

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 60, paddingBottom: 12 },
  title: { fontSize: 22, fontWeight: "800", color: theme.text },
  summaryCard: { marginHorizontal: 16, marginTop: 8, backgroundColor: theme.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: theme.border },
  summaryTitle: { fontSize: 12, color: theme.muted, textTransform: "uppercase", letterSpacing: 1 },
  summaryTotal: { fontSize: 28, fontWeight: "800", color: theme.text, marginTop: 4 },
  catBreakdown: { marginTop: 14, gap: 8 },
  catRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  catDot: { width: 10, height: 10, borderRadius: 5 },
  catName: { flex: 1, fontSize: 13, color: theme.text },
  catAmt: { fontSize: 13, fontWeight: "600", color: theme.text },
  manualBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginHorizontal: 16, marginTop: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: theme.primary + "40" },
  manualBtnText: { fontSize: 13, color: theme.primary, fontWeight: "600" },
  manualForm: { marginHorizontal: 16, marginTop: 12, backgroundColor: theme.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: theme.border, gap: 8 },
  input: { backgroundColor: theme.background, borderRadius: 10, padding: 10, fontSize: 15, color: theme.text, borderWidth: 1, borderColor: theme.border },
  catScroll: { flexDirection: "row" },
  catChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: theme.border, marginRight: 8 },
  catChipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  catChipText: { fontSize: 12, color: theme.textSecondary },
  catChipTextActive: { color: "#fff", fontWeight: "600" },
  saveBtn: { backgroundColor: theme.primary, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  listTitle: { fontSize: 16, fontWeight: "700", color: theme.text, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10 },
  emptyState: { alignItems: "center", paddingVertical: 40 },
  emptyText: { fontSize: 16, fontWeight: "600", color: theme.muted, marginTop: 12 },
  emptySub: { fontSize: 13, color: theme.muted, marginTop: 4 },
  expenseItem: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 16, marginBottom: 8, backgroundColor: theme.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: theme.border },
  expenseIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: "center", alignItems: "center" },
  expenseInfo: { flex: 1 },
  expenseMerchant: { fontSize: 14, fontWeight: "600", color: theme.text },
  expenseMeta: { fontSize: 12, color: theme.muted, marginTop: 2 },
  expenseAmount: { fontSize: 15, fontWeight: "700", color: theme.text },
});