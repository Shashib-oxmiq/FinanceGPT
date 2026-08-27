import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Alert, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { calculateTax, compareRegimes, suggestITRForm, getTaxSavingSuggestions } from "../services/tax";
import { theme, formatMoney } from "../theme";
import PanelChat from "../components/PanelChat";

export default function TaxScreen({ navigation }) {
  const { user } = useAuth();
  const [income, setIncome] = useState("");
  const [deductions, setDeductions] = useState({ "80C": "", "80D": "", "80CCD1B": "", "HRA": "", other: "" });
  const [result, setResult] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [itrSuggestion, setItrSuggestion] = useState(null);
  const [suggestions, setSuggestions] = useState(null);

  const runCalc = () => {
    const gross = parseFloat(income) || 0;
    if (gross <= 0) { Alert.alert("Enter your income"); return; }
    const dedObj = {};
    for (const [k, v] of Object.entries(deductions)) dedObj[k] = parseFloat(v) || 0;

    const oldResult = calculateTax(gross, dedObj, "old");
    const newResult = calculateTax(gross, {}, "new");
    setResult({ old: oldResult, new: newResult });
    setComparison(compareRegimes(gross, dedObj));
    setItrSuggestion(suggestITRForm(gross, { salary: true }));
    setSuggestions(getTaxSavingSuggestions(gross, dedObj));
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Tax & ITR</Text>
      </View>

      <ScrollView>
        {/* Calculator */}
        <View style={styles.calcCard}>
          <Text style={styles.calcTitle}>Tax Calculator (FY 2024-25)</Text>
          <TextInput style={styles.input} placeholder="Annual income (₹)" keyboardType="numeric" value={income} onChangeText={setIncome} />
          <Text style={styles.dedLabel}>Deductions (for old regime):</Text>
          <View style={styles.dedRow}>
            <TextInput style={[styles.input, { flex: 1 }]} placeholder="80C (max 1.5L)" keyboardType="numeric" value={deductions["80C"]} onChangeText={(v) => setDeductions({ ...deductions, "80C": v })} />
            <TextInput style={[styles.input, { flex: 1 }]} placeholder="80D (health)" keyboardType="numeric" value={deductions["80D"]} onChangeText={(v) => setDeductions({ ...deductions, "80D": v })} />
          </View>
          <View style={styles.dedRow}>
            <TextInput style={[styles.input, { flex: 1 }]} placeholder="80CCD1B (NPS)" keyboardType="numeric" value={deductions["80CCD1B"]} onChangeText={(v) => setDeductions({ ...deductions, "80CCD1B": v })} />
            <TextInput style={[styles.input, { flex: 1 }]} placeholder="HRA" keyboardType="numeric" value={deductions["HRA"]} onChangeText={(v) => setDeductions({ ...deductions, "HRA": v })} />
          </View>
          <TouchableOpacity style={styles.calcBtn} onPress={runCalc}>
            <Text style={styles.calcBtnText}>Calculate Tax</Text>
          </TouchableOpacity>
        </View>

        {/* Results */}
        {comparison && (
          <View style={styles.resultCard}>
            <Text style={styles.resultTitle}>Tax Comparison</Text>
            <View style={styles.regimeRow}>
              <View style={[styles.regimeCard, comparison.better === "old" && styles.regimeBetter]}>
                <Text style={styles.regimeName}>Old Regime</Text>
                <Text style={styles.regimeTax}>{formatMoney(comparison.old.totalTax)}</Text>
                <Text style={styles.regimeSub}>After deductions</Text>
              </View>
              <View style={[styles.regimeCard, comparison.better === "new" && styles.regimeBetter]}>
                <Text style={styles.regimeName}>New Regime</Text>
                <Text style={styles.regimeTax}>{formatMoney(comparison.new.totalTax)}</Text>
                <Text style={styles.regimeSub}>Standard deduction</Text>
              </View>
            </View>
            <View style={[styles.recommendationCard, { backgroundColor: comparison.better === "new" ? "#10b98110" : "#f59e0b10" }]}>
              <Ionicons name={comparison.better === "new" ? "checkmark-circle" : "star"} size={18} color={comparison.better === "new" ? "#10b981" : "#f59e0b"} />
              <Text style={styles.recommendationText}>{comparison.recommendation}</Text>
            </View>
          </View>
        )}

        {/* ITR Form */}
        {itrSuggestion && (
          <View style={styles.itrCard}>
            <Ionicons name="document-text" size={20} color={theme.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.itrTitle}>Recommended ITR Form: {itrSuggestion.form}</Text>
              <Text style={styles.itrReason}>{itrSuggestion.reason}</Text>
            </View>
          </View>
        )}

        {/* Tax Saving Suggestions */}
        {suggestions && suggestions.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>💡 Tax Saving Suggestions</Text>
            {suggestions.map((s, i) => (
              <View key={i} style={styles.suggestionCard}>
                <View style={styles.suggestionHeader}>
                  <Text style={styles.suggestionSection}>Section {s.section}</Text>
                  {s.saving > 0 && <Text style={styles.suggestionSaving}>Save {formatMoney(s.saving)}</Text>}
                </View>
                <Text style={styles.suggestionTitle}>{s.title}</Text>
                {s.options.map((opt, j) => (
                  <View key={j} style={styles.suggestionOption}>
                    <Ionicons name="chevron-forward" size={12} color={theme.muted} />
                    <Text style={styles.suggestionOptText}>{opt}</Text>
                  </View>
                ))}
                <View style={styles.suggestionRec}>
                  <Ionicons name="bulb" size={14} color="#f59e0b" />
                  <Text style={styles.suggestionRecText}>{s.recommendation}</Text>
                </View>
              </View>
            ))}
          </>
        )}

        {/* Filing links */}
        <View style={styles.filingCard}>
          <Text style={styles.filingTitle}>File Your ITR</Text>
          <TouchableOpacity style={styles.filingLink} onPress={() => Linking.openURL("https://www.incometax.gov.in")}>
            <Ionicons name="globe" size={18} color={theme.primary} />
            <Text style={styles.filingLinkText}>Income Tax Portal (incometax.gov.in)</Text>
          </TouchableOpacity>
          <Text style={styles.filingNote}>ITR-1: Salary + one house property (most common){"\n"}ITR-2: Capital gains, multiple houses{"\n"}ITR-3: Business/profession income{"\n"}ITR-4: Presumptive business (44AD/44ADA)</Text>
        </View>

        <View style={{ paddingBottom: 16 }}>
          <PanelChat context="Tax" title="Ask AI: 'How can I save tax?'" />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingTop: 60, paddingBottom: 12 },
  title: { fontSize: 22, fontWeight: "800", color: theme.text },
  calcCard: { marginHorizontal: 16, marginTop: 8, backgroundColor: theme.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: theme.border },
  calcTitle: { fontSize: 16, fontWeight: "700", color: theme.text, marginBottom: 12 },
  input: { backgroundColor: theme.background, borderRadius: 10, padding: 10, fontSize: 15, color: theme.text, marginBottom: 8, borderWidth: 1, borderColor: theme.border },
  dedLabel: { fontSize: 13, fontWeight: "600", color: theme.text, marginTop: 4, marginBottom: 6 },
  dedRow: { flexDirection: "row", gap: 8 },
  calcBtn: { backgroundColor: theme.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  calcBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  resultCard: { marginHorizontal: 16, marginTop: 12, backgroundColor: theme.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: theme.border },
  resultTitle: { fontSize: 16, fontWeight: "700", color: theme.text, marginBottom: 12 },
  regimeRow: { flexDirection: "row", gap: 12 },
  regimeCard: { flex: 1, backgroundColor: theme.background, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.border },
  regimeBetter: { borderColor: theme.accent, borderWidth: 2, backgroundColor: theme.accent + "10" },
  regimeName: { fontSize: 13, fontWeight: "600", color: theme.muted },
  regimeTax: { fontSize: 20, fontWeight: "800", color: theme.text, marginTop: 4 },
  regimeSub: { fontSize: 11, color: theme.muted, marginTop: 2 },
  recommendationCard: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, padding: 12, marginTop: 12 },
  recommendationText: { fontSize: 13, color: theme.text, flex: 1, lineHeight: 19 },
  itrCard: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 16, marginTop: 12, backgroundColor: theme.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: theme.border },
  itrTitle: { fontSize: 14, fontWeight: "700", color: theme.text },
  itrReason: { fontSize: 12, color: theme.muted, marginTop: 2 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: theme.text, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10 },
  suggestionCard: { marginHorizontal: 16, marginBottom: 10, backgroundColor: theme.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: theme.border },
  suggestionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  suggestionSection: { fontSize: 12, fontWeight: "700", color: theme.primary, textTransform: "uppercase" },
  suggestionSaving: { fontSize: 13, fontWeight: "700", color: "#10b981" },
  suggestionTitle: { fontSize: 14, fontWeight: "600", color: theme.text },
  suggestionOption: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  suggestionOptText: { fontSize: 12, color: theme.textSecondary, flex: 1 },
  suggestionRec: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.border },
  suggestionRecText: { fontSize: 12, color: "#f59e0b", flex: 1, lineHeight: 17 },
  filingCard: { marginHorizontal: 16, marginTop: 16, backgroundColor: theme.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: theme.border },
  filingTitle: { fontSize: 16, fontWeight: "700", color: theme.text, marginBottom: 10 },
  filingLink: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, backgroundColor: theme.primary + "10", borderRadius: 10, paddingHorizontal: 12 },
  filingLinkText: { fontSize: 14, color: theme.primary, fontWeight: "600" },
  filingNote: { fontSize: 12, color: theme.muted, marginTop: 12, lineHeight: 19 },
});