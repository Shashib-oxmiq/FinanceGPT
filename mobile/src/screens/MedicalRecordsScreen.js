import React, { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Modal, TextInput, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { getMedicalRecords, createMedicalRecord, deleteMedicalRecord, RECORD_TYPES } from "../services/medicalRecords";
import { theme } from "../theme";
import PanelChat from "../components/PanelChat";

const TYPE_ICONS = {
  consultation: "person", prescription: "document-text", lab_report: "flask",
  vaccination: "syringe", diagnosis: "medical", surgery: "cut",
  allergy: "warning", scan: "scan",
};
const TYPE_COLORS = {
  consultation: "#3b82f6", prescription: "#10b981", lab_report: "#8b5cf6",
  vaccination: "#f59e0b", diagnosis: "#ef4444", surgery: "#ec4899",
  allergy: "#f97316", scan: "#06b6d4",
};

export default function MedicalRecordsScreen({ navigation }) {
  const { user } = useAuth();
  const [records, setRecords] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ type: "consultation", title: "", doctor: "", hospital: "", date: "", diagnosis: "", prescription: "", notes: "" });

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const r = await getMedicalRecords(user.user_id);
      setRecords(r);
    } catch (e) { console.error(e); }
  }, [user]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const handleAdd = async () => {
    if (!form.title) { Alert.alert("Please enter a title"); return; }
    await createMedicalRecord(user.user_id, form);
    setForm({ type: "consultation", title: "", doctor: "", hospital: "", date: "", diagnosis: "", prescription: "", notes: "" });
    setShowAdd(false);
    await load();
  };

  // Group records by year
  const byYear = {};
  for (const r of records) {
    const year = (r.date || "").substring(0, 4) || "Unknown";
    if (!byYear[year]) byYear[year] = [];
    byYear[year].push(r);
  }
  const years = Object.keys(byYear).sort().reverse();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Medical Records</Text>
        <TouchableOpacity onPress={() => setShowAdd(true)}>
          <Ionicons name="add-circle" size={28} color={theme.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}>
        {records.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="medkit" size={48} color={theme.muted} />
            <Text style={styles.emptyTitle}>No medical records yet</Text>
            <Text style={styles.emptySub}>Add prescriptions, lab reports, vaccinations</Text>
            <Text style={styles.emptySub}>Never lose a medical document again</Text>
          </View>
        )}

        {/* Emergency info banner */}
        <View style={styles.emergencyBanner}>
          <Ionicons name="alert-circle" size={16} color="#ef4444" />
          <Text style={styles.emergencyText}>Emergency info (blood group, allergies) available from your records</Text>
        </View>

        {years.map(year => (
          <View key={year}>
            <Text style={styles.yearHeader}>{year}</Text>
            {byYear[year].map((r) => (
              <View key={r.record_id} style={styles.recordCard}>
                <View style={[styles.recordIcon, { backgroundColor: (TYPE_COLORS[r.type] || "#6b7280") + "20" }]}>
                  <Ionicons name={TYPE_ICONS[r.type] || "medical"} size={18} color={TYPE_COLORS[r.type] || "#6b7280"} />
                </View>
                <View style={styles.recordInfo}>
                  <Text style={styles.recordTitle}>{r.title}</Text>
                  <Text style={styles.recordMeta}>
                    {r.type} · {r.date}
                    {r.doctor ? ` · ${r.doctor}` : ""}
                  </Text>
                  {r.diagnosis ? <Text style={styles.recordDiagnosis} numberOfLines={1}>{r.diagnosis}</Text> : null}
                  {r.prescription ? <Text style={styles.recordRx} numberOfLines={1}>💊 {r.prescription}</Text> : null}
                </View>
                <TouchableOpacity onPress={() => { deleteMedicalRecord(r.record_id); load(); }}>
                  <Ionicons name="trash-outline" size={16} color={theme.muted} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ))}

        <View style={{ paddingBottom: 16 }}>
          <PanelChat context="MedicalRecords" title="Ask AI about your health records" />
        </View>
      </ScrollView>

      <Modal visible={showAdd} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Medical Record</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeScroll}>
              {RECORD_TYPES.map((t) => (
                <TouchableOpacity key={t.key} style={[styles.typeChip, form.type === t.key && { backgroundColor: TYPE_COLORS[t.key], borderColor: TYPE_COLORS[t.key] }]} onPress={() => setForm({ ...form, type: t.key })}>
                  <Ionicons name={t.icon} size={12} color={form.type === t.key ? "#fff" : theme.muted} />
                  <Text style={[styles.typeChipText, form.type === t.key && { color: "#fff" }]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TextInput style={styles.input} placeholder="Title (e.g. Annual checkup)" value={form.title} onChangeText={(v) => setForm({ ...form, title: v })} />
            <View style={styles.inputRow}>
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="Doctor name" value={form.doctor} onChangeText={(v) => setForm({ ...form, doctor: v })} />
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="Hospital" value={form.hospital} onChangeText={(v) => setForm({ ...form, hospital: v })} />
            </View>
            <TextInput style={styles.input} placeholder="Date (YYYY-MM-DD)" value={form.date} onChangeText={(v) => setForm({ ...form, date: v })} />
            <TextInput style={styles.input} placeholder="Diagnosis" value={form.diagnosis} onChangeText={(v) => setForm({ ...form, diagnosis: v })} multiline />
            <TextInput style={styles.input} placeholder="Prescription / Medicines" value={form.prescription} onChangeText={(v) => setForm({ ...form, prescription: v })} multiline />
            <TextInput style={styles.input} placeholder="Notes" value={form.notes} onChangeText={(v) => setForm({ ...form, notes: v })} multiline />
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
  title: { fontSize: 20, fontWeight: "800", color: theme.text, flex: 1, marginLeft: 12 },
  emptyState: { alignItems: "center", paddingVertical: 50, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: theme.text, marginTop: 16 },
  emptySub: { fontSize: 13, color: theme.muted, marginTop: 6, textAlign: "center" },
  emergencyBanner: { flexDirection: "row", alignItems: "center", gap: 6, marginHorizontal: 16, marginTop: 8, backgroundColor: "#ef444410", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: "#ef444430" },
  emergencyText: { fontSize: 12, color: "#ef4444", flex: 1 },
  yearHeader: { fontSize: 14, fontWeight: "700", color: theme.muted, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  recordCard: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 16, marginBottom: 8, backgroundColor: theme.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: theme.border },
  recordIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: "center", alignItems: "center" },
  recordInfo: { flex: 1 },
  recordTitle: { fontSize: 14, fontWeight: "600", color: theme.text },
  recordMeta: { fontSize: 11, color: theme.muted, marginTop: 2 },
  recordDiagnosis: { fontSize: 12, color: theme.textSecondary, marginTop: 4 },
  recordRx: { fontSize: 12, color: theme.primary, marginTop: 2 },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  modalContent: { backgroundColor: theme.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, maxHeight: "90%" },
  modalTitle: { fontSize: 20, fontWeight: "800", color: theme.text, marginBottom: 12 },
  typeScroll: { flexDirection: "row", marginBottom: 12 },
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