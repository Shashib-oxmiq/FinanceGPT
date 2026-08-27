// ── PanelChat Component ──────────────────────────────────────────────────────
// Collapsible AI chat panel on every screen — same as web app's PanelChat
import React, { useState, useRef, useCallback } from "react";
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, KeyboardAvoidingView, Platform, Animated } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { streamChat } from "../services/ai";
import { theme } from "../theme";

const CONTEXT_HINTS = {
  Dashboard: "The user is viewing their financial dashboard. Help with overview questions.",
  Investments: "The user is viewing their investments. Help with portfolio questions, add/edit/delete holdings.",
  Insurance: "The user is viewing insurance policies. Help with policy questions and coverage analysis.",
  Vault: "The user is viewing their document vault. Help with document organization and questions.",
  LoanPrep: "The user is preparing Indian government forms. Help with form selection and document checklists.",
  Reminders: "The user is viewing reminders. Help with deadlines and task management.",
  Profile: "The user is editing their profile. Help with personal information and financial goals.",
  LifeEvents: "The user is planning life events. Help with milestone planning.",
  Gmail: "The user is connecting Gmail. Help with email scanning for financial documents.",
  Insights: "The user is viewing financial insights. Help with analysis and recommendations.",
  Legacy: "The user is doing legacy/estate planning. Help with trusted contacts and secure shares.",
  Bundler: "The user is creating document bundles. Help with bundling and sharing.",
  FormFiller: "The user is filling out forms. Help with form fields and requirements.",
};

export default function PanelChat({ context, title }) {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const flatRef = useRef(null);
  const heightAnim = useRef(new Animated.Value(0)).current;

  const toggle = () => {
    const toVal = open ? 0 : 1;
    Animated.timing(heightAnim, { toValue: toVal, duration: 300, useNativeDriver: false }).start();
    setOpen(!open);
  };

  const send = async () => {
    if (!input.trim() || streaming || !user) return;
    const text = input.trim();
    setInput("");
    setStreaming(true);
    setMessages((m) => [...m, { role: "user", content: text, id: Date.now() + "u" }]);

    const sys = `You are Everkin AI assistant. ${CONTEXT_HINTS[context] || ""}\n` +
      `User profile: ${JSON.stringify(user?.profile || {})}\n` +
      `Respond in ${lang === "en" ? "English" : lang}. Be concise and helpful.`;

    const assistantId = Date.now() + "a";
    setMessages((m) => [...m, { role: "assistant", content: "", id: assistantId }]);

    try {
      const full = await streamChat(sys, text, "qwen3.8-27b", (delta) => {
        setMessages((m) => m.map((msg) =>
          msg.id === assistantId ? { ...msg, content: msg.content + delta } : msg
        ));
      });
    } catch (e) {
      setMessages((m) => m.map((msg) =>
        msg.id === assistantId ? { ...msg, content: `Error: ${e.message}` } : msg
      ));
    } finally {
      setStreaming(false);
    }
  };

  const renderMsg = ({ item }) => (
    <View style={[styles.msg, item.role === "user" ? styles.msgUser : styles.msgAI]}>
      <Text style={item.role === "user" ? styles.msgUserText : styles.msgAIText}>{item.content}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.trigger} onPress={toggle} activeOpacity={0.7}>
        <Ionicons name={open ? "chevron-down" : "chatbubble-ellipses"} size={18} color={theme.primary} />
        <Text style={styles.triggerText}>{title || `Ask AI about ${context}`}</Text>
        {messages.length > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{messages.length}</Text></View>}
      </TouchableOpacity>

      {open && (
        <View style={styles.panel}>
          {messages.length === 0 ? (
            <Text style={styles.empty}>Ask a question about {context.toLowerCase()}…</Text>
          ) : (
            <FlatList
              ref={flatRef}
              data={messages}
              keyExtractor={(x) => x.id}
              renderItem={renderMsg}
              style={{ maxHeight: 200 }}
              onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: true })}
            />
          )}
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Ask…"
              placeholderTextColor={theme.muted}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={send}
              editable={!streaming}
            />
            <TouchableOpacity style={styles.sendBtn} onPress={send} disabled={streaming || !input.trim()}>
              <Ionicons name="send" size={14} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingTop: 8 },
  trigger: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: theme.card, borderRadius: 12, borderWidth: 1, borderColor: theme.border },
  triggerText: { flex: 1, fontSize: 13, color: theme.textSecondary, fontWeight: "500" },
  badge: { backgroundColor: theme.primary, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, minWidth: 20, alignItems: "center" },
  badgeText: { fontSize: 10, color: "#fff", fontWeight: "700" },
  panel: { marginTop: 8, backgroundColor: theme.card, borderRadius: 16, borderWidth: 1, borderColor: theme.border, padding: 12, maxHeight: 300 },
  empty: { fontSize: 13, color: theme.muted, textAlign: "center", paddingVertical: 20 },
  msg: { maxWidth: "85%", borderRadius: 12, padding: 10, marginBottom: 6 },
  msgUser: { alignSelf: "flex-end", backgroundColor: theme.primary },
  msgUserText: { color: "#fff", fontSize: 13, lineHeight: 18 },
  msgAI: { alignSelf: "flex-start", backgroundColor: theme.input, borderWidth: 1, borderColor: theme.border },
  msgAIText: { color: theme.text, fontSize: 13, lineHeight: 18 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  input: { flex: 1, backgroundColor: theme.input, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: 13, color: theme.text, borderWidth: 1, borderColor: theme.border },
  sendBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.primary, justifyContent: "center", alignItems: "center" },
});