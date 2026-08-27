import React, { useEffect, useState, useCallback } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Modal, TextInput, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { api } from "../services/api";
import SmartAddBar from "../components/SmartAddBar";
import PanelChat from "../components/PanelChat";
import { theme, formatMoney } from "../theme";

const EMPTY = { policy_type: "", provider: "", policy_number: "", sum_assured: "", premium_amount: "", premium_frequency: "annual", start_date: "", maturity_date: "", nominee: "", notes: "" };

export default function InsuranceScreen() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    try { const data = await api.getInsurance(user.user_id); setItems(data); }
    catch (e) { console.error(e); }
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
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t("page.insurance.title")}</Text>
        <Text style={styles.subtitle}>{t("page.insurance.subtitle")}</Text>
      </View>
      <SmartAddBar context="Insurance" onSaved={load} />
      {items.length === 0 ? (
        <View style={styles.empty}><Ionicons name="shield-checkmark" size={40} color={theme.muted} /><Text style={styles.emptyText}>No policies yet. Add your first one!</Text></View>
      ) : (
        <FlatList data={items} keyExtractor={(x) => x.insurance_id} contentContainerStyle={{ paddingBottom: 80 }} ListFooterComponent={<PanelChat context="Insurance" />}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="shield" size={20} color={theme.primary} />
                <Text style={styles.cardTitle}>{item.policy_type}</Text>
                <TouchableOpacity onPress={() => del(item.insurance_id)}><Ionicons name="trash-outline" size={16} color={theme.destructive} /></TouchableOpacity>
              </View>
              <Text style={styles.cardProvider}>{item.provider}</Text>
              <View style={styles.cardRow}>
                <Text style={styles.cardLabel}>Sum Assured</Text>
                <Text style={styles.cardValue}>{formatMoney(item.sum_assured)}</Text>
              </View>
              <View style={styles.cardRow}>
                <Text style={styles.cardLabel}>Premium</Text>
                <Text style={styles.cardValue}>{formatMoney(item.premium_amount)} / {item.premium_frequency}</Text>
              </View>
              {item.maturity_date ? <Text style={styles.cardMaturity}>Maturity: {item.maturity_date}</Text> : null}
            </View>
          )}
        />
      )}
      <TouchableOpacity style={styles.fab} onPress={() => { setForm(EMPTY); setShow(true); }}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
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
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShow(false)}><Text style={styles.cancelText}>{t("common.cancel")}</Text></TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={save}><Text style={styles.saveText}>{t("button.save")}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  center: { flex: 1, backgroundColor: theme.background, justifyContent: "center", alignItems: "center" },
  header: { padding: 20, paddingTop: 60 },
  title: { fontSize: 24, fontWeight: "800", color: theme.text },
  subtitle: { fontSize: 14, color: theme.muted, marginTop: 4 },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", paddingBottom: 100 },
  emptyText: { color: theme.muted, fontSize: 14, marginTop: 12, textAlign: "center" },
  card: { backgroundColor: theme.card, borderRadius: 16, padding: 16, marginHorizontal: 16, marginBottom: 12, borderWidth: 1, borderColor: theme.border },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  cardTitle: { flex: 1, fontSize: 16, fontWeight: "700", color: theme.text },
  cardProvider: { fontSize: 13, color: theme.muted, marginBottom: 12 },
  cardRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  cardLabel: { fontSize: 13, color: theme.muted },
  cardValue: { fontSize: 13, fontWeight: "600", color: theme.text },
  cardMaturity: { fontSize: 12, color: theme.muted, marginTop: 8 },
  fab: { position: "absolute", bottom: 20, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: theme.primary, justifyContent: "center", alignItems: "center", elevation: 8, shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: theme.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "85%" },
  modalTitle: { fontSize: 20, fontWeight: "700", color: theme.text, marginBottom: 16 },
  input: { backgroundColor: theme.input, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text, marginBottom: 10, borderWidth: 1, borderColor: theme.border },
  modalButtons: { flexDirection: "row", gap: 12, marginTop: 16 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: theme.border, alignItems: "center" },
  cancelText: { color: theme.textSecondary, fontSize: 15, fontWeight: "600" },
  saveBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: theme.primary, alignItems: "center" },
  saveText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});