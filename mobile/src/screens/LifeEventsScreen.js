// ── LifeEventsScreen — Conversational Life Event Planning ────────────────────
// NO 8-icon grid. NO static event cards. The user tells the AI what's happening
// in their life. The AI proactively offers relevant documents, insurance updates,
// financial steps, and reminders — all in conversation.

import React, { useState, useCallback, useEffect } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { api } from "../services/api";
import SmartAddBar from "../components/SmartAddBar";
import PanelChat from "../components/PanelChat";
import { theme } from "../theme";

const LIFE_PROMPTS = [
  { icon: "heart", text: "I'm getting married" },
  { icon: "home", text: "I'm buying a new home" },
  { icon: "happy", text: "We're expecting a child" },
  { icon: "briefcase", text: "I'm changing jobs" },
];

export default function LifeEventsScreen({ navigation }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    try { const data = await api.getLifeEvents(user.user_id); setItems(data); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={theme.primary} /></View>;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{t("page.life_events.title")}</Text>
          <Text style={styles.subtitle}>Tell me what's happening — I'll guide you</Text>
        </View>
      </View>

      {/* Conversational intro — NOT an icon grid */}
      <View style={styles.introSection}>
        <Text style={styles.introTitle}>What's happening in your life?</Text>
        <Text style={styles.introSub}>Big life changes come with paperwork, financial decisions, and deadlines. Tell me what's going on and I'll proactively help you prepare — documents you'll need, insurance to update, financial steps to take, and reminders so nothing falls through the cracks.</Text>
      </View>

      {LIFE_PROMPTS.map((ex, i) => (
        <TouchableOpacity key={i} style={styles.suggestionCard} activeOpacity={0.7}>
          <View style={styles.suggestionIcon}>
            <Ionicons name={ex.icon} size={22} color={theme.primary} />
          </View>
          <Text style={styles.suggestionText}>{ex.text}</Text>
          <Ionicons name="chevron-forward" size={16} color={theme.muted} />
        </TouchableOpacity>
      ))}

      {/* Tracked events */}
      {items.length > 0 && (
        <View style={styles.savedSection}>
          <Text style={styles.savedTitle}>Your Life Events</Text>
          <FlatList
            data={items}
            keyExtractor={(x) => x.event_id || x.id || String(x)}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <View style={styles.savedItem}>
                <Ionicons name="flag" size={18} color={theme.primary} />
                <Text style={styles.savedText}>{(item.event_type || item.type || "").replace(/_/g, " ")}</Text>
                <Text style={styles.savedDate}>{item.event_date || item.date || ""}</Text>
              </View>
            )}
          />
        </View>
      )}

      <SmartAddBar context="LifeEvents" onSaved={load} />
      <PanelChat context="LifeEvents" title="Tell me about your life event" />
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
  introSection: { paddingHorizontal: 20, paddingVertical: 16 },
  introTitle: { fontSize: 18, fontWeight: "700", color: theme.text, marginBottom: 6 },
  introSub: { fontSize: 14, color: theme.muted, lineHeight: 20 },
  suggestionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: theme.card,
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.border,
  },
  suggestionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: theme.primary + "20",
    justifyContent: "center",
    alignItems: "center",
  },
  suggestionText: { flex: 1, fontSize: 14, color: theme.text, fontWeight: "500" },
  savedSection: { paddingTop: 20, paddingHorizontal: 20 },
  savedTitle: { fontSize: 15, fontWeight: "700", color: theme.text, marginBottom: 8 },
  savedItem: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: theme.card, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: theme.border },
  savedText: { flex: 1, fontSize: 15, color: theme.text, textTransform: "capitalize" },
  savedDate: { fontSize: 12, color: theme.muted },
});