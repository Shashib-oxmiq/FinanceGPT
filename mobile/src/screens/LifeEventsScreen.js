import React, { useEffect, useState, useCallback } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { api } from "../services/api";
import SmartAddBar from "../components/SmartAddBar";
import PanelChat from "../components/PanelChat";
import { theme } from "../theme";

const EVENT_TYPES = [
  { type: "marriage", icon: "heart", label: "Marriage" },
  { type: "home_purchase", icon: "home", label: "Home Purchase" },
  { type: "child_birth", icon: "happy", label: "Child Birth" },
  { type: "retirement", icon: "sunny", label: "Retirement" },
  { type: "education", icon: "school", label: "Education" },
  { type: "relocation", icon: "airplane", label: "Relocation" },
  { type: "job_change", icon: "briefcase", label: "Job Change" },
  { type: "business_start", icon: "storefront", label: "Start Business" },
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
          <Text style={styles.subtitle}>{t("page.life_events.subtitle")}</Text>
        </View>
      </View>
      <SmartAddBar context="LifeEvents" onSaved={load} />
      <Text style={styles.sectionTitle}>Plan for a Life Event</Text>
      <View style={styles.grid}>
        {EVENT_TYPES.map((e) => (
          <TouchableOpacity key={e.type} style={styles.eventCard} activeOpacity={0.7}>
            <Ionicons name={e.icon} size={28} color={theme.primary} />
            <Text style={styles.eventLabel}>{e.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {items.length > 0 && (
        <View style={styles.savedSection}>
          <Text style={styles.sectionTitle}>Your Life Events</Text>
          <FlatList data={items} keyExtractor={(x) => x.event_id} scrollEnabled={false}
            renderItem={({ item }) => (
              <View style={styles.savedItem}>
                <Ionicons name="flag" size={18} color={theme.primary} />
                <Text style={styles.savedText}>{item.event_type.replace(/_/g, " ")}</Text>
                <Text style={styles.savedDate}>{item.event_date || ""}</Text>
              </View>
            )}
          />
        </View>
      )}
      <PanelChat context="LifeEvents" title="Ask AI about life event planning" />
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
  sectionTitle: { fontSize: 16, fontWeight: "700", color: theme.text, paddingHorizontal: 20, paddingTop: 20, marginBottom: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, gap: 12 },
  eventCard: { width: "47%", backgroundColor: theme.card, borderRadius: 16, padding: 20, alignItems: "center", borderWidth: 1, borderColor: theme.border, flexGrow: 1 },
  eventLabel: { fontSize: 13, color: theme.textSecondary, marginTop: 8, textAlign: "center" },
  savedSection: { paddingTop: 24 },
  savedItem: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: theme.card, borderRadius: 12, padding: 14, marginHorizontal: 16, marginBottom: 8, borderWidth: 1, borderColor: theme.border },
  savedText: { flex: 1, fontSize: 15, color: theme.text, textTransform: "capitalize" },
  savedDate: { fontSize: 12, color: theme.muted },
});