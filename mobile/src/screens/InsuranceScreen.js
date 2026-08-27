import React, { useEffect, useState, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { api } from "../services/api";
import SmartAddBar from "../components/SmartAddBar";
import ChatFirstLayout from "../components/ChatFirstLayout";
import { theme, formatMoney } from "../theme";
import { getPremiumCalendar } from "../services/premiumCalendar";

const EMPTY = { policy_type: "", provider: "", policy_number: "", sum_assured: "", premium_amount: "", premium_frequency: "annual", start_date: "", maturity_date: "", nominee: "", notes: "" };

export default function InsuranceScreen() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [premiumCal, setPremiumCal] = useState(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const data = await api.getInsurance(user.user_id);
      setItems(Array.isArray(data) ? data : []);
    } catch (e) { console.error("Insurance load error:", e); setItems([]); }
    try { setPremiumCal(await getPremiumCalendar(user.user_id)); } catch (e) { console.warn("Premium cal error:", e); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.policy_type) return;
    const data = { ...form, sum_assured: parseFloat(form.sum_assured) || 0, premium_amount: parseFloat(form.premium_amount) || 0 };
    await api.addInsurance(user.user_id, data);
    setForm(EMPTY); setShow(false); load();
  };

  const del = async (id) => { await api.deleteInsurance(id, user.user_id); load(); };

  // ── Info panel content (rendered inside ChatFirstLayout's bottom sheet) ──
  const infoContent = (
    <ScrollView style={infoStyles.container} showsVerticalScrollIndicator={false}>
      <SmartAddBar context="Insurance" onSaved={load} />

      {/* Upcoming Premiums */}
      {premiumCal && premiumCal.upcoming && premiumCal.upcoming.length > 0 && (
        <View style={infoStyles.premiumCard}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <Ionicons name="calendar" size={18} color={theme.primary} />
            <Text style={infoStyles.premiumTitle}>Upcoming Premiums</Text>
          </View>
          {premiumCal.upcoming.slice(0, 5).map((p, i) => (
            <View key={i} style={infoStyles.premiumRow}>
              <View style={{ flex: 1 }}>
                <Text style={infoStyles.premiumType}>{p.policy_type}</Text>
                <Text style={infoStyles.premiumProvider}>{p.provider}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={infoStyles.premiumAmt}>{formatMoney(p.premium_amount)}</Text>
                <Text style={[infoStyles.premiumDue, { color: p.daysUntil <= 7 ? "#ef4444" : p.daysUntil <= 30 ? "#f59e0b" : theme.muted }]}>
                  {p.daysUntil <= 0 ? "Overdue" : `in ${p.daysUntil} days`}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Policies list */}
      {loading ? (
        <View style={infoStyles.center}><ActivityIndicator size="large" color={theme.primary} /></View>
      ) : items.length === 0 ? (
        <View style={infoStyles.empty}>
          <Ionicons name="shield-checkmark" size={40} color={theme.muted} />
          <Text style={infoStyles.emptyText}>No policies yet. Tap + to add your first one!</Text>
        </View>
      ) : (
        items.map((item) => (
          <View key={item.insurance_id} style={infoStyles.card}>
            <View style={infoStyles.cardHeader}>
              <Ionicons name="shield" size={20} color={theme.primary} />
              <Text style={infoStyles.cardTitle}>{item.policy_type}</Text>
              <TouchableOpacity onPress={() => del(item.insurance_id)}><Ionicons name="trash-outline" size={16} color={theme.destructive} /></TouchableOpacity>
            </View>
            <View style={infoStyles.cardBody}>
              <Text style={infoStyles.cardLabel}>Provider</Text>
              <Text style={infoStyles.cardValue}>{item.provider || "—"}</Text>
              <Text style={infoStyles.cardLabel}>Sum Assured</Text>
              <Text style={infoStyles.cardValue}>{formatMoney(item.sum_assured)}</Text>
              <Text style={infoStyles.cardLabel}>Premium</Text>
              <Text style={infoStyles.cardValue}>{formatMoney(item.premium_amount)} / {item.premium_frequency || "year"}</Text>
              {item.nominee && (<><Text style={infoStyles.cardLabel}>Nominee</Text><Text style={infoStyles.cardValue}>{item.nominee}</Text></>)}
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );

  return (
    <ChatFirstLayout context="Insurance" infoLabel={items.length > 0 ? `My Policies (${items.length})` : "Add Policy"}>
      {infoContent}
    </ChatFirstLayout>
  );
}

const infoStyles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  premiumCard: { backgroundColor: theme.card, borderRadius: 12, borderWidth: 1, borderColor: theme.border, padding: 14, marginBottom: 12 },
  premiumTitle: { fontSize: 14, fontWeight: "700", color: theme.text },
  premiumRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.border },
  premiumType: { fontSize: 13, fontWeight: "600", color: theme.text },
  premiumProvider: { fontSize: 11, color: theme.muted, marginTop: 2 },
  premiumAmt: { fontSize: 13, fontWeight: "700", color: theme.text },
  premiumDue: { fontSize: 11, marginTop: 2 },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 40, gap: 12 },
  emptyText: { fontSize: 13, color: theme.muted, textAlign: "center" },
  card: { backgroundColor: theme.card, borderRadius: 12, borderWidth: 1, borderColor: theme.border, padding: 14, marginBottom: 10 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  cardTitle: { fontSize: 15, fontWeight: "700", color: theme.text, flex: 1 },
  cardBody: { gap: 4 },
  cardLabel: { fontSize: 11, color: theme.muted, marginTop: 6 },
  cardValue: { fontSize: 13, color: theme.text, fontWeight: "500" },
});