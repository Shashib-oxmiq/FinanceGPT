// ── Bundler Screen ───────────────────────────────────────────────────────────
// Create document bundles — group multiple documents and share securely
import React, { useEffect, useState, useCallback } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, Modal, ActivityIndicator, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { api } from "../services/api";
import SmartAddBar from "../components/SmartAddBar";
import PanelChat from "../components/PanelChat";
import { theme } from "../theme";

export default function BundlerScreen({ navigation }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [shares, setShares] = useState([]);
  const [selected, setSelected] = useState([]);
  const [showShare, setShowShare] = useState(false);
  const [shareName, setShareName] = useState("");
  const [sharePassword, setSharePassword] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const docs = await api.getDocuments(user.user_id);
      setDocuments(docs);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const toggleDoc = (id) => {
    setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  };

  const createShare = async () => {
    if (selected.length === 0) { Alert.alert("Select documents", "Choose at least one document"); return; }
    try {
      // Save as a share record
      const shareId = Date.now().toString();
      const share = { share_id: shareId, user_id: user.user_id, name: shareName || "Bundle " + shareId, document_ids: JSON.stringify(selected), password: sharePassword, expiry: "", path: "", created_at: new Date().toISOString() };
      const d = await (await import("../services/db")).initDB();
      await d.runAsync("INSERT OR REPLACE INTO shares (share_id, user_id, name, document_ids, password, expiry, path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [share.share_id, share.user_id, share.name, share.document_ids, share.password, share.expiry, share.path, share.created_at]);
      setShares([share, ...shares]);
      setShowShare(false);
      setShareName(""); setSharePassword(""); setSelected([]);
      Alert.alert("Success", "Secure share created");
    } catch (e) { Alert.alert("Error", e.message); }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={theme.primary} /></View>;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Document Bundler</Text>
          <Text style={styles.subtitle}>Group documents and share securely</Text>
        </View>
      </View>
      <SmartAddBar context="Bundler" onSaved={load} />
      {documents.length === 0 ? (
        <View style={styles.empty}><Ionicons name="folder-open" size={40} color={theme.muted} /><Text style={styles.emptyText}>Upload documents to your vault first</Text></View>
      ) : (
        <FlatList
          data={documents}
          keyExtractor={(x) => x.document_id}
          contentContainerStyle={{ paddingBottom: 80 }}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.docRow} onPress={() => toggleDoc(item.document_id)} activeOpacity={0.7}>
              <Ionicons name={selected.includes(item.document_id) ? "checkbox" : "square-outline"} size={22} color={selected.includes(item.document_id) ? theme.primary : theme.muted} />
              <View style={styles.docInfo}>
                <Text style={styles.docName} numberOfLines={1}>{item.original_filename}</Text>
                <Text style={styles.docMeta}>{item.category} · {(item.size / 1024).toFixed(0)} KB</Text>
              </View>
            </TouchableOpacity>
          )}
          ListFooterComponent={() => (
            <View>
              {selected.length > 0 && (
                <View style={styles.selectedBar}>
                  <Text style={styles.selectedText}>{selected.length} selected</Text>
                  <TouchableOpacity style={styles.shareBtn} onPress={() => setShowShare(true)}>
                    <Ionicons name="share-social" size={16} color="#fff" />
                    <Text style={styles.shareBtnText}>Create Secure Share</Text>
                  </TouchableOpacity>
                </View>
              )}
              {shares.length > 0 && (
                <View style={styles.sharesSection}>
                  <Text style={styles.sharesTitle}>Your Shares</Text>
                  {shares.map((s) => (
                    <View key={s.share_id} style={styles.shareItem}>
                      <Ionicons name="link" size={16} color={theme.primary} />
                      <Text style={styles.shareName}>{s.name}</Text>
                      <Text style={styles.shareDate}>{s.created_at?.substring(0, 10)}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        />
      )}
      <PanelChat context="Bundler" title="Ask AI about document bundling" />
      <Modal visible={showShare} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create Secure Share</Text>
            <TextInput style={styles.input} placeholder="Share name" placeholderTextColor={theme.muted} value={shareName} onChangeText={setShareName} />
            <TextInput style={styles.input} placeholder="Password (optional)" placeholderTextColor={theme.muted} value={sharePassword} onChangeText={setSharePassword} secureTextEntry />
            <Text style={styles.shareInfo}>{selected.length} documents will be included</Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowShare(false)}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={createShare}><Text style={styles.saveText}>Create</Text></TouchableOpacity>
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
  docRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, marginHorizontal: 16, marginBottom: 4, backgroundColor: theme.card, borderRadius: 12, borderWidth: 1, borderColor: theme.border },
  docInfo: { flex: 1 },
  docName: { fontSize: 14, fontWeight: "600", color: theme.text },
  docMeta: { fontSize: 12, color: theme.muted, marginTop: 2 },
  selectedBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, marginTop: 8 },
  selectedText: { fontSize: 14, color: theme.textSecondary, fontWeight: "600" },
  shareBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: theme.primary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  shareBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  sharesSection: { padding: 16, paddingTop: 24 },
  sharesTitle: { fontSize: 16, fontWeight: "700", color: theme.text, marginBottom: 12 },
  shareItem: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: theme.card, borderRadius: 10, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: theme.border },
  shareName: { flex: 1, fontSize: 14, color: theme.text },
  shareDate: { fontSize: 12, color: theme.muted },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: theme.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  modalTitle: { fontSize: 20, fontWeight: "700", color: theme.text, marginBottom: 16 },
  input: { backgroundColor: theme.input, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text, marginBottom: 10, borderWidth: 1, borderColor: theme.border },
  shareInfo: { fontSize: 13, color: theme.muted, marginBottom: 16 },
  modalButtons: { flexDirection: "row", gap: 12 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: theme.border, alignItems: "center" },
  cancelText: { color: theme.textSecondary, fontSize: 15, fontWeight: "600" },
  saveBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: theme.primary, alignItems: "center" },
  saveText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});