// ── DocumentCard Component ───────────────────────────────────────────────────
// Rich in-chat document display — replaces the old "download .txt file" paradigm.
// When the AI generates a document, it appears as a beautiful card in the chat
// with preview, Save to Vault, Share, and Modify buttons.
//
// This is the core of the "personal assistant" experience:
// The assistant hands you a completed document, not a file to download.

import React, { useState, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Share, Alert, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../services/api";
import { theme } from "../theme";

export default function DocumentCard({ doc, user, onModify, onSave }) {
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (!doc) return null;

  const { type, title, content, fields } = doc;

  const handleSave = async () => {
    if (!user) { Alert.alert("Sign in required", "Please sign in to save documents to your vault."); return; }
    setSaving(true);
    try {
      const hash = `${type}_${Date.now()}`;
      await api.addDocument(user.user_id, {
        original_filename: `${title || type}.txt`,
        category: "Legal",
        content_type: "text/plain",
        size: (content || "").length,
        storage_path: "",
        content_hash: hash,
        tags: JSON.stringify(["generated", type]),
      });
      // Also store the generated content in form_copies for retrieval
      try {
        const db = await (await import("../services/db")).initDB();
        await db.runAsync(
          "INSERT INTO form_copies (copy_id, user_id, name, form_data, created_at) VALUES (?, ?, ?, ?, ?)",
          [hash, user.user_id, title || type, content, new Date().toISOString()]
        );
      } catch (e) { /* non-fatal */ }
      setSaved(true);
      if (onSave) onSave(doc);
    } catch (e) { Alert.alert("Error", "Could not save document."); }
    finally { setSaving(false); }
  };

  const handleShare = async () => {
    try {
      if (Platform.OS === "web") {
        // Web: copy to clipboard
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(content || "");
          Alert.alert("Copied", "Document content copied to clipboard. You can paste it anywhere.");
        }
      } else {
        // Native: use Share API
        await Share.share({ title: title || type, message: content || "" });
      }
    } catch (e) { /* non-fatal */ }
  };

  const handleModify = () => {
    if (onModify) onModify(doc);
  };

  const previewText = expanded ? content : (content || "").slice(0, 300);
  const hasMore = (content || "").length > 300;

  return (
    <View style={styles.card}>
      {/* Header bar with document type icon + title */}
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Ionicons name="document-text" size={20} color={theme.primary} />
        </View>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>{title || "Document"}</Text>
          <Text style={styles.subtitle}>AI-Generated · Ready to use</Text>
        </View>
        <View style={styles.badge}>
          <Ionicons name="checkmark-circle" size={14} color={theme.accent} />
          <Text style={styles.badgeText}>READY</Text>
        </View>
      </View>

      {/* Document preview */}
      <View style={styles.previewWrap}>
        <ScrollView style={styles.previewScroll} nestedScrollEnabled={true} showsVerticalScrollIndicator={false}>
          <Text style={styles.previewText}>{previewText}</Text>
        </ScrollView>
        {hasMore && !expanded && (
          <View style={styles.fadeOut} pointerEvents="none" />
        )}
      </View>

      {hasMore && (
        <TouchableOpacity style={styles.expandBtn} onPress={() => setExpanded(!expanded)}>
          <Text style={styles.expandText}>{expanded ? "Show less" : "Read full document"}</Text>
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={14} color={theme.primary} />
        </TouchableOpacity>
      )}

      {/* Action buttons */}
      <View style={styles.actions}>
        {saved ? (
          <View style={styles.savedBadge}>
            <Ionicons name="checkmark" size={16} color={theme.accent} />
            <Text style={styles.savedText}>Saved to Vault</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
            <Ionicons name="folder-open" size={16} color="#fff" />
            <Text style={styles.saveBtnText}>{saving ? "Saving..." : "Save to Vault"}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
          <Ionicons name="share-social" size={16} color={theme.primary} />
          <Text style={styles.shareBtnText}>Share</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.modifyBtn} onPress={handleModify}>
          <Ionicons name="create" size={16} color={theme.primary} />
          <Text style={styles.modifyBtnText}>Modify</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.primary + "40",
    marginVertical: 8,
    overflow: "hidden",
    elevation: 2,
    shadowColor: theme.primary,
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    backgroundColor: theme.primary + "0A",
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: theme.primary + "20",
    justifyContent: "center",
    alignItems: "center",
  },
  titleWrap: { flex: 1 },
  title: { fontSize: 15, fontWeight: "700", color: theme.text },
  subtitle: { fontSize: 11, color: theme.muted, marginTop: 2 },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: theme.accent + "20", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 10, fontWeight: "700", color: theme.accent },
  previewWrap: {
    maxHeight: 300,
    paddingHorizontal: 14,
    paddingVertical: 12,
    position: "relative",
  },
  previewScroll: { maxHeight: 280 },
  previewText: {
    fontSize: 13,
    lineHeight: 20,
    color: theme.textSecondary,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  fadeOut: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 40,
    backgroundColor: theme.card,
    opacity: 0.9,
  },
  expandBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  expandText: { fontSize: 12, color: theme.primary, fontWeight: "600" },
  actions: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  saveBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: theme.primary,
    paddingVertical: 10,
    borderRadius: 10,
  },
  saveBtnText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  savedBadge: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: theme.accent + "20",
    paddingVertical: 10,
    borderRadius: 10,
  },
  savedText: { color: theme.accent, fontSize: 12, fontWeight: "600" },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: theme.border,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  shareBtnText: { color: theme.primary, fontSize: 12, fontWeight: "600" },
  modifyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: theme.border,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  modifyBtnText: { color: theme.primary, fontSize: 12, fontWeight: "600" },
});