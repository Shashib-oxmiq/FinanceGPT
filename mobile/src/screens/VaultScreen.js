import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { api } from "../api";
import { theme } from "../theme";

const CATS = ["financial", "tax", "bank_statement", "credit_card_statement", "investment", "insurance", "education", "identity", "medical", "property", "vehicle", "legal_estate", "warranty", "subscription", "employment", "immigration", "personal", "other"];
const LABEL = (c) => c.replace(/_/g, " ").replace(/\b\w/g, (x) => x.toUpperCase());

export default function VaultScreen() {
  const [docs, setDocs] = useState([]);
  const [cat, setCat] = useState("financial");
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    try { const { data } = await api.get("/documents"); setDocs(data); } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const upload = async () => {
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.length) return;
    const file = res.assets[0];
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", { uri: file.uri, name: file.name, type: file.mimeType || "application/octet-stream" });
      form.append("category", cat);
      await api.post("/documents/upload", form, { headers: { "Content-Type": "multipart/form-data" } });
      load();
    } catch { Alert.alert("Upload failed"); }
    finally { setUploading(false); }
  };

  const del = async (id) => { await api.delete(`/documents/${id}`); load(); };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={st.catBar}>
        <FlatList
          horizontal
          data={CATS}
          keyExtractor={(c) => c}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => setCat(item)} style={[st.chip, cat === item && st.chipActive]}>
              <Text style={[st.chipText, cat === item && { color: "#fff" }]}>{LABEL(item)}</Text>
            </TouchableOpacity>
          )}
        />
      </View>
      <TouchableOpacity style={st.uploadBtn} onPress={upload} disabled={uploading}>
        <Ionicons name="cloud-upload" size={18} color="#fff" />
        <Text style={st.uploadText}>{uploading ? "Uploading…" : `Upload to ${LABEL(cat)}`}</Text>
      </TouchableOpacity>

      <FlatList
        data={docs}
        keyExtractor={(d) => d.document_id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => (
          <View style={st.docRow}>
            <Ionicons name="document-text" size={24} color={theme.primary} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={st.docName} numberOfLines={1}>{item.original_filename}</Text>
              <Text style={st.docMeta}>{LABEL(item.category)} · {(item.size / 1024).toFixed(0)} KB</Text>
            </View>
            <TouchableOpacity onPress={() => del(item.document_id)}><Ionicons name="trash" size={18} color={theme.danger} /></TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={<Text style={st.empty}>No documents yet. Upload bank statements, tax files, IDs and more.</Text>}
      />
    </View>
  );
}

const st = StyleSheet.create({
  catBar: { paddingVertical: 10, paddingLeft: 12, borderBottomColor: theme.border, borderBottomWidth: 1 },
  chip: { borderColor: theme.border, borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8 },
  chipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  chipText: { color: theme.muted, fontSize: 12, fontWeight: "600" },
  uploadBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: theme.primary, margin: 16, marginBottom: 0, borderRadius: 10, paddingVertical: 12 },
  uploadText: { color: "#fff", fontWeight: "700" },
  docRow: { flexDirection: "row", alignItems: "center", backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 10, padding: 14, marginBottom: 10 },
  docName: { color: theme.text, fontWeight: "600" },
  docMeta: { color: theme.muted, fontSize: 11, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 },
  empty: { color: theme.muted, textAlign: "center", marginTop: 40 },
});
