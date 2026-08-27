import React, { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { api } from "../services/api";
import SmartAddBar from "../components/SmartAddBar";
import PanelChat from "../components/PanelChat";
import { theme, formatMoney } from "../theme";

export default function DashboardScreen({ navigation }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [reminders, setReminders] = useState([]);
  const [investments, setInvestments] = useState([]);
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
    { label: t("nav.loan_prep"), icon: "document-text", screen: "Forms" },
    { label: t("nav.profile"), icon: "person", screen: "Profile" },
  ];

  return (
    <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}>
      <View style={styles.header}>
        <Text style={styles.greeting}>Hello, {user?.name || "there"}</Text>
        <Text style={styles.subtitle}>{t("page.dashboard.subtitle")}</Text>
      </View>
      <SmartAddBar context="Dashboard" onSaved={load} />
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
});