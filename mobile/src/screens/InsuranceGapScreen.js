import React, { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { analyzeInsuranceGaps } from "../services/insuranceGap";
import { theme, formatMoney } from "../theme";
import PanelChat from "../components/PanelChat";

const URGENCY_COLORS = { critical: "#ef4444", high: "#f59e0b", medium: "#3b82f6", low: "#10b981" };

export default function InsuranceGapScreen({ navigation }) {
  const { user } = useAuth();
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const result = await analyzeInsuranceGaps(user.user_id, user?.profile || {});
      setAnalysis(result);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={theme.primary} /></View>;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Insurance Gap Analysis</Text>
      </View>

      <ScrollView>
        {/* Protection Score */}
        <View style={styles.scoreCard}>
          <Text style={styles.scoreLabel}>Protection Score</Text>
          <Text style={[styles.scoreValue, { color: URGENCY_COLORS[analysis.protectionScore >= 70 ? "low" : analysis.protectionScore >= 40 ? "high" : "critical"] }]}>
            {analysis.protectionScore}/100
          </Text>
          <View style={styles.scoreBar}>
            <View style={[styles.scoreBarFill, { width: `${analysis.protectionScore}%`, backgroundColor: URGENCY_COLORS[analysis.protectionScore >= 70 ? "low" : analysis.protectionScore >= 40 ? "high" : "critical"] }]} />
          </View>
          {analysis.totalShortfall > 0 && (
            <Text style={styles.shortfallText}>Total coverage shortfall: {formatMoney(analysis.totalShortfall)}</Text>
          )}
        </View>

        {/* Gaps */}
        {analysis.gaps.length > 0 && (
          <Text style={styles.sectionTitle}>⚠️ Gaps Found ({analysis.gaps.length})</Text>
        )}
        {analysis.gaps.map((gap, i) => (
          <View key={i} style={[styles.gapCard, { borderLeftColor: URGENCY_COLORS[gap.urgency] }]}>
            <View style={styles.gapHeader}>
              <View style={[styles.urgencyBadge, { backgroundColor: URGENCY_COLORS[gap.urgency] + "20" }]}>
                <Text style={[styles.urgencyText, { color: URGENCY_COLORS[gap.urgency] }]}>{gap.urgency.toUpperCase()}</Text>
              </View>
              {gap.shortfall > 0 && <Text style={styles.gapShortfall}>Shortfall: {formatMoney(gap.shortfall)}</Text>}
            </View>
            <Text style={styles.gapLabel}>{gap.label}</Text>
            <Text style={styles.gapReason}>{gap.reason}</Text>
            <View style={styles.gapAction}>
              <Ionicons name="bulb" size={14} color={theme.primary} />
              <Text style={styles.gapActionText}>{gap.action}</Text>
            </View>
          </View>
        ))}

        {/* Covered */}
        {analysis.covered.length > 0 && (
          <Text style={styles.sectionTitle}>✓ Covered ({analysis.covered.length})</Text>
        )}
        {analysis.covered.map((c, i) => (
          <View key={i} style={styles.coveredCard}>
            <Ionicons name="checkmark-circle" size={20} color={theme.accent} />
            <View style={styles.coveredInfo}>
              <Text style={styles.coveredLabel}>{c.label}</Text>
              {c.cover > 0 && <Text style={styles.coveredAmount}>Cover: {formatMoney(c.cover)}</Text>}
            </View>
          </View>
        ))}

        {analysis.gaps.length === 0 && analysis.covered.length > 0 && (
          <View style={styles.allGoodCard}>
            <Ionicons name="shield-checkmark" size={48} color={theme.accent} />
            <Text style={styles.allGoodTitle}>You're well protected!</Text>
            <Text style={styles.allGoodSub}>No critical insurance gaps found. Keep up the good work.</Text>
          </View>
        )}

        <View style={{ paddingBottom: 16 }}>
          <PanelChat context="InsuranceGap" title="Ask AI: 'Am I underinsured?'" />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: theme.background },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingTop: 60, paddingBottom: 12 },
  title: { fontSize: 20, fontWeight: "800", color: theme.text, flex: 1 },
  scoreCard: { marginHorizontal: 16, marginTop: 8, backgroundColor: theme.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: theme.border, alignItems: "center" },
  scoreLabel: { fontSize: 13, color: theme.muted, textTransform: "uppercase", letterSpacing: 1 },
  scoreValue: { fontSize: 36, fontWeight: "800", marginTop: 4 },
  scoreBar: { height: 8, backgroundColor: theme.border, borderRadius: 4, width: "100%", marginTop: 12, overflow: "hidden" },
  scoreBarFill: { height: 8, borderRadius: 4 },
  shortfallText: { fontSize: 13, color: "#ef4444", marginTop: 8, fontWeight: "600" },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: theme.text, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10 },
  gapCard: { marginHorizontal: 16, marginBottom: 10, backgroundColor: theme.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: theme.border, borderLeftWidth: 4 },
  gapHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  urgencyBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  urgencyText: { fontSize: 10, fontWeight: "700" },
  gapShortfall: { fontSize: 12, color: "#ef4444", fontWeight: "600" },
  gapLabel: { fontSize: 15, fontWeight: "700", color: theme.text },
  gapReason: { fontSize: 13, color: theme.textSecondary, marginTop: 6, lineHeight: 19 },
  gapAction: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.border },
  gapActionText: { fontSize: 12, color: theme.primary, fontWeight: "600", flex: 1 },
  coveredCard: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 16, marginBottom: 8, backgroundColor: theme.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: theme.border },
  coveredInfo: { flex: 1 },
  coveredLabel: { fontSize: 14, fontWeight: "600", color: theme.text },
  coveredAmount: { fontSize: 12, color: theme.muted, marginTop: 2 },
  allGoodCard: { alignItems: "center", paddingVertical: 40, paddingHorizontal: 32 },
  allGoodTitle: { fontSize: 18, fontWeight: "700", color: theme.text, marginTop: 16 },
  allGoodSub: { fontSize: 14, color: theme.muted, marginTop: 8, textAlign: "center" },
});