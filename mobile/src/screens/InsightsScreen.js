import React, { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { api } from "../services/api";
import SmartAddBar from "../components/SmartAddBar";
import PanelChat from "../components/PanelChat";
import { theme, formatMoney } from "../theme";

export default function InsightsScreen({ navigation }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    try { const s = await api.getInvestmentSummary(user.user_id); setSummary(s); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={theme.primary} /></View>;

  const roi = summary?.roi_pct?.toFixed(1) || "0.0";
  const gain = summary?.total_gain || 0;
  const byType = summary?.by_type || {};

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{t("page.insights.title")}</Text>
          <Text style={styles.subtitle}>{t("page.insights.subtitle")}</Text>
        </View>
      </View>
      <SmartAddBar context="Insights" onSaved={load} />
      <View style={styles.heroCard}>
        <Text style={styles.heroLabel}>Portfolio ROI</Text>
        <Text style={[styles.heroValue, { color: gain >= 0 ? theme.accent : theme.destructive }]}>{roi}%</Text>
        <Text style={styles.heroSub}>{gain >= 0 ? "+" : ""}{formatMoney(gain)} total {gain >= 0 ? "gain" : "loss"}</Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Allocation by Type</Text>
        {Object.keys(byType).length === 0 ? (
          <Text style={styles.emptyText}>No investments to analyze yet.</Text>
        ) : (
          Object.entries(byType).map(([type, data]) => {
            const pct = summary.total_current ? ((data.current / summary.total_current) * 100).toFixed(1) : "0";
            return (
              <View key={type} style={styles.allocRow}>
                <View style={styles.allocLeft}>
                  <Ionicons name="pie-chart" size={16} color={theme.primary} />
                  <Text style={styles.allocType}>{type.replace(/_/g, " ")}</Text>
                </View>
                <View style={styles.allocRight}>
                  <Text style={styles.allocPct}>{pct}%</Text>
                  <Text style={styles.allocVal}>{formatMoney(data.current)}</Text>
                </View>
              </View>
            );
          })
        )}
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>AI Insights</Text>
        <PanelChat context="Insights" title="Ask AI for personalized recommendations" />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  center: { flex: 1, backgroundColor: theme.background, justifyContent: "center", alignItems: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, padding: 20, paddingTop: 60 },
  backBtn: { padding: 4 },
  title: { fontSize: 24, fontWeight: "800", color: theme.text },
  subtitle: { fontSize: 14, color: theme.muted, marginTop: 4 },
  heroCard: { marginHorizontal: 20, backgroundColor: theme.card, borderRadius: 20, padding: 24, alignItems: "center", borderWidth: 1, borderColor: theme.border },
  heroLabel: { fontSize: 12, color: theme.muted, textTransform: "uppercase", letterSpacing: 2 },
  heroValue: { fontSize: 48, fontWeight: "800", marginTop: 8 },
  heroSub: { fontSize: 14, color: theme.muted, marginTop: 4 },
  section: { padding: 20, paddingTop: 24 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: theme.text, marginBottom: 12 },
  emptyText: { fontSize: 14, color: theme.muted, textAlign: "center", paddingVertical: 20 },
  allocRow: { flexDirection: "row", justifyContent: "space-between", backgroundColor: theme.card, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: theme.border },
  allocLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  allocType: { fontSize: 14, color: theme.text, textTransform: "capitalize" },
  allocRight: { alignItems: "flex-end" },
  allocPct: { fontSize: 14, fontWeight: "700", color: theme.text },
  allocVal: { fontSize: 12, color: theme.muted },
  insightCard: { flexDirection: "row", gap: 12, backgroundColor: theme.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: theme.border },
  insightText: { flex: 1, fontSize: 14, color: theme.textSecondary, lineHeight: 20 },
});