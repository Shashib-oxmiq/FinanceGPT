// ── FormFillerScreen — Conversational Form Identification ────────────────────
// NO 30-form list. NO form browsing. The user describes what they need in chat.
// AI identifies the form from conversation, checks vault, and guides filling.

import React, { useState, useCallback, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { api } from "../services/api";
import { getFormById } from "../services/formsData";
import { generateChecklistObject, shareDocument } from "../services/docGen";
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

  // If a specific form was passed via navigation (from AI [FORM_REC])
  if (form) {
    const docList = (form.documents || "").split(",").map((d) => d.trim()).filter(Boolean);

    return (
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => { setForm(null); setFormId(null); }} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color={theme.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{form.name}</Text>
            <Text style={styles.subtitle}>{form.authority}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What you need</Text>
          {docList.map((doc, i) => (
            <View key={i} style={styles.checklistRow}>
              <Ionicons name="ellipse-outline" size={18} color={theme.muted} />
              <Text style={styles.checklistText}>{doc}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Details</Text>
          <View style={styles.detailRow}><Text style={styles.detailLabel}>Fees</Text><Text style={styles.detailValue}>{form.fees}</Text></View>
          <View style={styles.detailRow}><Text style={styles.detailLabel}>Processing</Text><Text style={styles.detailValue}>{form.processing_time}</Text></View>
          {form.online_url ? (
            <TouchableOpacity style={styles.onlineBtn} onPress={() => {}}>
              <Ionicons name="open-outline" size={16} color={theme.primary} />
              <Text style={styles.onlineText}>Apply Online</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Fill with AI</Text>
          <Text style={styles.fillHint}>Tell me about your situation and I'll help you prepare this form.</Text>
          <SmartAddBar context="FormFiller" onSaved={loadCopies} />
        </View>

        <PanelChat context="FormFiller" title="Ask AI about this form" />
      </ScrollView>
    );
  }

  // Default: conversational form identification — NO form list
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Forms</Text>
          <Text style={styles.subtitle}>Tell me what you need — I'll find the right form</Text>
        </View>
      </View>

      <View style={styles.introSection}>
        <Text style={styles.introTitle}>What do you need help with?</Text>
        <Text style={styles.introSub}>Describe your situation in your own words. I'll identify the right government form, check your vault for required documents, and guide you through the process.</Text>
      </View>

      {savedCopies.length > 0 && (
        <View style={styles.savedSection}>
          <Text style={styles.savedTitle}>Your Saved Forms</Text>
          {savedCopies.map((c) => (
            <View key={c.copy_id} style={styles.savedRow}>
              <Ionicons name="save" size={16} color={theme.accent} />
              <Text style={styles.savedName}>{c.name || "Untitled"}</Text>
              <Text style={styles.savedDate}>{c.created_at?.substring(0, 10)}</Text>
            </View>
          ))}
        </View>
      )}

      <SmartAddBar context="FormFiller" />
      <PanelChat context="FormFiller" title="Ask me about any form" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  center: { flex: 1, backgroundColor: theme.background, justifyContent: "center", alignItems: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, padding: 20, paddingTop: 60 },
  backBtn: { padding: 4 },
  title: { fontSize: 22, fontWeight: "800", color: theme.text },
  subtitle: { fontSize: 13, color: theme.muted, marginTop: 2 },
  introSection: { paddingHorizontal: 20, paddingVertical: 16 },
  introTitle: { fontSize: 18, fontWeight: "700", color: theme.text, marginBottom: 6 },
  introSub: { fontSize: 14, color: theme.muted, lineHeight: 20 },
  section: { paddingHorizontal: 20, paddingTop: 20 },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: theme.text, marginBottom: 10 },
  checklistRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  checklistText: { fontSize: 14, color: theme.textSecondary, flex: 1 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  detailLabel: { fontSize: 14, color: theme.muted },
  detailValue: { fontSize: 14, color: theme.text, fontWeight: "500" },
  onlineBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: theme.primary, alignSelf: "flex-start" },
  onlineText: { color: theme.primary, fontSize: 13, fontWeight: "600" },
  fillHint: { fontSize: 13, color: theme.muted, marginBottom: 10 },
  savedSection: { paddingHorizontal: 20, paddingTop: 16 },
  savedTitle: { fontSize: 15, fontWeight: "700", color: theme.text, marginBottom: 8 },
  savedRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: theme.card, borderRadius: 10, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: theme.border },
  savedName: { flex: 1, fontSize: 14, color: theme.text },
  savedDate: { fontSize: 12, color: theme.muted },
});