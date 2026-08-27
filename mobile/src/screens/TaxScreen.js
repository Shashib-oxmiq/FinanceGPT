import React, { useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Alert, Linking, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import {
  calculateTax, compareRegimes, suggestITRForm, getTaxSavingSuggestions,
  getAdvanceTaxStatus, getUpcomingTaxEvents, getProjectedTax,
  DEDUCTION_SECTIONS, TAX_CALENDAR, ITR_CHECKLIST, ADVANCE_TAX_DATES,
} from "../services/tax";
import { theme, formatMoney } from "../theme";
import PanelChat from "../components/PanelChat";

export default function TaxScreen({ navigation }) {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const [income, setIncome] = useState("");
  const [deductions, setDeductions] = useState({ "80C": "", "80D": "", "80CCD1B": "", "HRA": "", "24b": "", other: "" });
  const [result, setResult] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [suggestions, setSuggestions] = useState(null);
  const [projected, setProjected] = useState(null);
  const [events, setEvents] = useState([]);
  const [advanceTax, setAdvanceTax] = useState(null);
  const [checklist, setChecklist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview"); // overview | calculator | calendar | checklist

  // ── Load projected tax + events on mount ──
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const proj = await getProjectedTax(user.user_id).catch(() => null);
        if (proj) setProjected(proj);
        const ev = getUpcomingTaxEvents(user.user_id, 3);
        setEvents(ev);
        if (proj?.projectedTax > 0) {
          setAdvanceTax(getAdvanceTaxStatus(proj.projectedTax, proj.tdsAlreadyPaid || 0));
        }
        setChecklist(ITR_CHECKLIST);
      } catch (e) { console.warn("TaxScreen load error:", e.message); }
      finally { setLoading(false); }
    })();
  }, [user]);

  const runCalc = () => {
    const gross = parseFloat(income) || 0;
    if (gross <= 0) { Alert.alert("Enter your annual income"); return; }
    const dedObj = {};
    for (const [k, v] of Object.entries(deductions)) dedObj[k] = parseFloat(v) || 0;
    const oldResult = calculateTax(gross, dedObj, "old");
    const newResult = calculateTax(gross, {}, "new");
    setResult({ old: oldResult, new: newResult });
    setComparison(compareRegimes(gross, dedObj));
    setSuggestions(getTaxSavingSuggestions(gross, dedObj));
  };

  const daysToDeadline = () => {
    const deadline = new Date("2026-07-31");
    const now = new Date();
    return Math.max(0, Math.ceil((deadline - now) / (1000 * 60 * 60 * 24)));
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Tax Planner</Text>
        <View style={{ flex: 1 }} />
        <Text style={styles.fyBadge}>FY 2025-26</Text>
      </View>

      {/* Tab selector */}
      <View style={styles.tabs}>
        {[
          { key: "overview", label: "Overview", icon: "grid-outline" },
          { key: "calculator", label: "Calculator", icon: "calculator-outline" },
          { key: "calendar", label: "Calendar", icon: "calendar-outline" },
          { key: "checklist", label: "Filing", icon: "checkbox-outline" },
        ].map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Ionicons name={tab.icon} size={14} color={activeTab === tab.key ? theme.primary : theme.muted} />
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 20 }}>

        {activeTab === "overview" && (
          <View>
            {/* Projected tax summary */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Projected Tax (FY 2025-26)</Text>
              {loading ? (
                <ActivityIndicator size="small" color={theme.primary} style={{ marginVertical: 20 }} />
              ) : projected ? (
                <View>
                  <View style={styles.projRow}>
                    <Text style={styles.projLabel}>Estimated income</Text>
                    <Text style={styles.projVal}>{formatMoney(projected.estimatedIncome || 0)}</Text>
                  </View>
                  <View style={styles.projRow}>
                    <Text style={styles.projLabel}>Best regime</Text>
                    <Text style={[styles.projVal, { color: theme.primary, textTransform: "capitalize" }]}>{projected.bestRegime || "new"}</Text>
                  </View>
                  <View style={styles.projRow}>
                    <Text style={styles.projLabel}>Projected tax</Text>
                    <Text style={[styles.projVal, { fontWeight: "700", color: theme.destructive }]}>{formatMoney(projected.projectedTax || 0)}</Text>
                  </View>
                  {projected.tdsAlreadyPaid > 0 && (
                    <View style={styles.projRow}>
                      <Text style={styles.projLabel}>TDS already paid</Text>
                      <Text style={styles.projVal}>{formatMoney(projected.tdsAlreadyPaid)}</Text>
                    </View>
                  )}
                  {projected.projectedRefund > 0 && (
                    <View style={styles.projRow}>
                      <Text style={styles.projLabel}>Expected refund</Text>
                      <Text style={[styles.projVal, { color: theme.accent }]}>{formatMoney(projected.projectedRefund)}</Text>
                    </View>
                  )}
                  <View style={[styles.projRow, { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: theme.border }]}>
                    <Text style={styles.projLabel}>Effective rate</Text>
                    <Text style={styles.projVal}>{((projected.projectedTax / (projected.estimatedIncome || 1)) * 100).toFixed(1)}%</Text>
                  </View>
                </View>
              ) : (
                <View>
                  <Text style={styles.hint}>Enter your income in the Calculator tab to see your projected tax.</Text>
                  <TouchableOpacity style={styles.goCalcBtn} onPress={() => setActiveTab("calculator")}>
                    <Text style={styles.goCalcText}>Open Calculator</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* ITR deadline countdown */}
            <View style={[styles.card, { borderColor: theme.primary + "30" }]}>
              <View style={styles.deadlineRow}>
                <Ionicons name="time-outline" size={20} color={theme.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.deadlineLabel}>ITR Filing Deadline</Text>
                  <Text style={styles.deadlineDate}>31 July 2026</Text>
                </View>
                <View style={styles.deadlineCountdown}>
                  <Text style={styles.deadlineNum}>{daysToDeadline()}</Text>
                  <Text style={styles.deadlineUnit}>days</Text>
                </View>
              </View>
            </View>

            {/* Advance tax status */}
            {advanceTax && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Advance Tax</Text>
                <View style={styles.projRow}>
                  <Text style={styles.projLabel}>Next due</Text>
                  <Text style={styles.projVal}>{advanceTax.label}</Text>
                </View>
                <View style={styles.projRow}>
                  <Text style={styles.projLabel}>Amount due</Text>
                  <Text style={[styles.projVal, { color: theme.destructive }]}>{formatMoney(advanceTax.nextDueAmount)}</Text>
                </View>
                <View style={styles.projRow}>
                  <Text style={styles.projLabel}>Days remaining</Text>
                  <Text style={styles.projVal}>{advanceTax.daysUntil} days</Text>
                </View>
                {advanceTax.isOverdue && (
                  <View style={styles.overdueBadge}>
                    <Ionicons name="warning" size={12} color="#fff" />
                    <Text style={styles.overdueText}>OVERDUE</Text>
                  </View>
                )}
              </View>
            )}

            {/* Upcoming tax events */}
            {events.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Upcoming Tax Dates</Text>
                {events.map((ev, i) => (
                  <View key={i} style={styles.eventRow}>
                    <View style={[styles.eventDot, { backgroundColor: ev.urgency === "overdue" ? theme.destructive : ev.urgency === "due-soon" ? "#f59e0b" : theme.primary }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.eventTitle}>{ev.label || ev.title}</Text>
                      <Text style={styles.eventDate}>
                        {ev.date || `${ev.month}/${ev.day}`} {ev.daysUntil !== undefined ? `(${ev.daysUntil} days)` : ""}
                      </Text>
                    </View>
                    {ev.urgency === "overdue" && <Text style={styles.overdueLabel}>Overdue</Text>}
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {activeTab === "calculator" && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Tax Calculator (FY 2025-26)</Text>
            <Text style={styles.hint}>New regime: zero tax up to Rs.12L (Rs.12.75L for salaried with std deduction)</Text>
            <TextInput style={styles.input} placeholder="Annual income" keyboardType="numeric" value={income} onChangeText={setIncome} />
            <Text style={styles.dedLabel}>Deductions (old regime only):</Text>
            <View style={styles.dedRow}>
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="80C (max 1.5L)" keyboardType="numeric" value={deductions["80C"]} onChangeText={(v) => setDeductions({ ...deductions, "80C": v })} />
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="80D (health)" keyboardType="numeric" value={deductions["80D"]} onChangeText={(v) => setDeductions({ ...deductions, "80D": v })} />
            </View>
            <View style={styles.dedRow}>
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="80CCD1B (NPS)" keyboardType="numeric" value={deductions["80CCD1B"]} onChangeText={(v) => setDeductions({ ...deductions, "80CCD1B": v })} />
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="HRA" keyboardType="numeric" value={deductions["HRA"]} onChangeText={(v) => setDeductions({ ...deductions, "HRA": v })} />
            </View>
            <View style={styles.dedRow}>
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="24(b) home loan" keyboardType="numeric" value={deductions["24b"]} onChangeText={(v) => setDeductions({ ...deductions, "24b": v })} />
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="Other" keyboardType="numeric" value={deductions.other} onChangeText={(v) => setDeductions({ ...deductions, other: v })} />
            </View>
            <TouchableOpacity style={styles.calcBtn} onPress={runCalc}>
              <Ionicons name="calculator" size={16} color="#fff" />
              <Text style={styles.calcBtnText}>Calculate Tax</Text>
            </TouchableOpacity>

            {comparison && (
              <View style={styles.resultsBox}>
                <View style={styles.regimeCompare}>
                  <View style={[styles.regimeCard, comparison.better === "new" && styles.regimeBest]}>
                    {comparison.better === "new" && <Text style={styles.bestBadge}>BEST</Text>}
                    <Text style={styles.regimeName}>New Regime</Text>
                    <Text style={styles.regimeTax}>{formatMoney(comparison.new.totalTax)}</Text>
                    <Text style={styles.regimeDetail}>Taxable: {formatMoney(comparison.new.taxableIncome)}</Text>
                    <Text style={styles.regimeDetail}>Std deduction: {formatMoney(comparison.new.stdDeduction)}</Text>
                    <Text style={styles.regimeDetail}>Take home: {formatMoney(comparison.new.takeHome)}</Text>
                  </View>
                  <View style={[styles.regimeCard, comparison.better === "old" && styles.regimeBest]}>
                    {comparison.better === "old" && <Text style={styles.bestBadge}>BEST</Text>}
                    <Text style={styles.regimeName}>Old Regime</Text>
                    <Text style={styles.regimeTax}>{formatMoney(comparison.old.totalTax)}</Text>
                    <Text style={styles.regimeDetail}>Taxable: {formatMoney(comparison.old.taxableIncome)}</Text>
                    <Text style={styles.regimeDetail}>Deductions: {formatMoney(comparison.old.totalDeductions)}</Text>
                    <Text style={styles.regimeDetail}>Take home: {formatMoney(comparison.old.takeHome)}</Text>
                  </View>
                </View>
                <Text style={styles.recommendation}>{comparison.recommendation}</Text>
              </View>
            )}

            {suggestions && suggestions.length > 0 && (
              <View style={styles.suggestionsBox}>
                <Text style={styles.suggTitle}>Tax Saving Suggestions</Text>
                {suggestions.map((s, i) => (
                  <View key={i} style={styles.suggItem}>
                    <View style={styles.suggHeader}>
                      <Text style={styles.suggSection}>Section {s.section}</Text>
                      {s.saving > 0 && <Text style={styles.suggSaving}>Save {formatMoney(s.saving)}</Text>}
                    </View>
                    <Text style={styles.suggTitle2}>{s.title}</Text>
                    <Text style={styles.suggRec}>{s.recommendation}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {activeTab === "calendar" && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Tax Calendar (FY 2025-26)</Text>
            <Text style={styles.hint}>Key dates throughout the financial year. The AI will proactively remind you before each one.</Text>
            {TAX_CALENDAR.map((ev, i) => {
              const daysLeft = ev.daysUntil !== undefined ? ev.daysUntil :
                Math.ceil((new Date(2026, (ev.month || parseInt(ev.date?.split("/")[0])) - 1, ev.day || parseInt(ev.date?.split("/")[1] || 1)) - new Date()) / (1000 * 60 * 60 * 24));
              const urgency = daysLeft < 0 ? "overdue" : daysLeft < 30 ? "due-soon" : "upcoming";
              return (
                <View key={i} style={[styles.calItem, urgency === "overdue" && styles.calOverdue]}>
                  <View style={[styles.calDot, { backgroundColor: urgency === "overdue" ? theme.destructive : urgency === "due-soon" ? "#f59e0b" : theme.primary }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.calLabel}>{ev.label || ev.title}</Text>
                    <Text style={styles.calDate}>{ev.month ? `Month ${ev.month}, Day ${ev.day}` : ev.date}</Text>
                    {ev.note && <Text style={styles.calNote}>{ev.note}</Text>}
                  </View>
                  <Text style={[styles.calDays, urgency === "overdue" && { color: theme.destructive }]}>
                    {daysLeft < 0 ? `${Math.abs(daysLeft)}d ago` : `${daysLeft}d`}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {activeTab === "checklist" && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>ITR Filing Checklist</Text>
            <Text style={styles.hint}>Gather these documents before filing. The AI can help you track each item.</Text>
            {checklist.map((item, i) => (
              <View key={i} style={styles.checklistItem}>
                <View style={styles.checklistBox}>
                  <Ionicons name="square-outline" size={18} color={theme.muted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.checklistLabel}>{item.label}</Text>
                </View>
              </View>
            ))}
            <View style={styles.filingHelp}>
              <Ionicons name="information-circle-outline" size={14} color={theme.muted} />
              <Text style={styles.filingHelpText}>Ask the AI below about any checklist item or ITR form.</Text>
            </View>
          </View>
        )}

        {/* PanelChat — chat-first tax help */}
        <PanelChat context="Tax" title="Ask AI: How can I save tax?" />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingTop: 50, paddingBottom: 8, gap: 8 },
  backBtn: { padding: 8, borderRadius: 12 },
  title: { fontSize: 18, fontWeight: "700", color: theme.text },
  fyBadge: { fontSize: 11, fontWeight: "600", color: theme.primary, backgroundColor: theme.primary + "15", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  tabs: { flexDirection: "row", paddingHorizontal: 12, gap: 6, marginBottom: 8 },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 8, borderRadius: 10, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border },
  tabActive: { borderColor: theme.primary, backgroundColor: theme.primary + "10" },
  tabText: { fontSize: 11, fontWeight: "600", color: theme.muted },
  tabTextActive: { color: theme.primary },
  scroll: { flex: 1, paddingHorizontal: 12 },
  card: { backgroundColor: theme.card, borderRadius: 16, borderWidth: 1, borderColor: theme.border, padding: 16, marginBottom: 12 },
  cardTitle: { fontSize: 15, fontWeight: "700", color: theme.text, marginBottom: 12 },
  hint: { fontSize: 12, color: theme.muted, marginBottom: 12, lineHeight: 18 },
  projRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 },
  projLabel: { fontSize: 13, color: theme.muted },
  projVal: { fontSize: 14, fontWeight: "600", color: theme.text },
  goCalcBtn: { backgroundColor: theme.primary, borderRadius: 10, paddingVertical: 10, alignItems: "center", marginTop: 8 },
  goCalcText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  deadlineRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  deadlineLabel: { fontSize: 12, color: theme.muted },
  deadlineDate: { fontSize: 15, fontWeight: "700", color: theme.text },
  deadlineCountdown: { alignItems: "center", backgroundColor: theme.primary + "15", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  deadlineNum: { fontSize: 22, fontWeight: "800", color: theme.primary },
  deadlineUnit: { fontSize: 10, color: theme.primary, fontWeight: "600" },
  overdueBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: theme.destructive, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, alignSelf: "flex-start", marginTop: 8 },
  overdueText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  eventRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  eventDot: { width: 8, height: 8, borderRadius: 4 },
  eventTitle: { fontSize: 13, fontWeight: "600", color: theme.text },
  eventDate: { fontSize: 11, color: theme.muted },
  overdueLabel: { fontSize: 10, color: theme.destructive, fontWeight: "700" },
  input: { borderWidth: 1, borderColor: theme.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: theme.text, marginBottom: 8 },
  dedLabel: { fontSize: 12, fontWeight: "600", color: theme.muted, marginBottom: 4 },
  dedRow: { flexDirection: "row", gap: 8 },
  calcBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: theme.primary, borderRadius: 12, paddingVertical: 12, marginTop: 8 },
  calcBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  resultsBox: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: theme.border },
  regimeCompare: { flexDirection: "row", gap: 8 },
  regimeCard: { flex: 1, backgroundColor: theme.background, borderRadius: 12, borderWidth: 1, borderColor: theme.border, padding: 12, position: "relative" },
  regimeBest: { borderColor: theme.accent, borderWidth: 2, backgroundColor: theme.accent + "10" },
  bestBadge: { position: "absolute", top: -8, right: 8, backgroundColor: theme.accent, color: "#fff", fontSize: 9, fontWeight: "800", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  regimeName: { fontSize: 12, fontWeight: "700", color: theme.muted, marginBottom: 4 },
  regimeTax: { fontSize: 18, fontWeight: "800", color: theme.text, marginBottom: 6 },
  regimeDetail: { fontSize: 11, color: theme.muted, marginBottom: 2 },
  recommendation: { fontSize: 13, color: theme.primary, fontWeight: "600", marginTop: 12, textAlign: "center" },
  suggestionsBox: { marginTop: 16 },
  suggTitle: { fontSize: 14, fontWeight: "700", color: theme.text, marginBottom: 8 },
  suggItem: { backgroundColor: theme.background, borderRadius: 10, borderWidth: 1, borderColor: theme.border, padding: 12, marginBottom: 8 },
  suggHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  suggSection: { fontSize: 11, fontWeight: "700", color: theme.primary, backgroundColor: theme.primary + "15", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  suggSaving: { fontSize: 11, fontWeight: "700", color: theme.accent },
  suggTitle2: { fontSize: 13, fontWeight: "600", color: theme.text, marginBottom: 4 },
  suggRec: { fontSize: 12, color: theme.muted, lineHeight: 18 },
  calItem: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.border },
  calOverdue: { opacity: 0.6 },
  calDot: { width: 8, height: 8, borderRadius: 4 },
  calLabel: { fontSize: 13, fontWeight: "600", color: theme.text },
  calDate: { fontSize: 11, color: theme.muted, marginTop: 2 },
  calNote: { fontSize: 11, color: theme.muted, marginTop: 2, fontStyle: "italic" },
  calDays: { fontSize: 12, fontWeight: "700", color: theme.text },
  checklistItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.border },
  checklistBox: { padding: 2 },
  checklistLabel: { fontSize: 13, color: theme.text },
  filingHelp: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12, padding: 10, backgroundColor: theme.background, borderRadius: 8 },
  filingHelpText: { fontSize: 11, color: theme.muted },
});