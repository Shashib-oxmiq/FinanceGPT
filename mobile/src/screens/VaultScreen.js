import React, { useEffect, useState, useCallback } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { pickDocument } from "../services/platform";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { api } from "../services/api";
import SmartAddBar from "../components/SmartAddBar";
import PanelChat from "../components/PanelChat";
import { theme } from "../theme";

const CATEGORIES = ["All", "Identity", "Financial", "Property", "Insurance", "Tax", "Medical", "Legal", "Other"];

export default function VaultScreen() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [category, setCategory] = useState("All");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    try { const data = await api.getDocuments(user.user_id); setItems(data); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const pick = async () => {
    try {
      const result = await pickDocument();
      if (result.canceled) return;
      for (const asset of result.assets) {
        // Check for duplicates by name
        const dup = items.find((d) => d.original_filename === asset.name);
        if (dup) {
          Alert.alert("Duplicate Detected", `"${asset.name}" already exists in your vault.`);
          continue;
        }
        const hash = asset.size + "_" + asset.name;
        const doc = { original_filename: asset.name, category: "Other", content_type: asset.mimeType || "application/octet-stream", size: asset.size, storage_path: asset.uri, content_hash: hash, tags: "[]" };
        await api.addDocument(user.user_id, doc);
      }
      load();
    } catch (e) { console.error(e); }
  };

  const del = (id) => {
    Alert.alert("Delete Document", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { await api.deleteDocument(id, user.user_id); load(); } },
    ]);
  };

  const filtered = category === "All" ? items : items.filter((d) => d.category === category);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={theme.primary} /></View>;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t("page.vault.title")}</Text>
        <Text style={styles.subtitle}>{t("page.vault.subtitle")}</Text>
      </View>
      <View style={styles.chips}>
        {CATEGORIES.map((c) => (
          <TouchableOpacity key={c} style={[styles.chip, category === c && styles.chipActive]} onPress={() => setCategory(c)}>
            <Text style={[styles.chipText, category === c && styles.chipTextActive]}>{c}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {filtered.length === 0 ? (
        <View style={styles.empty}><Ionicons name="folder" size={40} color={theme.muted} /><Text style={styles.emptyText}>No documents yet. Tap + to upload.</Text></View>
      ) : (
        <FlatList data={filtered} keyExtractor={(x) => x.document_id} contentContainerStyle={{ paddingBottom: 80 }}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Ionicons name="document" size={20} color={theme.primary} />
              <View style={styles.cardInfo}>
                <Text style={styles.cardName} numberOfLines={1}>{item.original_filename}</Text>
                <Text style={styles.cardMeta}>{item.category} · {(item.size / 1024).toFixed(0)} KB</Text>
              </View>
              <TouchableOpacity onPress={() => del(item.document_id)}><Ionicons name="trash-outline" size={16} color={theme.destructive} /></TouchableOpacity>
            </View>
          )}
        />
      )}
      <TouchableOpacity style={styles.fab} onPress={pick}><Ionicons name="add" size={28} color="#fff" /></TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  center: { flex: 1, backgroundColor: theme.background, justifyContent: "center", alignItems: "center" },
  header: { padding: 20, paddingTop: 60 },
  title: { fontSize: 24, fontWeight: "800", color: theme.text },
  subtitle: { fontSize: 14, color: theme.muted, marginTop: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, gap: 8, marginBottom: 12 },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border },
  chipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  chipText: { fontSize: 12, color: theme.textSecondary },
  chipTextActive: { color: "#fff" },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", paddingBottom: 100 },
  emptyText: { color: theme.muted, fontSize: 14, marginTop: 12, textAlign: "center" },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: theme.card, borderRadius: 12, padding: 14, marginHorizontal: 16, marginBottom: 8, gap: 12, borderWidth: 1, borderColor: theme.border },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 14, fontWeight: "600", color: theme.text },
  cardMeta: { fontSize: 12, color: theme.muted, marginTop: 2 },
  fab: { position: "absolute", bottom: 20, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: theme.primary, justifyContent: "center", alignItems: "center", elevation: 8, shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
});