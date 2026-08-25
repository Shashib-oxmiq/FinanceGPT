import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api";
import { useAuth } from "../AuthContext";
import { theme } from "../theme";

export default function DashboardScreen() {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/dashboard/stats");
      setStats(data);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const c = stats?.completeness ?? 0;

  const tiles = [
    { label: "Documents", value: stats?.document_count ?? 0, icon: "folder" },
    { label: "Insurance", value: stats?.by_category?.insurance ?? 0, icon: "shield-checkmark" },
    { label: "Forms Filled", value: stats?.form_count ?? 0, icon: "document-text" },
    { label: "Bundles", value: stats?.bundle_count ?? 0, icon: "cube" },
    { label: "Chats", value: stats?.conversation_count ?? 0, icon: "chatbubbles" },
  ];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={{ padding: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}>
      <View style={st.headerRow}>
        <View>
          <Text style={st.hi}>Welcome,</Text>
          <Text style={st.name}>{user?.name || "there"}</Text>
        </View>
        <TouchableOpacity onPress={logout} style={st.logout}>
          <Ionicons name="log-out-outline" size={18} color={theme.danger} />
          <Text style={{ color: theme.danger, fontSize: 12 }}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View style={st.card}>
        <Text style={st.cardLabel}>PROFILE READINESS</Text>
        <Text style={st.big}>{c}%</Text>
        <View style={st.barTrack}><View style={[st.barFill, { width: `${c}%` }]} /></View>
        <Text style={st.hint}>Chat with your advisor to fill in the gaps.</Text>
      </View>

      <View style={st.grid}>
        {tiles.map((t) => (
          <View key={t.label} style={st.tile}>
            <Ionicons name={t.icon} size={22} color={theme.primary} />
            <Text style={st.tileValue}>{t.value}</Text>
            <Text style={st.tileLabel}>{t.label}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  hi: { color: theme.muted, fontSize: 14 },
  name: { color: theme.text, fontSize: 26, fontWeight: "900" },
  logout: { flexDirection: "row", alignItems: "center", gap: 4, borderColor: theme.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  card: { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 12, padding: 20, marginBottom: 16 },
  cardLabel: { color: theme.muted, fontSize: 11, letterSpacing: 1 },
  big: { color: theme.primary, fontSize: 48, fontWeight: "900", marginTop: 6 },
  barTrack: { height: 8, backgroundColor: theme.bg, borderRadius: 4, overflow: "hidden", marginTop: 8 },
  barFill: { height: 8, backgroundColor: theme.primary },
  hint: { color: theme.muted, fontSize: 13, marginTop: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tile: { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 12, padding: 16, width: "47%" },
  tileValue: { color: theme.text, fontSize: 28, fontWeight: "900", marginTop: 8 },
  tileLabel: { color: theme.muted, fontSize: 11, letterSpacing: 1, marginTop: 2 },
});
