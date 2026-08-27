import React, { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getKinAccessPackage } from "../services/emergencyService";
import { theme, formatMoney } from "../theme";

/**
 * F-228: Kin Access Screen — Read-only view for next of kin
 * This is what trusted contacts see when they receive emergency access.
 * Shows: insurance policies, investments, loans, property, documents, family checklist.
 */
export default function KinAccessScreen({ route, navigation }) {
  const token = route?.params?.token || "preview";
  const [pkg, setPkg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await getKinAccessPackage(token);
      if (!data) { setError("Access token not found or expired."); setLoading(false); return; }
      if (data.expired) { setError("This access link has expired."); setLoading(false); return; }
      setPkg(data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={theme.primary} /><Text style={styles.loadingText}>Loading family financial information...</Text></View>;
  if (error) return (
    <View style={styles.center}>
      <Ionicons name="lock-closed" size={48} color={theme.muted} />
      <Text style={styles.errorTitle}>Access Unavailable</Text>
      <Text style={styles.errorMsg}>{error}</Text>
      <Text style={styles.errorHelp}>If you believe this is an error, please contact support.</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Family Financial Access</Text>
          <Text style={styles.subtitle}>Read-only · Generated {pkg.generated_at ? new Date(pkg.generated_at).toLocaleDateString() : ""}</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ── Summary Card ── */}
        {pkg.summary && (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Financial Overview</Text>
            <View style={styles.summaryGrid}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryVal}>{formatMoney(pkg.summary.net_worth)}</Text>
                <Text style={styles.summaryLabel}>Net Worth</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryVal}>{formatMoney(pkg.summary.total_assets)}</Text>
                <Text style={styles.summaryLabel}>Total Assets</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryVal}>{formatMoney(pkg.summary.total_debt)}</Text>
                <Text style={styles.summaryLabel}>Total Debt</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryVal}>{pkg.summary.health_score}/100</Text>
                <Text style={styles.summaryLabel}>Health Score</Text>
              </View>
            </View>
          </View>
        )}

        {/* ── Immediate Actions ── */}
        {pkg.immediate && pkg.immediate.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🚨 Immediate Actions Needed</Text>
            {pkg.immediate.map((a, i) => (
              <View key={i} style={styles.urgentCard}>
                <Ionicons name="alert-circle" size={16} color="#ef4444" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.urgentText}>{a.action}</Text>
                  {a.due && <Text style={styles.urgentDue}>Due: {a.due}</Text>}
                  {a.amount && <Text style={styles.urgentDue}>Amount: {formatMoney(a.amount)}</Text>}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── Insurance (most critical for family) ── */}
        {pkg.insurance && pkg.insurance.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🛡️ Insurance Policies ({pkg.insurance.length})</Text>
            {pkg.insurance.map((i, idx) => (
              <View key={idx} style={styles.dataCard}>
                <View style={styles.dataCardHeader}>
                  <Ionicons name="shield-checkmark" size={18} color={theme.primary} />
                  <Text style={styles.dataCardTitle}>{i.policy_type}</Text>
                </View>
                <Text style={styles.dataRow}>Provider: {i.provider || "—"}</Text>
                <Text style={styles.dataRow}>Policy No: {i.policy_number || "—"}</Text>
                <Text style={styles.dataRow}>Sum Assured: {formatMoney(i.sum_assured)}</Text>
                <Text style={styles.dataRow}>Premium: {formatMoney(i.premium_amount)} / {i.premium_frequency || "year"}</Text>
                <Text style={styles.dataRow}>Nominee: {i.nominee || "⚠️ Not specified — check with provider"}</Text>
                {i.maturity_date && <Text style={styles.dataRow}>Maturity: {i.maturity_date}</Text>}
                <View style={styles.nextStepsBox}>
                  <Ionicons name="arrow-forward" size={12} color={theme.primary} />
                  <Text style={styles.nextStepsText}>{i.next_steps}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── Investments ── */}
        {pkg.investments && pkg.investments.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>💰 Investments ({pkg.investments.length})</Text>
            {pkg.investments.map((inv, i) => (
              <View key={i} style={styles.dataCard}>
                <View style={styles.dataCardHeader}>
                  <Ionicons name="trending-up" size={18} color={theme.accent} />
                  <Text style={styles.dataCardTitle}>{inv.name}</Text>
                </View>
                <Text style={styles.dataRow}>Type: {inv.asset_type}</Text>
                <Text style={styles.dataRow}>Current Value: {formatMoney(inv.current_value)}</Text>
                {inv.ticker && <Text style={styles.dataRow}>Ticker: {inv.ticker} ({inv.market || ""})</Text>}
                <View style={styles.nextStepsBox}>
                  <Ionicons name="arrow-forward" size={12} color={theme.primary} />
                  <Text style={styles.nextStepsText}>{inv.next_steps}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── Loans ── */}
        {pkg.loans && pkg.loans.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>💳 Loans & Debt ({pkg.loans.length})</Text>
            {pkg.loans.map((l, i) => (
              <View key={i} style={styles.dataCard}>
                <View style={styles.dataCardHeader}>
                  <Ionicons name="card" size={18} color="#ef4444" />
                  <Text style={styles.dataCardTitle}>{l.loan_type} — {l.lender}</Text>
                </View>
                <Text style={styles.dataRow}>Remaining: {formatMoney(l.remaining_amount)}</Text>
                <Text style={styles.dataRow}>EMI: {formatMoney(l.emi_amount)}/month</Text>
                {l.end_date && <Text style={styles.dataRow}>Ends: {l.end_date}</Text>}
                <View style={styles.nextStepsBox}>
                  <Ionicons name="arrow-forward" size={12} color={theme.primary} />
                  <Text style={styles.nextStepsText}>{l.next_steps}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── Properties ── */}
        {pkg.properties && pkg.properties.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🏠 Properties ({pkg.properties.length})</Text>
            {pkg.properties.map((p, i) => (
              <View key={i} style={styles.dataCard}>
                <View style={styles.dataCardHeader}>
                  <Ionicons name="business" size={18} color="#8b5cf6" />
                  <Text style={styles.dataCardTitle}>{p.type}</Text>
                </View>
                <Text style={styles.dataRow}>{p.address || p.city}</Text>
                <Text style={styles.dataRow}>Value: {formatMoney(p.current_value)}</Text>
                {p.property_tax > 0 && <Text style={styles.dataRow}>Property Tax: {formatMoney(p.property_tax)}</Text>}
                <View style={styles.nextStepsBox}>
                  <Ionicons name="arrow-forward" size={12} color={theme.primary} />
                  <Text style={styles.nextStepsText}>{p.next_steps}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── Goals ── */}
        {pkg.goals && pkg.goals.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🎯 Active Goals ({pkg.goals.length})</Text>
            {pkg.goals.map((g, i) => (
              <View key={i} style={styles.dataCard}>
                <Text style={styles.dataCardTitle}>{g.name}</Text>
                <Text style={styles.dataRow}>Target: {formatMoney(g.target)} · Saved: {formatMoney(g.current)}</Text>
                <Text style={styles.dataRow}>Monthly: {formatMoney(g.monthly_contribution)}</Text>
                <View style={styles.nextStepsBox}>
                  <Ionicons name="arrow-forward" size={12} color={theme.primary} />
                  <Text style={styles.nextStepsText}>{g.next_steps}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── Retirement ── */}
        {pkg.retirement && pkg.retirement.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🏦 Retirement Sources ({pkg.retirement.length})</Text>
            {pkg.retirement.map((r, i) => (
              <View key={i} style={styles.dataCard}>
                <Text style={styles.dataCardTitle}>{r.source}</Text>
                <Text style={styles.dataRow}>Value: {formatMoney(r.current_value)} · Monthly: {formatMoney(r.monthly_contribution)}</Text>
                <View style={styles.nextStepsBox}>
                  <Ionicons name="arrow-forward" size={12} color={theme.primary} />
                  <Text style={styles.nextStepsText}>{r.next_steps}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── Education Plans ── */}
        {pkg.education && pkg.education.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🎓 Education Plans ({pkg.education.length})</Text>
            {pkg.education.map((e, i) => (
              <View key={i} style={styles.dataCard}>
                <Text style={styles.dataCardTitle}>{e.child_name}</Text>
                <Text style={styles.dataRow}>Target: {formatMoney(e.target)} · Saved: {formatMoney(e.current)}</Text>
                <View style={styles.nextStepsBox}>
                  <Ionicons name="arrow-forward" size={12} color={theme.primary} />
                  <Text style={styles.nextStepsText}>{e.next_steps}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── Reminders ── */}
        {pkg.reminders && pkg.reminders.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>⏰ Upcoming Reminders ({pkg.reminders.length})</Text>
            {pkg.reminders.slice(0, 10).map((r, i) => (
              <View key={i} style={styles.reminderRow}>
                <Ionicons name="notifications" size={14} color={theme.primary} />
                <Text style={styles.reminderText}>{r.title}</Text>
                <Text style={styles.reminderDue}>{r.due_date}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Contacts ── */}
        {pkg.contacts && pkg.contacts.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>👥 Important Contacts ({pkg.contacts.length})</Text>
            {pkg.contacts.map((c, i) => (
              <View key={i} style={styles.contactRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.contactName}>{c.name}</Text>
                  <Text style={styles.contactMeta}>{c.relationship}{c.phone ? ` · ${c.phone}` : ""}{c.email ? ` · ${c.email}` : ""}</Text>
                </View>
                {c.phone && <TouchableOpacity onPress={() => Linking.openURL(`tel:${c.phone}`)}><Ionicons name="call" size={18} color={theme.primary} /></TouchableOpacity>}
              </View>
            ))}
          </View>
        )}

        {/* ── Family Checklist ── */}
        {pkg.familyChecklist && pkg.familyChecklist.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📋 Family Action Checklist ({pkg.familyChecklist.length} steps)</Text>
            {pkg.familyChecklist.map((c, i) => (
              <View key={i} style={styles.checklistRow}>
                <View style={styles.checklistNum}>
                  <Text style={styles.checklistNumText}>{i + 1}</Text>
                </View>
                <Text style={styles.checklistText}>{c}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  center: { flex: 1, backgroundColor: theme.background, justifyContent: "center", alignItems: "center", paddingHorizontal: 32 },
  loadingText: { fontSize: 14, color: theme.muted, marginTop: 12 },
  errorTitle: { fontSize: 20, fontWeight: "700", color: theme.text, marginTop: 16 },
  errorMsg: { fontSize: 14, color: theme.muted, marginTop: 8, textAlign: "center" },
  errorHelp: { fontSize: 12, color: theme.muted, marginTop: 16 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, padding: 20, paddingTop: 60 },
  title: { fontSize: 22, fontWeight: "800", color: theme.text },
  subtitle: { fontSize: 13, color: theme.muted, marginTop: 2 },
  summaryCard: { marginHorizontal: 16, marginTop: 8, backgroundColor: theme.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: theme.border },
  summaryTitle: { fontSize: 16, fontWeight: "700", color: theme.text, marginBottom: 12 },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  summaryItem: { width: "47%", backgroundColor: theme.background, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: theme.border },
  summaryVal: { fontSize: 16, fontWeight: "800", color: theme.text },
  summaryLabel: { fontSize: 10, color: theme.muted, marginTop: 4, textTransform: "uppercase" },
  section: { padding: 20, paddingTop: 24 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: theme.text, marginBottom: 10 },
  urgentCard: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "#ef444410", borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: "#ef444430" },
  urgentText: { fontSize: 14, fontWeight: "600", color: theme.text, flex: 1 },
  urgentDue: { fontSize: 12, color: "#ef4444", marginTop: 2 },
  dataCard: { backgroundColor: theme.card, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: theme.border },
  dataCardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  dataCardTitle: { fontSize: 15, fontWeight: "700", color: theme.text, flex: 1 },
  dataRow: { fontSize: 13, color: theme.textSecondary, marginTop: 4 },
  nextStepsBox: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.border },
  nextStepsText: { fontSize: 12, color: theme.primary, flex: 1, lineHeight: 17 },
  reminderRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  reminderText: { fontSize: 13, color: theme.text, flex: 1 },
  reminderDue: { fontSize: 12, color: theme.muted },
  contactRow: { flexDirection: "row", alignItems: "center", backgroundColor: theme.card, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: theme.border },
  contactName: { fontSize: 14, fontWeight: "600", color: theme.text },
  contactMeta: { fontSize: 12, color: theme.muted, marginTop: 2 },
  checklistRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 10 },
  checklistNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: theme.primary, justifyContent: "center", alignItems: "center" },
  checklistNumText: { fontSize: 12, color: "#fff", fontWeight: "700" },
  checklistText: { fontSize: 13, color: theme.textSecondary, flex: 1, lineHeight: 18 },
});