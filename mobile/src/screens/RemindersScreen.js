import React, { useEffect, useState, useCallback } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Modal, TextInput, ActivityIndicator, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { api } from "../services/api";
import SmartAddBar from "../components/SmartAddBar";
import PanelChat from "../components/PanelChat";
import { theme } from "../theme";

const EMPTY = { title: "", description: "", due_date: "", priority: "medium", category: "" };

export default function RemindersScreen({ navigation }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    try { const r = await api.getReminders(user.user_id); setItems(r.reminders || []); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.title || !form.due_date) return;
    await api.addReminder(user.user_id, form);
    setForm(EMPTY); setShow(false); load();
  };

  const toggle = async (id) => { await api.completeReminder(id, user.user_id); load(); };
  const del = async (id) => { await api.deleteReminder(id, user.user_id); load(); };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={theme.primary} /></View>;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{t("page.reminders.title")}</Text>
          <Text style={styles.subtitle}>{t("page.reminders.subtitle")}</Text>
        </View>
      </View>
      {items.length === 0 ? (
        <View style={styles.empty}><Ionicons name="notifications-off" size={40} color={theme.muted} /><Text style={styles.emptyText}>No reminders yet.</Text></View>
      ) : (
        <FlatList data={items} keyExtractor={(x) => x.reminder_id} contentContainerStyle={{ paddingBottom: 80 }}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => toggle(item.reminder_id)} activeOpacity={0.7}>
              <Ionicons name={item.completed ? "checkmark-circle" : "ellipse-outline"} size={22} color={item.completed ? theme.accent : theme.primary} />
              <View style={styles.cardInfo}>
                <Text style={[styles.cardTitle, item.completed && styles.cardDone]}>{item.title}</Text>
                <Text style={styles.cardDate}>{item.due_date} · {item.priority}</Text>
              </View>
              <TouchableOpacity onPress={() => del(item.reminder_id)}><Ionicons name="trash-outline" size={16} color={theme.destructive} /></TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      )}
      <TouchableOpacity style={styles.fab} onPress={() => { setForm(EMPTY); setShow(true); }}><Ionicons name="add" size={28} color="#fff" /></TouchableOpacity>
      <Modal visible={show} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Reminder</Text>
            <TextInput style={styles.input} placeholder="Title" placeholderTextColor={theme.muted} value={form.title} onChangeText={(v) => setForm({ ...form, title: v })} />
            <TextInput style={styles.input} placeholder="Due Date (YYYY-MM-DD)" placeholderTextColor={theme.muted} value={form.due_date} onChangeText={(v) => setForm({ ...form, due_date: v })} />
            <TextInput style={styles.input} placeholder="Description" placeholderTextColor={theme.muted} value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} multiline />
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
  header: { flexDirection: "row", alignItems: "center", gap: 12, padding: 20, paddingTop: 60 },
  backBtn: { padding: 4 },
  title: { fontSize: 24, fontWeight: "800", color: theme.text },
  subtitle: { fontSize: 14, color: theme.muted, marginTop: 4 },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", paddingBottom: 100 },
  emptyText: { color: theme.muted, fontSize: 14, marginTop: 12, textAlign: "center" },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: theme.card, borderRadius: 12, padding: 14, marginHorizontal: 16, marginBottom: 8, gap: 12, borderWidth: 1, borderColor: theme.border },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: "600", color: theme.text },
  cardDone: { textDecorationLine: "line-through", color: theme.muted },
  cardDate: { fontSize: 12, color: theme.muted, marginTop: 2 },
  fab: { position: "absolute", bottom: 20, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: theme.primary, justifyContent: "center", alignItems: "center", elevation: 8, shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: theme.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  modalTitle: { fontSize: 20, fontWeight: "700", color: theme.text, marginBottom: 16 },
  input: { backgroundColor: theme.input, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text, marginBottom: 10, borderWidth: 1, borderColor: theme.border },
  modalButtons: { flexDirection: "row", gap: 12, marginTop: 16 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: theme.border, alignItems: "center" },
  cancelText: { color: theme.textSecondary, fontSize: 15, fontWeight: "600" },
  saveBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: theme.primary, alignItems: "center" },
  saveText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});