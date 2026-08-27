// ── FormFiller Screen ────────────────────────────────────────────────────────
// Fill out selected form fields and save copies
import React, { useState, useCallback, useEffect } from "react";
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { api, initDB_if_needed } from "../services/api";
import { getFormById, FORMS_DATA, FORM_CATEGORIES } from "../services/formsData";
import { downloadFormChecklist } from "../services/docGen";
import SmartAddBar from "../components/SmartAddBar";
import PanelChat from "../components/PanelChat";
import { theme } from "../theme";

export default function FormFillerScreen({ route, navigation }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [formId, setFormId] = useState(route?.params?.formId || null);
  const [form, setForm] = useState(formId ? getFormById(formId) : null);
  const [savedCopies, setSavedCopies] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadCopies = useCallback(async () => {
    if (!user) return;
    try {
      const d = await (await import("../services/db")).initDB();
      const rows = await d.getAllAsync("SELECT * FROM form_copies WHERE user_id = ? ORDER BY created_at DESC", [user.user_id]);
      setSavedCopies(rows);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { loadCopies(); }, [loadCopies]);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={theme.primary} /></View>;

  if (!form) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color={theme.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Form Filler</Text>
            <Text style={styles.subtitle}>Select a form to fill out</Text>
          </View>
        </View>
        <SmartAddBar context="FormFiller" />
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
          {FORMS_DATA.slice(0, 30).map((f) => (
            <TouchableOpacity key={f.id} style={styles.formRow} onPress={() => { setFormId(f.id); setForm(f); }}>
              <Ionicons name="document-text" size={18} color={theme.primary} />
              <Text style={styles.formName}>{f.name}</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.muted} />
            </TouchableOpacity>
          ))}
          {savedCopies.length > 0 && (
            <View style={styles.savedSection}>
              <Text style={styles.savedTitle}>Saved Copies</Text>
              {savedCopies.map((c) => (
                <View key={c.copy_id} style={styles.savedRow}>
                  <Ionicons name="save" size={16} color={theme.accent} />
                  <Text style={styles.savedName}>{c.name || "Untitled"}</Text>
                  <Text style={styles.savedDate}>{c.created_at?.substring(0, 10)}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  // Parse required documents as fields
  const docList = form.documents.split(",").map((d) => d.trim());

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <TouchableOpacity style={styles.backBtn} onPress={() => { setForm(null); setFormId(null); }}>
        <Ionicons name="arrow-back" size={18} color={theme.primary} />
        <Text style={styles.backText}>Back to forms</Text>
      </TouchableOpacity>
      <View style={styles.detailHeader}>
        <Text style={styles.detailTitle}>{form.name}</Text>
        <View style={styles.badges}>
          <View style={styles.badge}><Text style={styles.badgeText}>{form.category}</Text></View>
          <View style={styles.badge}><Text style={styles.badgeText}>{form.authority}</Text></View>
        </View>
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Required Documents</Text>
        {docList.map((doc, i) => (
          <View key={i} style={styles.checklistRow}>
            <Ionicons name="ellipse-outline" size={20} color={theme.muted} />
            <Text style={styles.checklistText}>{doc}</Text>
          </View>
        ))}
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Details</Text>
        <View style={styles.detailRow}><Text style={styles.detailLabel}>Fees</Text><Text style={styles.detailValue}>{form.fees}</Text></View>
        <View style={styles.detailRow}><Text style={styles.detailLabel}>Processing</Text><Text style={styles.detailValue}>{form.processing_time}</Text></View>
        {form.online_url ? (
          <TouchableOpacity style={styles.onlineBtn}>
            <Ionicons name="open-outline" size={16} color={theme.primary} />
            <Text style={styles.onlineText}>Apply Online</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Form Data</Text>
        <Text style={styles.fillHint}>Use Smart Add below to fill form details via AI, or type your data:</Text>
        <SmartAddBar context="FormFiller" onSaved={loadCopies} />
      </View>
      <TouchableOpacity style={styles.checklistBtn} onPress={() => downloadFormChecklist(form)}>
        <Ionicons name="download" size={18} color="#fff" />
        <Text style={styles.checklistBtnText}>Download Checklist</Text>
      </TouchableOpacity>
      <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
        <PanelChat context="FormFiller" />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  center: { flex: 1, backgroundColor: theme.background, justifyContent: "center", alignItems: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, padding: 20, paddingTop: 60 },
  backBtn: { padding: 4 },
  title: { fontSize: 24, fontWeight: "800", color: theme.text },
  subtitle: { fontSize: 14, color: theme.muted, marginTop: 4 },
  formRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.border },
  formName: { flex: 1, fontSize: 14, color: theme.text, fontWeight: "500" },
  savedSection: { padding: 16, paddingTop: 24 },
  savedTitle: { fontSize: 16, fontWeight: "700", color: theme.text, marginBottom: 12 },
  savedRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: theme.card, borderRadius: 10, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: theme.border },
  savedName: { flex: 1, fontSize: 14, color: theme.text },
  savedDate: { fontSize: 12, color: theme.muted },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 4, padding: 20, paddingTop: 60 },
  backText: { color: theme.primary, fontSize: 14, fontWeight: "600" },
  detailHeader: { padding: 20, paddingTop: 4 },
  detailTitle: { fontSize: 22, fontWeight: "800", color: theme.text, marginBottom: 12 },
  badges: { flexDirection: "row", gap: 8 },
  badge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 16, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border },
  badgeText: { fontSize: 11, color: theme.textSecondary },
  section: { padding: 20, paddingTop: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: theme.text, marginBottom: 12 },
  checklistRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  checklistText: { flex: 1, fontSize: 14, color: theme.text },
  detailRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 },
  detailLabel: { fontSize: 14, color: theme.muted },
  detailValue: { fontSize: 14, color: theme.text, fontWeight: "500" },
  onlineBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 12, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: theme.primary + "40" },
  onlineText: { color: theme.primary, fontSize: 15, fontWeight: "600" },
  fillHint: { fontSize: 13, color: theme.muted, marginBottom: 12 },
  checklistBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginHorizontal: 20, marginTop: 8, paddingVertical: 14, borderRadius: 12, backgroundColor: theme.primary },
  checklistBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});