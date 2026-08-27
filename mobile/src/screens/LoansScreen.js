import React, { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Modal, TextInput, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { getLoans, createLoan, deleteLoan, getDebtSummary, LOAN_TYPES } from "../services/loans";
import { theme, formatMoney } from "../theme";
import PanelChat from "../components/PanelChat";

export default function LoansScreen({ navigation }) {
  const { user } = useAuth();
  const [loans, setLoans] = useState([]);
  const [summary, setSummary] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ loan_type: "personal", lender: "", principal: "", interest_rate: "", tenure_months: "", start_date: "" });

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const l = await getLoans(user.user_id);
      setLoans(l);
      const s = await getDebtSummary(user.user_id, user?.profile?.income ? user.profile.income / 12 : 50000);
      setSummary(s);
    } catch (e) { console.error(e); }
  }, [user]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const handleAdd = async () => {
    if (!form.principal) { Alert.alert("Enter loan amount"); return; }
    await createLoan(user.user_id, {
      ...form,
      principal: parseFloat(form.principal),
      interest_rate: parseFloat(form.interest_rate) || 0,
      tenure_months: parseInt(form.tenure_months) || 0,
    });
    setForm({ loan_type: "personal", lender: "", principal: "", interest_rate: "", tenure_months: "", start_date: "" });
    setShowAdd(false);
    await load();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Loans & Credit</Text>
        <TouchableOpacity onPress={() => setShowAdd(true)}>
          <Ionicons name="add-circle" size={28} color={theme.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}>
        {/* DTI gauge */}
        {summary && (
          <View style={styles.dtiCard}>
            <Text style={styles.dtiLabel}>Debt-to-Income Ratio</Text>
            <Text style={[styles.dtiValue, { color: summary.isCritical ? "#ef4444" : summary.isRisky ? "#f59e0b" : theme.accent }]}>
              {summary.dti}%
            </Text>
            <View style={styles.dtiBar}>
              <View style={[styles.dtiFill, { width: `${Math.min(100, summary.dti)}%`, backgroundColor: summary.isCritical ? "#ef4444" : summary.isRisky ? "#f59e0b" : theme.accent }]} />
            </View>
            <Text style={styles.dtiStatus}>
              {summary.isCritical ? "⚠️ Critical — EMIs exceed 50% of income" : summary.isRisky ? "⚠️ High — EMIs exceed 40% of income" : "✓ Healthy — EMIs under 40%"}
            </Text>
            <View style={styles.dtiRow}>
              <View style={styles.dtiStat}><Text style={styles.dtiStatVal}>{formatMoney(summary.totalEMI)}</Text><Text style={styles.dtiStatLabel}>Monthly EMIs</Text></View>
              <View style={styles.dtiStat}><Text style={styles.dtiStatVal}>{formatMoney(summary.totalDebt)}</Text><Text style={styles.dtiStatLabel}>Total Debt</Text></View>
            </View>
          </View>
        )}

        {/* Refinance suggestions */}
        {summary?.refinanceSuggestions?.length > 0 && (
          <View style={styles.refinanceCard}>
            <Ionicons name="swap-horizontal" size={20} color="#10b981" />
            <View style={{ flex: 1 }}>
              <Text style={styles.refinanceTitle}>Refinance Opportunity</Text>
              <Text style={styles.refinanceText}>
                {summary.refinanceSuggestions[0].loan.loan_type} at {summary.refinanceSuggestions[0].currentRate}% → {summary.refinanceSuggestions[0].suggestedRate}%.
                Save ~{formatMoney(summary.refinanceSuggestions[0].savings)}/year.
              </Text>
            </View>
          </View>
        )}

        {loans.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="card" size={48} color={theme.muted} />
            <Text style={styles.emptyTitle}>No loans tracked</Text>
            <Text style={styles.emptySub}>Track EMIs, monitor debt-to-income, get refinance alerts</Text>
          </View>
        )}

        {loans.map((loan) => {
          const typeInfo = LOAN_TYPES.find(t => t.key === loan.loan_type) || LOAN_TYPES[7];
          return (
            <View key={loan.loan_id} style={styles.loanCard}>
              <View style={styles.loanHeader}>
                <View style={[styles.loanIcon, { backgroundColor: typeInfo.color + "20" }]}>
                  <Ionicons name={typeInfo.icon} size={18} color={typeInfo.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.loanType}>{typeInfo.label}</Text>
                  <Text style={styles.loanLender}>{loan.lender || "Unknown lender"}</Text>
                </View>
                <TouchableOpacity onPress={() => { Alert.alert("Close loan?", "Mark as closed?", [{ text: "Cancel" }, { text: "Close", onPress: async () => { await deleteLoan(loan.loan_id); await load(); } }]); }}>
                  <Ionicons name="trash-outline" size={16} color={theme.muted} />
                </TouchableOpacity>
              </View>
              <View style={styles.loanStats}>
                <View style={styles.loanStat}><Text style={styles.loanStatVal}>{formatMoney(loan.emi_amount)}</Text><Text style={styles.loanStatLabel}>EMI/mo</Text></View>
                <View style={styles.loanStat}><Text style={styles.loanStatVal}>{formatMoney(loan.remaining_amount)}</Text><Text style={styles.loanStatLabel}>Remaining</Text></View>
                <View style={styles.loanStat}><Text style={styles.loanStatVal}>{loan.interest_rate}%</Text><Text style={styles.loanStatLabel}>Rate</Text></View>
              </View>
              {loan.end_date && <Text style={styles.loanEnd}> Ends: {loan.end_date}</Text>}
            </View>
          );
        })}

        <View style={{ paddingBottom: 16 }}>
          <PanelChat context="Loans" title="Ask AI about debt management" />
        </View>
      </ScrollView>

      <Modal visible={showAdd} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Loan / Credit</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {LOAN_TYPES.map((t) => (
                <TouchableOpacity key={t.key} style={[styles.typeChip, form.loan_type === t.key && { backgroundColor: t.color, borderColor: t.color }]} onPress={() => setForm({ ...form, loan_type: t.key })}>
                  <Ionicons name={t.icon} size={12} color={form.loan_type === t.key ? "#fff" : theme.muted} />
                  <Text style={[styles.typeChipText, form.loan_type === t.key && { color: "#fff" }]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TextInput style={styles.input} placeholder="Lender (bank name)" value={form.lender} onChangeText={(v) => setForm({ ...form, lender: v })} />
            <TextInput style={styles.input} placeholder="Principal amount (₹)" keyboardType="numeric" value={form.principal} onChangeText={(v) => setForm({ ...form, principal: v })} />
            <View style={styles.inputRow}>
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="Interest rate %" keyboardType="numeric" value={form.interest_rate} onChangeText={(v) => setForm({ ...form, interest_rate: v })} />
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="Tenure (months)" keyboardType="numeric" value={form.tenure_months} onChangeText={(v) => setForm({ ...form, tenure_months: v })} />
            </View>
            <TextInput style={styles.input} placeholder="Start date (YYYY-MM-DD)" value={form.start_date} onChangeText={(v) => setForm({ ...form, start_date: v })} />
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
  dtiCard: { marginHorizontal: 16, marginTop: 8, backgroundColor: theme.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: theme.border, alignItems: "center" },
  dtiLabel: { fontSize: 12, color: theme.muted, textTransform: "uppercase", letterSpacing: 1 },
  dtiValue: { fontSize: 36, fontWeight: "800" },
  dtiBar: { height: 8, backgroundColor: theme.border, borderRadius: 4, width: "100%", marginTop: 12, overflow: "hidden" },
  dtiFill: { height: 8, borderRadius: 4 },
  dtiStatus: { fontSize: 13, marginTop: 8, textAlign: "center" },
  dtiRow: { flexDirection: "row", gap: 24, marginTop: 16 },
  dtiStat: { alignItems: "center" },
  dtiStatVal: { fontSize: 16, fontWeight: "700", color: theme.text },
  dtiStatLabel: { fontSize: 11, color: theme.muted, marginTop: 2 },
  refinanceCard: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 16, marginTop: 12, backgroundColor: "#10b98110", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#10b98140" },
  refinanceTitle: { fontSize: 14, fontWeight: "700", color: "#10b981" },
  refinanceText: { fontSize: 12, color: theme.text, marginTop: 2, lineHeight: 17 },
  emptyState: { alignItems: "center", paddingVertical: 50, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: theme.text, marginTop: 16 },
  emptySub: { fontSize: 13, color: theme.muted, marginTop: 8, textAlign: "center" },
  loanCard: { marginHorizontal: 16, marginBottom: 10, backgroundColor: theme.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: theme.border },
  loanHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  loanIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: "center", alignItems: "center" },
  loanType: { fontSize: 15, fontWeight: "700", color: theme.text },
  loanLender: { fontSize: 12, color: theme.muted, marginTop: 2 },
  loanStats: { flexDirection: "row", gap: 16, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.border },
  loanStat: { flex: 1 },
  loanStatVal: { fontSize: 15, fontWeight: "700", color: theme.text },
  loanStatLabel: { fontSize: 10, color: theme.muted, marginTop: 2, textTransform: "uppercase" },
  loanEnd: { fontSize: 11, color: theme.muted, marginTop: 8 },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  modalContent: { backgroundColor: theme.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, maxHeight: "90%" },
  modalTitle: { fontSize: 20, fontWeight: "800", color: theme.text, marginBottom: 12 },
  typeChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: theme.border, marginRight: 6 },
  typeChipText: { fontSize: 11, color: theme.textSecondary },
  input: { backgroundColor: theme.background, borderRadius: 10, padding: 10, fontSize: 15, color: theme.text, marginBottom: 8, borderWidth: 1, borderColor: theme.border },
  inputRow: { flexDirection: "row", gap: 8 },
  modalBtns: { flexDirection: "row", gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center", borderWidth: 1, borderColor: theme.border },
  cancelText: { fontSize: 16, color: theme.muted, fontWeight: "600" },
  saveBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center", backgroundColor: theme.primary },
  saveText: { fontSize: 16, color: "#fff", fontWeight: "700" },
});