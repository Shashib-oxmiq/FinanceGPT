import React, { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { api } from "../services/api";
import { computeHealthScore, getScoreColor, getScoreLabel } from "../services/healthScore";
import { recordWeeklySnapshot, getTrendDirection } from "../services/healthScoreTrend";
import { getGoals, getGoalProgress } from "../services/goals";
import SmartAddBar from "../components/SmartAddBar";
import PanelChat from "../components/PanelChat";
import { theme, formatMoney } from "../theme";

export default function DashboardScreen({ navigation }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [reminders, setReminders] = useState([]);
  const [investments, setInvestments] = useState([]);
  const [healthScore, setHealthScore] = useState(null);
  const [goals, setGoals] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const s = await api.getInvestmentSummary(user.user_id);
      setSummary(s);
      const r = await api.getReminders(user.user_id);
      setReminders(r.reminders || []);
      const inv = await api.getInvestments(user.user_id);
      setInvestments(inv);
      const hs = await computeHealthScore(user.user_id);
      setHealthScore(hs);
      try { await recordWeeklySnapshot(user.user_id, hs.score, hs.categories); const trend = await getTrendDirection(user.user_id); if (trend) setHealthScore({ ...hs, trend }); } catch (e) { console.warn(e); }
      const g = await getGoals(user.user_id);
      setGoals(g);
    } catch (e) { console.error(e); }
  }, [user]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const cards = [
    { label: t("stat.total_invested"), value: summary ? formatMoney(summary.total_invested) : "—", icon: "cash", color: theme.primary },
    { label: t("stat.current_value"), value: summary ? formatMoney(summary.total_current) : "—", icon: "trending-up", color: theme.accent },
    { label: t("stat.total_gain"), value: summary ? `${summary.total_gain >= 0 ? "+" : ""}${formatMoney(summary.total_gain)}` : "—", icon: "stats-chart", color: summary?.total_gain >= 0 ? theme.accent : theme.destructive },
    { label: t("stat.net_worth"), value: summary ? formatMoney(summary.net_worth) : "—", icon: "diamond", color: theme.primary },
  ];

  const navItems = [
    { label: t("nav.investments"), icon: "trending-up", screen: "Money" },
    { label: t("nav.insurance"), icon: "shield-checkmark", screen: "Insurance" },
    { label: t("nav.vault"), icon: "folder", screen: "Vault" },
    { label: t("nav.reminders"), icon: "notifications", screen: "Reminders" },
    { label: "Schemes", icon: "business", screen: "Schemes" },
    { label: "Goals", icon: "flag", screen: "Goals" },
    { label: "Loans", icon: "card", screen: "Loans" },
    { label: "Bills", icon: "receipt", screen: "Bills" },
    { label: "Tax", icon: "calculator", screen: "Tax" },
    { label: "Retirement", icon: "happy", screen: "Retirement" },
    { label: "Education", icon: "school", screen: "Education" },
    { label: "Property", icon: "business", screen: "Property" },
    { label: "Medical", icon: "medkit", screen: "MedicalRecords" },
    { label: "Rights", icon: "scale", screen: "LegalRights" },
    { label: "Expenses", icon: "cash", screen: "Expenses" },
    { label: "Family", icon: "people", screen: "Family" },
    { label: t("nav.profile"), icon: "person", screen: "Profile" },
  ];

  return (
    <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}>
      <View style={styles.header}>
        <Text style={styles.greeting}>Hello, {user?.name || "there"}</Text>
        <Text style={styles.subtitle}>{t("page.dashboard.subtitle")}</Text>
      </View>
      <SmartAddBar context="Dashboard" onSaved={load} />

      {/* Financial Health Score */}
      {healthScore && (
        <View style={styles.healthCard}>
          <View style={styles.healthHeader}>
            <View>
              <Text style={styles.healthTitle}>Financial Health</Text>
              <Text style={styles.healthSub}>{getScoreLabel(healthScore.score)}</Text>
              {healthScore.trend && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
                  <Ionicons name={healthScore.trend.direction === "improving" ? "trending-up" : healthScore.trend.direction === "declining" ? "trending-down" : "remove"} size={12} color={healthScore.trend.direction === "improving" ? "#10b981" : healthScore.trend.direction === "declining" ? "#ef4444" : theme.muted} />
                  <Text style={{ fontSize: 11, color: theme.muted }}>{healthScore.trend.direction === "improving" ? "Improving" : healthScore.trend.direction === "declining" ? "Declining" : "Stable"}{healthScore.trend.delta ? ` (${healthScore.trend.delta > 0 ? "+" : ""}${healthScore.trend.delta} pts)` : ""}</Text>
                </View>
              )}
            </View>
            <View style={[styles.healthScore, { borderColor: getScoreColor(healthScore.score) }]}>
              <Text style={[styles.healthScoreText, { color: getScoreColor(healthScore.score) }]}>{healthScore.score}</Text>
              <Text style={styles.healthScoreMax}>/100</Text>
            </View>
          </View>
          <View style={styles.healthBar}>
            <View style={[styles.healthBarFill, { width: `${healthScore.score}%`, backgroundColor: getScoreColor(healthScore.score) }]} />
          </View>
          {healthScore.tips.length > 0 && (
            <View style={styles.healthTips}>
              {healthScore.tips.slice(0, 2).map((tip, i) => (
                <View key={i} style={styles.healthTipRow}>
                  <Ionicons name="bulb" size={12} color={theme.primary} />
                  <Text style={styles.healthTipText}>{tip}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      <View style={styles.cardsGrid}>
        {cards.map((c, i) => (
          <View key={i} style={styles.card}>
            <Ionicons name={c.icon} size={20} color={c.color} />
            <Text style={styles.cardLabel}>{c.label}</Text>
            <Text style={styles.cardValue}>{c.value}</Text>
          </View>
        ))}
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Access</Text>
        <View style={styles.navGrid}>
          {navItems.map((item, i) => (
            <TouchableOpacity key={i} style={styles.navItem} onPress={() => navigation.navigate(item.screen)}>
              <Ionicons name={item.icon} size={24} color={theme.primary} />
              <Text style={styles.navLabel}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      {reminders.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Upcoming Reminders</Text>
          {reminders.slice(0, 3).map((r) => (
            <View key={r.reminder_id} style={styles.reminderItem}>
              <Ionicons name="notifications" size={16} color={theme.primary} />
              <Text style={styles.reminderText}>{r.title}</Text>
              <Text style={styles.reminderDate}>{r.due_date}</Text>
            </View>
          ))}
        </View>
      )}
      {goals.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Financial Goals</Text>
            <TouchableOpacity onPress={() => navigation.navigate("Goals")}>
              <Text style={styles.seeAllText}>See all</Text>
            </TouchableOpacity>
          </View>
          {goals.slice(0, 2).map((goal) => {
            const prog = getGoalProgress(goal);
            return (
              <TouchableOpacity key={goal.goal_id} style={styles.goalItem} onPress={() => navigation.navigate("Goals")}>
                <View style={styles.goalItemLeft}>
                  <Text style={styles.goalItemTitle}>{goal.title}</Text>
                  <Text style={styles.goalItemAmt}>{formatMoney(goal.current_amount)} / {formatMoney(goal.target_amount)}</Text>
                </View>
                <View style={styles.goalItemRight}>
                  <Text style={styles.goalItemPct}>{prog.pct}%</Text>
                  <Ionicons name={prog.onTrack ? "checkmark-circle" : "warning"} size={16} color={prog.onTrack ? theme.accent : "#f59e0b"} />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
      {investments.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Investments</Text>
          {investments.slice(0, 3).map((inv) => (
            <View key={inv.investment_id} style={styles.reminderItem}>
              <Ionicons name="trending-up" size={16} color={theme.accent} />
              <Text style={styles.reminderText}>{inv.name}</Text>
              <Text style={styles.reminderDate}>{formatMoney(inv.current_value)}</Text>
            </View>
          ))}
        </View>
      )}
      <View style={{ paddingBottom: 16 }}>
        <PanelChat context="Dashboard" />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: { padding: 20, paddingTop: 60 },
  greeting: { fontSize: 24, fontWeight: "800", color: theme.text },
  subtitle: { fontSize: 14, color: theme.muted, marginTop: 4 },
  cardsGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, gap: 12 },
  card: { width: "48%", backgroundColor: theme.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: theme.border, flexGrow: 1 },
  cardLabel: { fontSize: 11, color: theme.muted, marginTop: 8, textTransform: "uppercase", letterSpacing: 1 },
  cardValue: { fontSize: 18, fontWeight: "700", color: theme.text, marginTop: 4 },
  section: { padding: 20, paddingTop: 24 },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: theme.text, marginBottom: 12 },
  navGrid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  navItem: { width: 100, backgroundColor: theme.card, borderRadius: 16, padding: 16, alignItems: "center", borderWidth: 1, borderColor: theme.border },
  navLabel: { fontSize: 12, color: theme.textSecondary, marginTop: 8, textAlign: "center" },
  reminderItem: { flexDirection: "row", alignItems: "center", backgroundColor: theme.card, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: theme.border, gap: 8 },
  reminderText: { flex: 1, fontSize: 14, color: theme.text },
  reminderDate: { fontSize: 12, color: theme.muted },
  // Health score
  healthCard: { marginHorizontal: 16, marginTop: 12, backgroundColor: theme.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: theme.border },
  healthHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  healthTitle: { fontSize: 16, fontWeight: "700", color: theme.text },
  healthSub: { fontSize: 12, color: theme.muted, marginTop: 2 },
  healthScore: { borderWidth: 2, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, flexDirection: "row", alignItems: "baseline", gap: 2 },
  healthScoreText: { fontSize: 22, fontWeight: "800" },
  healthScoreMax: { fontSize: 12, color: theme.muted },
  healthBar: { height: 8, backgroundColor: theme.border, borderRadius: 4, overflow: "hidden" },
  healthBarFill: { height: 8, borderRadius: 4 },
  healthTips: { marginTop: 10, gap: 6 },
  healthTipRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  healthTipText: { fontSize: 12, color: theme.textSecondary, flex: 1 },
  // Goals widget
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  seeAllText: { fontSize: 14, color: theme.primary, fontWeight: "600" },
  goalItem: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: theme.card, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: theme.border },
  goalItemLeft: { flex: 1 },
  goalItemTitle: { fontSize: 14, fontWeight: "600", color: theme.text },
  goalItemAmt: { fontSize: 12, color: theme.muted, marginTop: 2 },
  goalItemRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  goalItemPct: { fontSize: 16, fontWeight: "700", color: theme.accent },
});