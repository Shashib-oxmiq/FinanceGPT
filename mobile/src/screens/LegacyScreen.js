import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput, ScrollView, Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api";
import { theme } from "../theme";

export default function LegacyScreen() {
  const [contacts, setContacts] = useState([]);
  const [pack, setPack] = useState(null);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ name: "", relationship: "spouse", email: "", phone: "", access_level: "full" });

  const load = useCallback(async () => {
    try {
      const [c, p] = await Promise.all([api.get("/legacy/contacts"), api.get("/legacy/pack")]);
      setContacts(c.data); setPack(p.data);
    } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const add = async () => {
    if (!form.name) return Alert.alert("Name required");
    try {
      await api.post("/legacy/contacts", form);
      setForm({ name: "", relationship: "spouse", email: "", phone: "", access_level: "full" });
      setShow(false);
      load();
    } catch { Alert.alert("Failed to add contact"); }
  };

  const del = async (id) => { await api.delete(`/legacy/contacts/${id}`); load(); };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <FlatList
        data={contacts}
        keyExtractor={(c) => c.contact_id}
        contentContainerStyle={{ padding: 16 }}
        ListHeaderComponent={
          <View style={st.summary}>
            <Ionicons name="heart" size={26} color={theme.accent} />
            <Text style={st.summaryTitle}>Handover pack</Text>
            <View style={st.metrics}>
              <Metric label="Policies" value={pack?.policy_count ?? 0} />
              <Metric label="Documents" value={pack?.document_count ?? 0} />
              <Metric label="Sum Assured" value={Number(pack?.total_sum_assured || 0).toLocaleString()} />
            </View>
            <Text style={st.note}>Full .zip export (with all documents) is available in the Everkin web app.</Text>
            <TouchableOpacity style={st.addBtn} onPress={() => setShow(true)}>
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={st.addText}>Add next-of-kin</Text>
            </TouchableOpacity>
            <Text style={st.section}>TRUSTED CONTACTS</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={st.contact}>
            <View style={{ flex: 1 }}>
              <Text style={st.cName}>{item.name} <Text style={{ color: theme.muted }}>· {item.relationship}</Text></Text>
              <Text style={st.cMeta}>{item.email} {item.phone ? `· ${item.phone}` : ""}</Text>
              <Text style={st.cAccess}>{item.access_level} access</Text>
            </View>
            <TouchableOpacity onPress={() => del(item.contact_id)}><Ionicons name="trash" size={18} color={theme.danger} /></TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={<Text style={st.empty}>No next-of-kin added yet. Add your spouse or a trusted person.</Text>}
      />

      <Modal visible={show} animationType="slide" transparent onRequestClose={() => setShow(false)}>
        <View style={st.modalWrap}>
          <View style={st.modal}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 12 }}>
              <Text style={st.modalTitle}>Add trusted contact</Text>
              <TouchableOpacity onPress={() => setShow(false)}><Ionicons name="close" size={22} color={theme.text} /></TouchableOpacity>
            </View>
            <ScrollView>
              {[["Name *", "name"], ["Relationship", "relationship"], ["Email", "email"], ["Phone", "phone"], ["Access level (full/financial/insurance)", "access_level"]].map(([label, key]) => (
                <View key={key}>
                  <Text style={st.label}>{label.toUpperCase()}</Text>
                  <TextInput style={st.input} value={form[key]} onChangeText={(v) => setForm((f) => ({ ...f, [key]: v }))} placeholderTextColor={theme.muted} autoCapitalize="none" />
                </View>
              ))}
              <TouchableOpacity style={[st.addBtn, { justifyContent: "center", marginTop: 16 }]} onPress={add}>
                <Text style={st.addText}>Save</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Metric({ label, value }) {
  return (
    <View style={{ alignItems: "center" }}>
      <Text style={st.metricValue}>{value}</Text>
      <Text style={st.metricLabel}>{label}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  summary: { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 12, padding: 18, marginBottom: 16 },
  summaryTitle: { color: theme.text, fontSize: 20, fontWeight: "800", marginTop: 6 },
  metrics: { flexDirection: "row", justifyContent: "space-around", marginTop: 16 },
  metricValue: { color: theme.text, fontSize: 22, fontWeight: "900" },
  metricLabel: { color: theme.muted, fontSize: 10, letterSpacing: 1, marginTop: 2 },
  note: { color: theme.muted, fontSize: 12, marginTop: 14 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: theme.primary, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10, marginTop: 14, alignSelf: "flex-start" },
  addText: { color: "#fff", fontWeight: "700" },
  section: { color: theme.muted, fontSize: 11, letterSpacing: 1, marginTop: 18 },
  contact: { flexDirection: "row", alignItems: "center", backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 10, padding: 14, marginBottom: 10 },
  cName: { color: theme.text, fontWeight: "700" },
  cMeta: { color: theme.muted, fontSize: 12, marginTop: 2 },
  cAccess: { color: theme.primary, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", marginTop: 4 },
  empty: { color: theme.muted, textAlign: "center", marginTop: 10 },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modal: { backgroundColor: theme.card, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, maxHeight: "85%" },
  modalTitle: { color: theme.text, fontSize: 20, fontWeight: "800" },
  label: { color: theme.muted, fontSize: 11, letterSpacing: 1, marginTop: 12, marginBottom: 5 },
  input: { backgroundColor: theme.bg, borderColor: theme.border, borderWidth: 1, borderRadius: 8, color: theme.text, paddingHorizontal: 12, paddingVertical: 10 },
});
