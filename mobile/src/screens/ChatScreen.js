import React, { useEffect, useState, useCallback, useRef } from "react";
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { api } from "../services/api";
import { streamChat, buildSystemPrompt } from "../services/ai";
import { setApiKey } from "../services/ai";
import * as SecureStore from "expo-secure-store";
import { theme } from "../theme";

export default function ChatScreen() {
  const { t, lang, changeLang } = useLanguage();
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [loading, setLoading] = useState(true);
  const flatRef = useRef(null);

  useEffect(() => {
    (async () => {
      const key = await SecureStore.getItemAsync("ai_api_key");
      if (key) setApiKey(key);
    })();
  }, []);

  const loadConvos = useCallback(async () => {
    if (!user) return;
    try {
      const convs = await api.getConversations(user.user_id);
      setConversations(convs);
      if (convs.length > 0 && !activeId) {
        setActiveId(convs[0].conversation_id);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { loadConvos(); }, [loadConvos]);

  const loadMessages = useCallback(async () => {
    if (!activeId || !user) return;
    const msgs = await api.getMessages(activeId, user.user_id);
    setMessages(msgs);
  }, [activeId, user]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  const newConversation = async () => {
    if (!user) return;
    const conv = await api.createConversation(user.user_id);
    setConversations([conv, ...conversations]);
    setActiveId(conv.conversation_id);
    setMessages([]);
  };

  const send = async () => {
    if (!input.trim() || streaming || !activeId || !user) return;
    const text = input.trim();
    setInput("");
    setStreaming(true);

    // Add user message
    const userMsg = { role: "user", content: text, message_id: Date.now() + "u" };
    setMessages((m) => [...m, userMsg]);
    await api.saveMessage(activeId, user.user_id, "user", text);

    // Build system prompt
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    const system = buildSystemPrompt(user, history, "", lang);

    // Add assistant placeholder
    const assistantId = Date.now() + "a";
    setMessages((m) => [...m, { role: "assistant", content: "", message_id: assistantId }]);

    try {
      const fullText = await streamChat(system, text, "qwen3.8-27b", (delta) => {
        setMessages((m) => m.map((msg) =>
          msg.message_id === assistantId ? { ...msg, content: msg.content + delta } : msg
        ));
      });

      // Save assistant message
      await api.saveMessage(activeId, user.user_id, "assistant", fullText, { model: "qwen3.8-27b" });

      // Detect [LANG_CHANGE:xx]
      const langMatch = fullText.match(/\[LANG_CHANGE:([a-z]{2})\]/i);
      if (langMatch) {
        const newLang = langMatch[1].toLowerCase();
        changeLang(newLang);
      }

      // Detect investment actions
      const invAddMatches = [...fullText.matchAll(/\[INV_ADD:(\{[^}]+\})\]/g)];
      const invEditMatches = [...fullText.matchAll(/\[INV_EDIT:(\{[^}]+\})\]/g)];
      const invDeleteMatches = [...fullText.matchAll(/\[INV_DELETE:([^\]]+)\]/g)];

      for (const m of invAddMatches) {
        try { await api.investmentChatAction(user.user_id, "add", { data: JSON.parse(m[1]) }); } catch (e) { console.warn(e); }
      }
      for (const m of invEditMatches) {
        try { const p = JSON.parse(m[1]); await api.investmentChatAction(user.user_id, "edit", { name: p.name, updates: p.updates || p }); } catch (e) { console.warn(e); }
      }
      for (const m of invDeleteMatches) {
        try { await api.investmentChatAction(user.user_id, "delete", { name: m[1].trim() }); } catch (e) { console.warn(e); }
      }

      // Strip markers from displayed message
      if (invAddMatches.length + invEditMatches.length + invDeleteMatches.length > 0 || langMatch) {
        const clean = fullText.replace(/\[LANG_CHANGE:[a-z]{2}\]/gi, "").replace(/\[INV_[A-Z]+:[^\]]*\]/g, "").trim();
        setMessages((m) => m.map((msg) => msg.message_id === assistantId ? { ...msg, content: clean } : msg));
      }

      loadConvos();
    } catch (e) {
      setMessages((m) => m.map((msg) =>
        msg.message_id === assistantId ? { ...msg, content: `Sorry — I couldn't process that. ${e.message}` } : msg
      ));
    } finally {
      setStreaming(false);
    }
  };

  const renderMessage = ({ item }) => (
    <View style={[styles.msg, item.role === "user" ? styles.msgUser : styles.msgAssistant]}>
      <Text style={item.role === "user" ? styles.msgUserText : styles.msgAssistantText}>{item.content}</Text>
    </View>
  );

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={theme.primary} /></View>;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container} keyboardVerticalOffset={90}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t("chat.title")}</Text>
        <TouchableOpacity onPress={newConversation} style={styles.newBtn}>
          <Ionicons name="add-circle-outline" size={22} color={theme.primary} />
          <Text style={styles.newBtnText}>{t("chat.new_conversation")}</Text>
        </TouchableOpacity>
      </View>

      {messages.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="chatbubbles" size={48} color={theme.muted} />
          <Text style={styles.emptyText}>{t("chat.how_can_help")}</Text>
        </View>
      ) : (
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={(x) => x.message_id}
          renderItem={renderMessage}
          contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
          onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: true })}
        />
      )}

      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          placeholder={t("chat.placeholder")}
          placeholderTextColor={theme.muted}
          value={input}
          onChangeText={setInput}
          multiline
          maxLength={4000}
          editable={!streaming}
        />
        <TouchableOpacity style={styles.sendBtn} onPress={send} disabled={streaming || !input.trim()}>
          {streaming ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={18} color="#fff" />}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  center: { flex: 1, backgroundColor: theme.background, justifyContent: "center", alignItems: "center" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.border },
  headerTitle: { fontSize: 20, fontWeight: "800", color: theme.text },
  newBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  newBtnText: { fontSize: 13, color: theme.primary, fontWeight: "600" },
  empty: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyText: { color: theme.muted, fontSize: 16, marginTop: 16, textAlign: "center" },
  msg: { maxWidth: "85%", borderRadius: 16, padding: 12, marginBottom: 8 },
  msgUser: { alignSelf: "flex-end", backgroundColor: theme.primary },
  msgUserText: { color: "#fff", fontSize: 15, lineHeight: 22 },
  msgAssistant: { alignSelf: "flex-start", backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border },
  msgAssistantText: { color: theme.text, fontSize: 15, lineHeight: 22 },
  inputBar: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 12, paddingVertical: 8, gap: 8, borderTopWidth: 1, borderTopColor: theme.border, backgroundColor: theme.card },
  input: { flex: 1, backgroundColor: theme.input, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: theme.text, maxHeight: 100, borderWidth: 1, borderColor: theme.border },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.primary, justifyContent: "center", alignItems: "center" },
});