import React, { useEffect, useState, useCallback } from "react";
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { api } from "../services/api";
import SmartAddBar from "../components/SmartAddBar";
import PanelChat from "../components/PanelChat";
import { theme } from "../theme";

export default function LegacyScreen({ navigation }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [contacts, setContacts] = useState([]);
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", relationship: "", email: "", phone: "" });

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const c = await api.getContacts(user.user_id);
      setContacts(c);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const addContact = async () => {
    if (!form.name) return;
    await api.addContact(user.user_id, { ...form, access_level: "view" });
    setForm({ name: "", relationship: "", email: "", phone: "" });
    setShowAdd(false);
    load();
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={theme.primary} /></View>;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{t("page.legacy.title")}</Text>
          <Text style={styles.subtitle}>{t("page.legacy.subtitle")}</Text>
        </View>
      </View>
      <SmartAddBar context="Legacy" onSaved={load} />
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Trusted Contacts</Text>
        {contacts.length === 0 ? (
          <Text style={styles.emptyText}>No trusted contacts added yet. They will inherit access to your documents.</Text>
        ) : (
          <FlatList data={contacts} keyExtractor={(x) => x.contact_id} scrollEnabled={false}
            renderItem={({ item }) => (
              <View style={styles.contactCard}>
                <Ionicons name="person" size={20} color={theme.primary} />
                <View style={styles.contactInfo}>
                  <Text style={styles.contactName}>{item.name}</Text>
                  <Text style={styles.contactMeta}>{item.relationship}{item.email ? ` · ${item.email}` : ""}</Text>
                </View>
              </View>
            )}
          />
        )}
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Secure Shares</Text>
        <Text style={styles.emptyText}>Create time-limited secure shares of your documents with trusted contacts.</Text>
      </View>
      <TouchableOpacity style={styles.fab} onPress={() => setShowAdd(true)}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
      <PanelChat context="Legacy" title="Ask AI about estate planning" />
      {showAdd && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Trusted Contact</Text>
            <TextInput style={styles.input} placeholder="Name" placeholderTextColor={theme.muted} value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />
            <TextInput style={styles.input} placeholder="Relationship" placeholderTextColor={theme.muted} value={form.relationship} onChangeText={(v) => setForm({ ...form, relationship: v })} />
            <TextInput style={styles.input} placeholder="Email" placeholderTextColor={theme.muted} value={form.email} onChangeText={(v) => setForm({ ...form, email: v })} keyboardType="email-address" />
            <TextInput style={styles.input} placeholder="Phone" placeholderTextColor={theme.muted} value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} keyboardType="phone-pad" />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAdd(false)}><Text style={styles.cancelText}>{t("common.cancel")}</Text></TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={addContact}><Text style={styles.saveText}>{t("button.save")}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  center: { flex: 1, backgroundColor: theme.background, justifyContent: "center", alignItems: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, padding: 20, paddingTop: 60 },
  backBtn: { padding: 4 },
  title: { fontSize: 24, fontWeight: "800", color: theme.text },
  subtitle: { fontSize: 14, color: theme.muted, marginTop: 4 },
  section: { padding: 20, paddingTop: 24 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: theme.text, marginBottom: 12 },
  emptyText: { fontSize: 14, color: theme.muted, lineHeight: 20 },
  contactCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: theme.card, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: theme.border },
  contactInfo: { flex: 1 },
  contactName: { fontSize: 15, fontWeight: "600", color: theme.text },
  contactMeta: { fontSize: 12, color: theme.muted, marginTop: 2 },
  fab: { position: "absolute", bottom: 20, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: theme.primary, justifyContent: "center", alignItems: "center", elevation: 8, shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  modalOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: theme.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  modalTitle: { fontSize: 20, fontWeight: "700", color: theme.text, marginBottom: 16 },
  input: { backgroundColor: theme.input, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text, marginBottom: 10, borderWidth: 1, borderColor: theme.border },
  modalButtons: { flexDirection: "row", gap: 12, marginTop: 16 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: theme.border, alignItems: "center" },
  cancelText: { color: theme.textSecondary, fontSize: 15, fontWeight: "600" },
  saveBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: theme.primary, alignItems: "center" },
  saveText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});