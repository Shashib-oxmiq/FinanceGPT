import React, { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { api, loadToken } from "../api";
import { API } from "../config";
import { theme } from "../theme";

function parseSSE(text) {
  let out = "";
  let err = null;
  for (const block of text.split("\n\n")) {
    const line = block.replace(/^data: /, "").trim();
    if (!line) continue;
    try {
      const evt = JSON.parse(line);
      if (evt.delta) out += evt.delta;
      if (evt.error) err = evt.error;
    } catch {}
  }
  return { out, err };
}

export default function ChatScreen() {
  const [convId, setConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [model, setModel] = useState("claude");
  const [busy, setBusy] = useState(false);
  const [attachment, setAttachment] = useState(null);
  const listRef = useRef(null);

  useEffect(() => {
    setMessages([{ id: "welcome", role: "assistant", content: "Hi, I'm your Everkin advisor. Ask a financial question, or tell me about your insurance and next-of-kin." }]);
  }, []);

  const ensureConversation = async () => {
    if (convId) return convId;
    const { data } = await api.post("/chat/conversations", { title: "Mobile chat" });
    setConvId(data.conversation_id);
    return data.conversation_id;
  };

  const pickFile = async () => {
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.length) return;
    const file = res.assets[0];
    try {
      const form = new FormData();
      form.append("file", { uri: file.uri, name: file.name, type: file.mimeType || "application/octet-stream" });
      const { data } = await api.post("/chat/upload", form, { headers: { "Content-Type": "multipart/form-data" } });
      setAttachment({ ...data });
    } catch {
      Alert.alert("Upload failed", "Could not attach the file.");
    }
  };

  const send = async () => {
    if ((!input.trim() && !attachment) || busy) return;
    const cid = await ensureConversation();
    const text = input;
    const att = attachment;
    setInput("");
    setAttachment(null);
    const userMsg = { id: `u${Date.now()}`, role: "user", content: text, attachment: att };
    const aiMsg = { id: `a${Date.now()}`, role: "assistant", content: "" };
    setMessages((m) => [...m, userMsg, aiMsg]);
    setBusy(true);

    const token = await loadToken();
    const useModel = att ? "gemini" : model;
    const body = JSON.stringify({
      content: text,
      model: useModel,
      attachments: att ? [{ attachment_id: att.attachment_id, filename: att.filename, content_type: att.content_type }] : [],
    });

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API}/chat/conversations/${cid}/message`);
    xhr.setRequestHeader("Content-Type", "application/json");
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.onprogress = () => {
      const { out } = parseSSE(xhr.responseText);
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { ...copy[copy.length - 1], content: out };
        return copy;
      });
      listRef.current?.scrollToEnd({ animated: true });
    };
    xhr.onload = () => {
      const { out, err } = parseSSE(xhr.responseText);
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { ...copy[copy.length - 1], content: out || (err ? "Sorry — I couldn't process that. Please try again." : "") };
        return copy;
      });
      setBusy(false);
    };
    xhr.onerror = () => {
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { ...copy[copy.length - 1], content: "Sorry — the connection dropped. Please try again." };
        return copy;
      });
      setBusy(false);
    };
    xhr.send(body);
  };

  const renderItem = ({ item }) => (
    <View style={[st.bubbleRow, item.role === "user" ? st.right : st.left]}>
      <View style={[st.bubble, item.role === "user" ? st.userBubble : st.aiBubble]}>
        {item.attachment && (
          <View style={st.attachChip}>
            <Ionicons name="document" size={12} color={theme.text} />
            <Text style={st.attachText}>{item.attachment.filename}</Text>
          </View>
        )}
        <Text style={[st.bubbleText, item.role === "user" && { color: "#fff" }]}>
          {item.content || (busy ? "…" : "")}
        </Text>
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <View style={st.modelBar}>
        {["claude", "gemini"].map((mk) => (
          <TouchableOpacity key={mk} onPress={() => setModel(mk)} style={[st.modelChip, model === mk && st.modelChipActive]}>
            <Text style={[st.modelChipText, model === mk && { color: "#fff" }]}>{mk === "claude" ? "Claude 4.6" : "Gemini 3.1"}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <FlatList
        ref={listRef}
        data={messages}
        renderItem={renderItem}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: 16 }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
      />
      {attachment && (
        <View style={st.attachBar}>
          <Ionicons name="document-attach" size={16} color={theme.accent} />
          <Text style={st.attachBarText} numberOfLines={1}>{attachment.filename}</Text>
          <TouchableOpacity onPress={() => setAttachment(null)}><Ionicons name="close" size={16} color={theme.muted} /></TouchableOpacity>
        </View>
      )}
      <View style={st.composer}>
        <TouchableOpacity onPress={pickFile} style={st.iconBtn}><Ionicons name="attach" size={22} color={theme.muted} /></TouchableOpacity>
        <TextInput
          style={st.input}
          value={input}
          onChangeText={setInput}
          placeholder="Message Everkin…"
          placeholderTextColor={theme.muted}
          multiline
        />
        <TouchableOpacity onPress={send} style={st.sendBtn} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="send" size={18} color="#fff" />}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  modelBar: { flexDirection: "row", gap: 8, padding: 10, borderBottomColor: theme.border, borderBottomWidth: 1 },
  modelChip: { borderColor: theme.border, borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  modelChipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  modelChipText: { color: theme.muted, fontSize: 12, fontWeight: "600" },
  bubbleRow: { marginBottom: 12, flexDirection: "row" },
  left: { justifyContent: "flex-start" },
  right: { justifyContent: "flex-end" },
  bubble: { maxWidth: "82%", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  aiBubble: { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1 },
  userBubble: { backgroundColor: theme.primary },
  bubbleText: { color: theme.text, fontSize: 15, lineHeight: 21 },
  attachChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.25)", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, marginBottom: 6, alignSelf: "flex-start" },
  attachText: { color: theme.text, fontSize: 11 },
  attachBar: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: theme.card },
  attachBarText: { color: theme.text, flex: 1, fontSize: 12 },
  composer: { flexDirection: "row", alignItems: "flex-end", padding: 10, gap: 8, borderTopColor: theme.border, borderTopWidth: 1, backgroundColor: theme.card },
  iconBtn: { padding: 8 },
  input: { flex: 1, backgroundColor: theme.bg, borderColor: theme.border, borderWidth: 1, borderRadius: 10, color: theme.text, paddingHorizontal: 12, paddingVertical: 10, maxHeight: 120, fontSize: 15 },
  sendBtn: { backgroundColor: theme.primary, borderRadius: 10, padding: 12 },
});
