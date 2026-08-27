import React, { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Modal, TextInput, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { getRetirementCorpus, addCorpusSource, deleteCorpusSource, RETIREMENT_SOURCES, calculateRetirementNeeded, projectCorpus } from "../services/retirement";
import { theme, formatMoney } from "../theme";
import PanelChat from "../components/PanelChat";

export default function RetirementScreen({ navigation }) {
  const { user } = useAuth();
  const [sources, setSources] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showCalc, setShowCalc] = useState(false);
  const [form, setForm] = useState({ source: "nps", current_value: "", monthly_contribution: "", expected_return: "10" });
  const [calc, setCalc] = useState({ currentAge: "35", retirementAge: "60", monthlyExpenses: "50000" });
  const [calcResult, setCalcResult] = useState(null);

  const load = useCallback(async () => {
    if (!user) return;
    try { setSources(await getRetirementCorpus(user.user_id)); } catch (e) { console.error(e); }
  }, [user]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const handleAdd = async () => {
    if (!form.current_value && !form.monthly_contribution) { Alert.alert("Enter value or contribution"); return; }
    await addCorpusSource(user.user_id, {
      ...form,
      current_value: parseFloat(form.current_value) || 0,
      monthly_contribution: parseFloat(form.monthly_contribution) || 0,
      expected_return: parseFloat(form.expected_return) || 8,
    });
    setForm({ source: "nps", current_value: "", monthly_contribution: "", expected_return: "10" });
    setShowAdd(false);
    await load();
  };

  const runCalc = () => {
    const result = calculateRetirementNeeded(
      parseInt(calc.currentAge) || 35,
      parseInt(calc.retirementAge) || 60,
      parseInt(calc.monthlyExpenses) || 50000
    );
    const projection = projectCorpus(sources, result.yearsToRetire, parseInt(calc.currentAge));
    setCalcResult({ ...result, ...projection });
  };

  const totalCurrent = sources.reduce((s, x) => s + (Number(x.current_value) || 0), 0);
  const totalMonthly = sources.reduce((s, x) => s + (Number(x.monthly_contribution) || 0) + (Number(x.employer_contribution) || 0), 0);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Retirement</Text>
        <TouchableOpacity onPress={() => setShowCalc(true)}>
          <Ionicons name="calculator" size={24} color={theme.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}>
        {/* Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Current Corpus</Text>
          <Text style={styles.summaryVal}>{formatMoney(totalCurrent)}</Text>
          <View style={styles.summaryRow}>
            <View><Text style={styles.summarySubVal}>{formatMoney(totalMonthly)}</Text><Text style={styles.summarySubLabel}>Monthly Contributions</Text></View>
            <View><Text style={styles.summarySubVal}>{sources.length}</Text><Text style={styles.summarySubLabel}>Sources</Text></View>
          </View>
        </View>

        {calcResult && (
          <View style={styles.calcResultCard}>
            <Text style={styles.calcTitle}>Retirement Projection</Text>
            <Text style={styles.calcYears}>{calcResult.yearsToRetire} years to retirement</Text>
            <View style={styles.calcGrid}>
              <View style={styles.calcItem}><Text style={styles.calcItemVal}>{formatMoney(calcResult.futureMonthlyExp)}</Text><Text style={styles.calcItemLabel}>Future monthly expenses</Text></View>
              <View style={styles.calcItem}><Text style={[styles.calcItemVal, { color: "#ef4444" }]}>{formatMoney(calcResult.corpusNeeded)}</Text><Text style={styles.calcItemLabel}>Corpus needed (25x rule)</Text></View>
              <View style={styles.calcItem}><Text style={[styles.calcItemVal, { color: theme.accent }]}>{formatMoney(calcResult.projectedTotal)}</Text><Text style={styles.calcItemLabel}>Projected from your sources</Text></View>
              <View style={styles.calcItem}><Text style={[styles.calcItemVal, { color: calcResult.projectedTotal >= calcResult.corpusNeeded ? theme.accent : "#f59e0b" }]}>{formatMoney(calcResult.monthlyNeeded)}</Text><Text style={styles.calcItemLabel}>Monthly investment needed</Text></View>
            </View>
            <Text style={styles.calcStatus}>
              {calcResult.projectedTotal >= calcResult.corpusNeeded
                ? "✓ You're on track for retirement!"
                : `⚠️ Shortfall of ${formatMoney(calcResult.corpusNeeded - calcResult.projectedTotal)}. Increase your monthly investments.`}
            </Text>
          </View>
        )}

        {/* Sources */}
        <Text style={styles.sectionTitle}>Retirement Sources</Text>
        {sources.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="happy" size={48} color={theme.muted} />
            <Text style={styles.emptyTitle}>No retirement savings tracked</Text>
            <Text style={styles.emptySub}>Add NPS, EPF, PPF, and other retirement sources</Text>
          </View>
        )}
        {sources.map((s) => {
          const info = RETIREMENT_SOURCES.find(r => r.key === s.source) || RETIREMENT_SOURCES[0];
          return (
            <View key={s.corpus_id} style={styles.sourceCard}>
              <View style={styles.sourceHeader}>
                <View style={[styles.sourceIcon, { backgroundColor: info.color + "20" }]}>
                  <Ionicons name={info.icon} size={18} color={info.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sourceName}>{info.label}</Text>
                  <Text style={styles.sourceReturn}>{s.expected_return}% expected return · {info.tax_benefit}</Text>
                </View>
                <TouchableOpacity onPress={() => { deleteCorpusSource(s.corpus_id); load(); }}>
                  <Ionicons name="trash-outline" size={16} color={theme.muted} />
                </TouchableOpacity>
              </View>
              <View style={styles.sourceStats}>
                <View><Text style={styles.sourceStatVal}>{formatMoney(s.current_value)}</Text><Text style={styles.sourceStatLabel}>Current Value</Text></View>
                <View><Text style={styles.sourceStatVal}>{formatMoney((Number(s.monthly_contribution)||0) + (Number(s.employer_contribution)||0))}</Text><Text style={styles.sourceStatLabel}>Monthly</Text></View>
              </View>
            </View>
          );
        })}

        <TouchableOpacity style={styles.addSourceBtn} onPress={() => setShowAdd(true)}>
          <Ionicons name="add" size={18} color={theme.primary} />
          <Text style={styles.addSourceText}>Add Retirement Source</Text>
        </TouchableOpacity>

        <View style={{ paddingBottom: 16 }}>
          <PanelChat context="Retirement" title="Ask AI about retirement planning" />
        </View>
      </ScrollView>

      {/* Add source modal */}
      <Modal visible={showAdd} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Retirement Source</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {RETIREMENT_SOURCES.map((r) => (
                <TouchableOpacity key={r.key} style={[styles.typeChip, form.source === r.key && { backgroundColor: r.color, borderColor: r.color }]} onPress={() => setForm({ ...form, source: r.key, expected_return: String(r.return) })}>
                  <Ionicons name={r.icon} size={12} color={form.source === r.key ? "#fff" : theme.muted} />
                  <Text style={[styles.typeChipText, form.source === r.key && { color: "#fff" }]}>{r.label.split(" (")[0]}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TextInput style={styles.input} placeholder="Current value (₹)" keyboardType="numeric" value={form.current_value} onChangeText={(v) => setForm({ ...form, current_value: v })} />
            <TextInput style={styles.input} placeholder="Monthly contribution (₹)" keyboardType="numeric" value={form.monthly_contribution} onChangeText={(v) => setForm({ ...form, monthly_contribution: v })} />
            <TextInput style={styles.input} placeholder="Expected return %" keyboardType="numeric" value={form.expected_return} onChangeText={(v) => setForm({ ...form, expected_return: v })} />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAdd(false)}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleAdd}><Text style={styles.saveText}>Save</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Calculator modal */}
      <Modal visible={showCalc} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Retirement Calculator</Text>
            <TextInput style={styles.input} placeholder="Current age" keyboardType="numeric" value={calc.currentAge} onChangeText={(v) => setCalc({ ...calc, currentAge: v })} />
            <TextInput style={styles.input} placeholder="Retirement age" keyboardType="numeric" value={calc.retirementAge} onChangeText={(v) => setCalc({ ...calc, retirementAge: v })} />
            <TextInput style={styles.input} placeholder="Monthly expenses (₹)" keyboardType="numeric" value={calc.monthlyExpenses} onChangeText={(v) => setCalc({ ...calc, monthlyExpenses: v })} />
            <TouchableOpacity style={styles.saveBtn} onPress={() => { runCalc(); setShowCalc(false); }}><Text style={styles.saveText}>Calculate</Text></TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowCalc(false)}><Text style={styles.cancelText}>Close</Text></TouchableOpacity>
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
  summaryCard: { marginHorizontal: 16, marginTop: 8, backgroundColor: theme.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: theme.border, alignItems: "center" },
  summaryLabel: { fontSize: 12, color: theme.muted, textTransform: "uppercase", letterSpacing: 1 },
  summaryVal: { fontSize: 28, fontWeight: "800", color: theme.text, marginTop: 4 },
  summaryRow: { flexDirection: "row", gap: 32, marginTop: 12 },
  summarySubVal: { fontSize: 15, fontWeight: "700", color: theme.text, textAlign: "center" },
  summarySubLabel: { fontSize: 10, color: theme.muted, marginTop: 2 },
  calcResultCard: { marginHorizontal: 16, marginTop: 12, backgroundColor: theme.primary + "10", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: theme.primary + "30" },
  calcTitle: { fontSize: 16, fontWeight: "700", color: theme.primary },
  calcYears: { fontSize: 12, color: theme.muted, marginTop: 2 },
  calcGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 12 },
  calcItem: { width: "47%", backgroundColor: theme.card, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: theme.border },
  calcItemVal: { fontSize: 16, fontWeight: "700", color: theme.text },
  calcItemLabel: { fontSize: 10, color: theme.muted, marginTop: 4 },
  calcStatus: { fontSize: 13, marginTop: 12, fontWeight: "600" },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: theme.text, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10 },
  emptyState: { alignItems: "center", paddingVertical: 30 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: theme.text, marginTop: 16 },
  emptySub: { fontSize: 13, color: theme.muted, marginTop: 8, textAlign: "center" },
  sourceCard: { marginHorizontal: 16, marginBottom: 10, backgroundColor: theme.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: theme.border },
  sourceHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  sourceIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: "center", alignItems: "center" },
  sourceName: { fontSize: 15, fontWeight: "700", color: theme.text },
  sourceReturn: { fontSize: 11, color: theme.muted, marginTop: 2 },
  sourceStats: { flexDirection: "row", justifyContent: "space-around", marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.border },
  sourceStatVal: { fontSize: 15, fontWeight: "700", color: theme.text, textAlign: "center" },
  sourceStatLabel: { fontSize: 10, color: theme.muted, marginTop: 2 },
  addSourceBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginHorizontal: 16, marginTop: 8, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.primary + "40" },
  addSourceText: { fontSize: 14, color: theme.primary, fontWeight: "600" },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  modalContent: { backgroundColor: theme.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, maxHeight: "90%" },
  modalTitle: { fontSize: 20, fontWeight: "800", color: theme.text, marginBottom: 12 },
  typeChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: theme.border, marginRight: 6 },
  typeChipText: { fontSize: 11, color: theme.textSecondary },
  input: { backgroundColor: theme.background, borderRadius: 10, padding: 10, fontSize: 15, color: theme.text, marginBottom: 8, borderWidth: 1, borderColor: theme.border },
  modalBtns: { flexDirection: "row", gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center", borderWidth: 1, borderColor: theme.border, marginTop: 8 },
  cancelText: { fontSize: 16, color: theme.muted, fontWeight: "600" },
  saveBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center", backgroundColor: theme.primary },
  saveText: { fontSize: 16, color: "#fff", fontWeight: "700" },
});