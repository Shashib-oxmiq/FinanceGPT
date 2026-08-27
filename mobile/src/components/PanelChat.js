// ── PanelChat Component ──────────────────────────────────────────────────────
// Collapsible AI chat panel on every screen — uses full system prompt with
// financial data, saves conversations to DB so they appear in the main Chat screen.
import React, { useState, useRef, useCallback } from "react";
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, KeyboardAvoidingView, Platform, Animated, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { streamChat, buildSystemPrompt } from "../services/ai";
import { api } from "../services/api";
import { getMemoryContext, autoExtractMemories } from "../services/aiMemory";
import { ChatVizMessage } from "./ChatViz";
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
  Loans: "The user is viewing their loans. Help with EMI calculations, refinancing, and debt management.",
  Bills: "The user is viewing their bills. Help with bill tracking and payment reminders.",
  Tax: "The user is viewing tax information. Help with tax filing, deductions, and regime comparison.",
  Retirement: "The user is viewing retirement planning. Help with corpus calculation and NPS/PPF/EPF.",
  Education: "The user is viewing education planning. Help with future cost calculation and SIP planning.",
  Property: "The user is viewing their properties. Help with valuation, tax, and mutation.",
  MedicalRecords: "The user is viewing medical records. Help with prescriptions, lab reports, and health tracking.",
  LegalRights: "The user is asking about legal rights. Help with consumer, tenant, employee, and citizen rights.",
};

export default function PanelChat({ context, title }) {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [conversationId, setConversationId] = useState(null);
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

    try {
      // Add user message to UI immediately
      setMessages((m) => [...m, { role: "user", content: text, id: Date.now() + "u" }]);

      // ── Create or reuse conversation — saved to DB so it appears in Chat screen ──
      let convId = conversationId;
      if (!convId) {
        try {
          const conv = await api.createConversation(user.user_id, `[${context}] ${text.slice(0, 40)}`);
          convId = conv.conversation_id;
          setConversationId(convId);
        } catch (e) {
          console.warn("PanelChat: createConversation failed:", e.message);
        }
      }

      // Save user message to DB
      if (convId) {
        api.saveMessage(convId, user.user_id, "user", text).catch(() => {});
      }

      // ── Build full system prompt with ALL financial data ──
      const hint = CONTEXT_HINTS[context] || `The user is on the ${context} screen.`;
      let system = "";
      try {
        const history = messages.map((m) => ({ role: m.role, content: m.content }));
        const memoryCtx = await getMemoryContext(user.user_id).catch(() => "");
        system = await buildSystemPrompt(user, history, lang) + memoryCtx + `\n\n=== CURRENT SCREEN ===\n${hint}`;
      } catch (e) {
        console.warn("PanelChat: buildSystemPrompt failed, using fallback:", e.message);
        system = `You are Everkin — a personal AI assistant for money, insurance, property, legal documents, taxes, and family planning. ${hint}\nRespond in ${lang === "en" ? "English" : lang}. Be concise and helpful.`;
      }

      // Auto-extract memories
      autoExtractMemories(user.user_id, text).catch(() => {});

      // Add assistant placeholder
      const assistantId = Date.now() + "a";
      setMessages((m) => [...m, { role: "assistant", content: "", id: assistantId }]);

      // Stream AI response
      const full = await streamChat(system, text, "qwen3.8-27b", (delta) => {
        setMessages((m) => m.map((msg) =>
          msg.id === assistantId ? { ...msg, content: msg.content + delta } : msg
        ));
      });

      // Save assistant message to DB
      if (convId) {
        api.saveMessage(convId, user.user_id, "assistant", full, { model: "qwen3.8-27b" }).catch(() => {});
      }
    } catch (e) {
      const aid = Date.now() + "a";
      setMessages((m) => [...m, { role: "assistant", content: `Sorry — I couldn't process that. ${e.message}`, id: aid }]);
    } finally {
      setStreaming(false);
    }
  };

  const renderMsg = ({ item }) => (
    <View style={[styles.msg, item.role === "user" ? styles.msgUser : styles.msgAI]}>
      {item.role === "assistant" ? (
        <ChatVizMessage content={item.content} textStyle={styles.msgAIText} />
      ) : (
        <Text style={styles.msgUserText}>{item.content}</Text>
      )}
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
              {streaming ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={14} color="#fff" />}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 12 },
  trigger: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: theme.card, borderRadius: 12, borderWidth: 1, borderColor: theme.border },
  triggerText: { fontSize: 13, fontWeight: "600", color: theme.primary, flex: 1 },
  badge: { backgroundColor: theme.primary, borderRadius: 10, minWidth: 20, height: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  panel: { backgroundColor: theme.card, borderRadius: 12, borderWidth: 1, borderColor: theme.border, marginTop: 8, padding: 8 },
  empty: { fontSize: 13, color: theme.muted, padding: 16, textAlign: "center" },
  msg: { padding: 8, borderRadius: 10, marginVertical: 2 },
  msgUser: { backgroundColor: theme.primary + "15", alignSelf: "flex-end", maxWidth: "85%" },
  msgAI: { backgroundColor: theme.border + "30", alignSelf: "flex-start", maxWidth: "90%" },
  msgUserText: { fontSize: 13, color: theme.text },
  msgAIText: { fontSize: 13, color: theme.text },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  input: { flex: 1, borderWidth: 1, borderColor: theme.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: theme.text },
  sendBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.primary, justifyContent: "center", alignItems: "center" },
});