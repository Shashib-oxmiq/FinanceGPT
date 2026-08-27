// ── SharedView Screen ────────────────────────────────────────────────────────
// View a shared document bundle (accessed via share link/path)
import React, { useState, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../theme";

export default function SharedViewScreen({ route }) {
  const [shareId, setShareId] = useState(route?.params?.shareId || "");
  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);

  const unlock = async () => {
    if (!shareId) { Alert.alert("Missing", "Enter a share ID"); return; }
    setLoading(true);
    try {
      // In local mode, look up share from SQLite
      const { initDB } = await import("../services/db");
      const d = await initDB();
      const share = await d.getFirstAsync("SELECT * FROM shares WHERE share_id = ?", [shareId]);
      if (!share) { Alert.alert("Not found", "Share not found"); return; }
      if (share.password && share.password !== password) {
        Alert.alert("Wrong password", "Please check and try again");
        return;
      }
      // Load documents
      const docIds = JSON.parse(share.document_ids || "[]");
      const docs = [];
      for (const id of docIds) {
        const doc = await d.getFirstAsync("SELECT * FROM documents WHERE document_id = ?", [id]);
        if (doc) docs.push(doc);
      }
      setItems(docs);
      setUnlocked(true);
    } catch (e) { Alert.alert("Error", e.message); }
    finally { setLoading(false); }
  };

  if (unlocked) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Ionicons name="unlock" size={24} color={theme.accent} />
          <Text style={styles.title}>Shared Documents</Text>
        </View>
        <FlatList
          data={items}
          keyExtractor={(x) => x.document_id}
          contentContainerStyle={{ paddingBottom: 20 }}
          renderItem={({ item }) => (
            <View style={styles.docCard}>
              <Ionicons name="document" size={20} color={theme.primary} />
              <View style={styles.docInfo}>
                <Text style={styles.docName} numberOfLines={1}>{item.original_filename}</Text>
                <Text style={styles.docMeta}>{item.category} · {(item.size / 1024).toFixed(0)} KB</Text>
              </View>
            </View>
          )}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Shared View</Text>
        <Text style={styles.subtitle}>Enter share ID and password to view documents</Text>
      </View>
      <View style={styles.form}>
        <TextInput style={styles.input} placeholder="Share ID" placeholderTextColor={theme.muted} value={shareId} onChangeText={setShareId} autoCapitalize="none" />
        <TextInput style={styles.input} placeholder="Password (if required)" placeholderTextColor={theme.muted} value={password} onChangeText={setPassword} secureTextEntry />
        <TouchableOpacity style={styles.unlockBtn} onPress={unlock} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.unlockText}>Unlock</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: { padding: 20, paddingTop: 60 },
  title: { fontSize: 24, fontWeight: "800", color: theme.text },
  subtitle: { fontSize: 14, color: theme.muted, marginTop: 4 },
  form: { padding: 20 },
  input: { backgroundColor: theme.input, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text, marginBottom: 10, borderWidth: 1, borderColor: theme.border },
  unlockBtn: { backgroundColor: theme.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  unlockText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  docCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: theme.card, borderRadius: 12, padding: 14, marginHorizontal: 16, marginBottom: 8, borderWidth: 1, borderColor: theme.border },
  docInfo: { flex: 1 },
  docName: { fontSize: 14, fontWeight: "600", color: theme.text },
  docMeta: { fontSize: 12, color: theme.muted, marginTop: 2 },
});