import React, { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Modal, TextInput, Alert, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { getProperties, createProperty, deleteProperty, getPropertySummary, PROPERTY_TYPES, PROPERTY_TAX_INFO } from "../services/property";
import { theme, formatMoney } from "../theme";
import PanelChat from "../components/PanelChat";

export default function PropertyScreen({ navigation }) {
  const { user } = useAuth();
  const [properties, setProperties] = useState([]);
  const [summary, setSummary] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ property_type: "residential", address: "", city: "", state: "", purchase_price: "", current_value: "", purchase_date: "", area_sqft: "", ownership: "sole" });

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const p = await getProperties(user.user_id);
      setProperties(p);
      const s = await getPropertySummary(user.user_id);
      setSummary(s);
    } catch (e) { console.error(e); }
  }, [user]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const handleAdd = async () => {
    if (!form.address && !form.city) { Alert.alert("Enter address or city"); return; }
    await createProperty(user.user_id, {
      ...form,
      purchase_price: parseFloat(form.purchase_price) || 0,
      current_value: parseFloat(form.current_value) || parseFloat(form.purchase_price) || 0,
      area_sqft: parseFloat(form.area_sqft) || 0,
    });
    setForm({ property_type: "residential", address: "", city: "", state: "", purchase_price: "", current_value: "", purchase_date: "", area_sqft: "", ownership: "sole" });
    setShowAdd(false);
    await load();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Property & Assets</Text>
        <TouchableOpacity onPress={() => setShowAdd(true)}>
          <Ionicons name="add-circle" size={28} color={theme.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}>
        {summary && summary.count > 0 && (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total Property Value</Text>
            <Text style={styles.summaryVal}>{formatMoney(summary.totalValue)}</Text>
            <View style={styles.summaryRow}>
              <View><Text style={styles.summarySub}>{summary.appreciationPct >= 0 ? "+" : ""}{summary.appreciationPct}%</Text><Text style={styles.summarySubLabel}>Appreciation</Text></View>
              <View><Text style={styles.summarySub}>{formatMoney(summary.totalAppreciation)}</Text><Text style={styles.summarySubLabel}>Gain/Loss</Text></View>
              <View><Text style={styles.summarySub}>{summary.count}</Text><Text style={styles.summarySubLabel}>Properties</Text></View>
            </View>
            {summary.totalTaxDue > 0 && (
              <View style={styles.taxAlert}>
                <Ionicons name="warning" size={14} color="#f59e0b" />
                <Text style={styles.taxAlertText}>Property tax due: {formatMoney(summary.totalTaxDue)}</Text>
              </View>
            )}
            {summary.mutationPending > 0 && (
              <View style={styles.taxAlert}>
                <Ionicons name="alert-circle" size={14} color="#3b82f6" />
                <Text style={[styles.taxAlertText, { color: "#3b82f6" }]}>{summary.mutationPending} property mutation pending</Text>
              </View>
            )}
          </View>
        )}

        {properties.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="business" size={48} color={theme.muted} />
            <Text style={styles.emptyTitle}>No properties tracked</Text>
            <Text style={styles.emptySub}>Track your real estate, vehicles, gold — all assets in one place</Text>
          </View>
        )}

        {properties.map((prop) => {
          const typeInfo = PROPERTY_TYPES.find(t => t.key === prop.property_type) || PROPERTY_TYPES[6];
          const appreciation = prop.purchase_price > 0 ? Math.round(((prop.current_value - prop.purchase_price) / prop.purchase_price) * 100) : 0;
          const taxInfo = PROPERTY_TAX_INFO[prop.city] || PROPERTY_TAX_INFO.default;
          return (
            <View key={prop.property_id} style={styles.propCard}>
              <View style={styles.propHeader}>
                <View style={[styles.propIcon, { backgroundColor: typeInfo.color + "20" }]}>
                  <Ionicons name={typeInfo.icon} size={18} color={typeInfo.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.propType}>{typeInfo.label}</Text>
                  <Text style={styles.propAddr} numberOfLines={1}>{prop.address || prop.city}</Text>
                </View>
                <TouchableOpacity onPress={() => { Alert.alert("Delete?", "Remove this property?", [{ text: "Cancel" }, { text: "Delete", onPress: async () => { await deleteProperty(prop.property_id); await load(); } }]); }}>
                  <Ionicons name="trash-outline" size={16} color={theme.muted} />
                </TouchableOpacity>
              </View>
              <View style={styles.propStats}>
                <View><Text style={styles.propStatVal}>{formatMoney(prop.current_value)}</Text><Text style={styles.propStatLabel}>Current Value</Text></View>
                <View><Text style={styles.propStatVal}>{formatMoney(prop.purchase_price)}</Text><Text style={styles.propStatLabel}>Purchase Price</Text></View>
                <View><Text style={[styles.propStatVal, { color: appreciation >= 0 ? theme.accent : "#ef4444" }]}>{appreciation >= 0 ? "+" : ""}{appreciation}%</Text><Text style={styles.propStatLabel}>Appreciation</Text></View>
              </View>
              {prop.property_tax_amount > 0 && (
                <View style={styles.propTaxRow}>
                  <Ionicons name="receipt" size={12} color="#f59e0b" />
                  <Text style={styles.propTaxText}>Tax: {formatMoney(prop.property_tax_amount)} · {taxInfo.authority} · Due: {prop.property_tax_due || taxInfo.due}</Text>
                </View>
              )}
              <View style={styles.propMetaRow}>
                {prop.area_sqft > 0 && <Text style={styles.propMeta}>{prop.area_sqft} sq ft</Text>}
                {prop.ownership && prop.ownership !== "sole" && <Text style={styles.propMeta}>{prop.ownership} ownership</Text>}
                {prop.mutation_status === "pending" && <Text style={[styles.propMeta, { color: "#3b82f6" }]}>⚠ Mutation pending</Text>}
              </View>
              {prop.city && taxInfo.url && (
                <TouchableOpacity style={styles.payTaxBtn} onPress={() => Linking.openURL(`https://${taxInfo.url}`)}>
                  <Ionicons name="globe" size={14} color={theme.primary} />
                  <Text style={styles.payTaxText}>Pay Property Tax — {taxInfo.authority}</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        <View style={{ paddingBottom: 16 }}>
          <PanelChat context="Property" title="Ask AI about property matters" />
        </View>
      </ScrollView>

      <Modal visible={showAdd} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Property / Asset</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {PROPERTY_TYPES.map((t) => (
                <TouchableOpacity key={t.key} style={[styles.typeChip, form.property_type === t.key && { backgroundColor: t.color, borderColor: t.color }]} onPress={() => setForm({ ...form, property_type: t.key })}>
                  <Ionicons name={t.icon} size={12} color={form.property_type === t.key ? "#fff" : theme.muted} />
                  <Text style={[styles.typeChipText, form.property_type === t.key && { color: "#fff" }]}>{t.label.split(" (")[0]}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TextInput style={styles.input} placeholder="Address" value={form.address} onChangeText={(v) => setForm({ ...form, address: v })} />
            <View style={styles.inputRow}>
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="City" value={form.city} onChangeText={(v) => setForm({ ...form, city: v })} />
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="State" value={form.state} onChangeText={(v) => setForm({ ...form, state: v })} />
            </View>
            <View style={styles.inputRow}>
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="Purchase price (₹)" keyboardType="numeric" value={form.purchase_price} onChangeText={(v) => setForm({ ...form, purchase_price: v })} />
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="Current value (₹)" keyboardType="numeric" value={form.current_value} onChangeText={(v) => setForm({ ...form, current_value: v })} />
            </View>
            <View style={styles.inputRow}>
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="Purchase date" value={form.purchase_date} onChangeText={(v) => setForm({ ...form, purchase_date: v })} />
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="Area (sq ft)" keyboardType="numeric" value={form.area_sqft} onChangeText={(v) => setForm({ ...form, area_sqft: v })} />
            </View>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAdd(false)}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleAdd}><Text style={styles.saveText}>Save</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 60, paddingBottom: 12 },
  title: { fontSize: 22, fontWeight: "800", color: theme.text, flex: 1, marginLeft: 12 },
  summaryCard: { marginHorizontal: 16, marginTop: 8, backgroundColor: theme.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: theme.border, alignItems: "center" },
  summaryLabel: { fontSize: 12, color: theme.muted, textTransform: "uppercase", letterSpacing: 1 },
  summaryVal: { fontSize: 28, fontWeight: "800", color: theme.text, marginTop: 4 },
  summaryRow: { flexDirection: "row", gap: 24, marginTop: 12 },
  summarySub: { fontSize: 16, fontWeight: "700", color: theme.text, textAlign: "center" },
  summarySubLabel: { fontSize: 10, color: theme.muted, marginTop: 2 },
  taxAlert: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  taxAlertText: { fontSize: 13, color: "#f59e0b", fontWeight: "600" },
  emptyState: { alignItems: "center", paddingVertical: 50, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: theme.text, marginTop: 16 },
  emptySub: { fontSize: 13, color: theme.muted, marginTop: 8, textAlign: "center" },
  propCard: { marginHorizontal: 16, marginBottom: 10, backgroundColor: theme.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: theme.border },
  propHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  propIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: "center", alignItems: "center" },
  propType: { fontSize: 15, fontWeight: "700", color: theme.text },
  propAddr: { fontSize: 12, color: theme.muted, marginTop: 2 },
  propStats: { flexDirection: "row", justifyContent: "space-around", marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.border },
  propStatVal: { fontSize: 15, fontWeight: "700", color: theme.text, textAlign: "center" },
  propStatLabel: { fontSize: 10, color: theme.muted, marginTop: 2 },
  propTaxRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  propTaxText: { fontSize: 12, color: "#f59e0b", flex: 1 },
  propMetaRow: { flexDirection: "row", gap: 12, marginTop: 8 },
  propMeta: { fontSize: 11, color: theme.muted },
  payTaxBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 10, paddingVertical: 8, borderRadius: 8, backgroundColor: theme.primary + "10" },
  payTaxText: { fontSize: 12, color: theme.primary, fontWeight: "600" },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  modalContent: { backgroundColor: theme.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, maxHeight: "90%" },
  modalTitle: { fontSize: 20, fontWeight: "800", color: theme.text, marginBottom: 12 },
  typeChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: theme.border, marginRight: 6 },
  typeChipText: { fontSize: 11, color: theme.textSecondary },
  input: { backgroundColor: theme.background, borderRadius: 10, padding: 10, fontSize: 15, color: theme.text, marginBottom: 8, borderWidth: 1, borderColor: theme.border },
  inputRow: { flexDirection: "row", gap: 8 },
  modalBtns: { flexDirection: "row", gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center", borderWidth: 1, borderColor: theme.border },
  cancelText: { fontSize: 16, color: theme.muted, fontWeight: "600" },
  saveBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center", backgroundColor: theme.primary },
  saveText: { fontSize: 16, color: "#fff", fontWeight: "700" },
});