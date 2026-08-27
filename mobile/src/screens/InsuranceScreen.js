import React, { useEffect, useState, useCallback } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Modal, TextInput, ActivityIndicator, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { api } from "../services/api";
import SmartAddBar from "../components/SmartAddBar";
import PanelChat from "../components/PanelChat";
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

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={theme.primary} /></View>;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Insurance</Text>
        <Text style={styles.subtitle}>Protect what matters</Text>
      </View>
      <SmartAddBar context="Insurance" onSaved={load} />

      {/* Upcoming Premiums */}
      {premiumCal && premiumCal.upcoming && premiumCal.upcoming.length > 0 && (
        <View style={styles.premiumCard}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <Ionicons name="calendar" size={18} color={theme.primary} />
            <Text style={styles.premiumTitle}>Upcoming Premiums</Text>
          </View>
          {premiumCal.upcoming.slice(0, 5).map((p, i) => (
            <View key={i} style={styles.premiumRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.premiumType}>{p.policy_type}</Text>
                <Text style={styles.premiumProvider}>{p.provider}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.premiumAmt}>{formatMoney(p.premium_amount)}</Text>
                <Text style={[styles.premiumDue, { color: p.daysUntil <= 7 ? "#ef4444" : p.daysUntil <= 30 ? "#f59e0b" : theme.muted }]}>
                  {p.daysUntil <= 0 ? "Overdue" : `in ${p.daysUntil} days`}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Policies list */}
      {items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="shield-checkmark" size={40} color={theme.muted} />
          <Text style={styles.emptyText}>No policies yet. Tap + to add your first one!</Text>
        </View>
      ) : (
        items.map((item) => (
          <View key={item.insurance_id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="shield" size={20} color={theme.primary} />
              <Text style={styles.cardTitle}>{item.policy_type}</Text>
              <TouchableOpacity onPress={() => del(item.insurance_id)}><Ionicons name="trash-outline" size={16} color={theme.destructive} /></TouchableOpacity>
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.cardLabel}>Provider</Text>
              <Text style={styles.cardValue}>{item.provider || "—"}</Text>
              <Text style={styles.cardLabel}>Sum Assured</Text>
              <Text style={styles.cardValue}>{formatMoney(item.sum_assured)}</Text>
              <Text style={styles.cardLabel}>Premium</Text>
              <Text style={styles.cardValue}>{formatMoney(item.premium_amount)} / {item.premium_frequency}</Text>
              {item.policy_number && <><Text style={styles.cardLabel}>Policy No</Text><Text style={styles.cardValue}>{item.policy_number}</Text></>}
              {item.nominee && <><Text style={styles.cardLabel}>Nominee</Text><Text style={styles.cardValue}>{item.nominee}</Text></>}
            </View>
          </View>
        ))
      )}

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => { setForm(EMPTY); setShow(true); }}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* PanelChat — always visible */}
      <View style={{ paddingBottom: 16 }}>
        <PanelChat context="Insurance" title="Ask AI about insurance" />
      </View>

      {/* Add Modal */}
      <Modal visible={show} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Insurance Policy</Text>
            <TextInput style={styles.input} placeholder="Policy Type (e.g. Term Life)" placeholderTextColor={theme.muted} value={form.policy_type} onChangeText={(v) => setForm({ ...form, policy_type: v })} />
            <TextInput style={styles.input} placeholder="Provider" placeholderTextColor={theme.muted} value={form.provider} onChangeText={(v) => setForm({ ...form, provider: v })} />
            <TextInput style={styles.input} placeholder="Policy Number" placeholderTextColor={theme.muted} value={form.policy_number} onChangeText={(v) => setForm({ ...form, policy_number: v })} />
            <TextInput style={styles.input} placeholder="Sum Assured" placeholderTextColor={theme.muted} value={form.sum_assured} onChangeText={(v) => setForm({ ...form, sum_assured: v })} keyboardType="decimal-pad" />
            <TextInput style={styles.input} placeholder="Premium Amount" placeholderTextColor={theme.muted} value={form.premium_amount} onChangeText={(v) => setForm({ ...form, premium_amount: v })} keyboardType="decimal-pad" />
            <TextInput style={styles.input} placeholder="Maturity Date" placeholderTextColor={theme.muted} value={form.maturity_date} onChangeText={(v) => setForm({ ...form, maturity_date: v })} />
            <TextInput style={styles.input} placeholder="Nominee" placeholderTextColor={theme.muted} value={form.nominee} onChangeText={(v) => setForm({ ...form, nominee: v })} />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShow(false)}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={save}><Text style={styles.saveText}>Save</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  center: { flex: 1, backgroundColor: theme.background, justifyContent: "center", alignItems: "center" },
  header: { padding: 20, paddingTop: 60 },
  title: { fontSize: 24, fontWeight: "800", color: theme.text },
  subtitle: { fontSize: 14, color: theme.muted, marginTop: 4 },
  premiumCard: { marginHorizontal: 16, marginTop: 12, backgroundColor: theme.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: theme.border },
  premiumTitle: { fontSize: 15, fontWeight: "700", color: theme.text },
  premiumRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: theme.border },
  premiumType: { fontSize: 13, color: theme.text, fontWeight: "600" },
  premiumProvider: { fontSize: 11, color: theme.muted },
  premiumAmt: { fontSize: 13, color: theme.text, fontWeight: "600" },
  premiumDue: { fontSize: 11 },
  empty: { alignItems: "center", paddingVertical: 60, paddingHorizontal: 32 },
  emptyText: { fontSize: 14, color: theme.muted, marginTop: 12, textAlign: "center" },
  card: { marginHorizontal: 16, marginBottom: 10, backgroundColor: theme.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: theme.border },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: theme.text, flex: 1 },
  cardBody: {},
  cardLabel: { fontSize: 11, color: theme.muted, marginTop: 8, textTransform: "uppercase" },
  cardValue: { fontSize: 14, color: theme.text, fontWeight: "500" },
  fab: { position: "absolute", bottom: 20, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: theme.primary, justifyContent: "center", alignItems: "center", elevation: 8, shadowColor: "#000", shadowOpacity: 0.3, shadowOffset: { width: 0, height: 2 }, shadowRadius: 4, zIndex: 10 },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  modalContent: { backgroundColor: theme.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
  modalTitle: { fontSize: 20, fontWeight: "800", color: theme.text, marginBottom: 12 },
  input: { backgroundColor: theme.background, borderRadius: 10, padding: 12, fontSize: 15, color: theme.text, marginBottom: 10, borderWidth: 1, borderColor: theme.border },
  modalButtons: { flexDirection: "row", gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center", borderWidth: 1, borderColor: theme.border },
  cancelText: { fontSize: 16, color: theme.muted, fontWeight: "600" },
  saveBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center", backgroundColor: theme.primary },
  saveText: { fontSize: 16, color: "#fff", fontWeight: "700" },
});