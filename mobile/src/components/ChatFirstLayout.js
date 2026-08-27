// ── ChatFirstLayout ───────────────────────────────────────────────────────────
// The UI pattern for ALL feature screens: CHAT IS CENTER STAGE.
// Info/policy list is a collapsible panel on the side or bottom.
// The user sees: "I'm your financial assistant, standing next to you.
// Ask me anything." The info is available but doesn't dominate the screen.
//
// Layout:
// ┌─────────────────────────────┐
// │  [info toggle]  Screen Title │  ← minimal header
// ├─────────────────────────────┤
// │                             │
// │     CHAT (center stage)     │  ← takes most of the screen
// │     Messages render here    │
// │     Input at bottom         │
// │                             │
// ├─────────────────────────────┤
// │  ▼ Your Policies (collapsed) │  ← info collapses to a bar
// └─────────────────────────────┘
// When expanded, info shows as an overlay/bottom sheet, not pushing chat away.

import React, { useState, useRef, useCallback } from "react";
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Modal, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
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
  Loans: "The user is viewing their loans. Help with EMI calculations, refinancing, and debt management.",
  Bills: "The user is viewing their bills. Help with bill tracking and payment reminders.",
  Tax: "The user is viewing tax information. Help with tax filing, deductions, and regime comparison.",
  Retirement: "The user is viewing retirement planning. Help with corpus calculation and NPS/PPF/EPF.",
  Education: "The user is viewing education planning. Help with future cost calculation and SIP planning.",
  Property: "The user is viewing their properties. Help with valuation, tax, and mutation.",
  Legacy: "The user is doing legacy/estate planning. Help with trusted contacts and secure shares.",
  LegalRights: "The user is asking about legal rights. Help with consumer, tenant, employee, and citizen rights.",
  MedicalRecords: "The user is viewing medical records. Help with prescriptions, lab reports, and health tracking.",
};

const SCREEN_TITLES = {
  Insurance: "Insurance",
  Investments: "Investments",
  Loans: "Loans & Debt",
  Bills: "Bills & Payments",
  Tax: "Tax Planning",
  Retirement: "Retirement",
  Education: "Education Planning",
  Property: "Property",
  Legacy: "Legacy & Estate",
  LegalRights: "Legal Rights",
  MedicalRecords: "Medical Records",
  Dashboard: "Financial Dashboard",
};

export default function ChatFirstLayout({ context, children, infoLabel }) {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingId, setStreamingId] = useState(null);
  const [conversationId, setConversationId] = useState(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const flatRef = useRef(null);

  const hint = CONTEXT_HINTS[context] || `The user is on the ${context} screen.`;
  const screenTitle = SCREEN_TITLES[context] || context;

  const send = async () => {
    if (!input.trim() || streaming || !user) return;
    const text = input.trim();
    setInput("");
    setStreaming(true);

    try {
      setMessages((m) => [...m, { role: "user", content: text, id: Date.now() + "u" }]);

      let convId = conversationId;
      if (!convId) {
        try {
          const conv = await api.createConversation(user.user_id, `[${context}] ${text.slice(0, 40)}`);
          convId = conv.conversation_id;
          setConversationId(convId);
        } catch (e) { console.warn("ChatFirst: createConversation failed:", e.message); }
      }
      if (convId) api.saveMessage(convId, user.user_id, "user", text).catch(() => {});

      let system = "";
      try {
        const history = messages.map((m) => ({ role: m.role, content: m.content }));
        const memoryCtx = await getMemoryContext(user.user_id).catch(() => "");
        system = await buildSystemPrompt(user, history, lang) + memoryCtx + `\n\n=== CURRENT SCREEN ===\n${hint}`;
      } catch (e) {
        system = `You are Everkin — a personal AI assistant for money, insurance, property, legal documents, taxes, and family planning. ${hint}\nRespond in ${lang === "en" ? "English" : lang}. Be concise and helpful.`;
      }

      autoExtractMemories(user.user_id, text).catch(() => {});

      const assistantId = Date.now() + "a";
      setMessages((m) => [...m, { role: "assistant", content: "", id: assistantId }]);
      setStreamingId(assistantId);

      const full = await streamChat(system, text, "qwen3.8-27b", (delta) => {
        setMessages((m) => m.map((msg) =>
          msg.id === assistantId ? { ...msg, content: msg.content + delta } : msg
        ));
      });

      if (convId) api.saveMessage(convId, user.user_id, "assistant", full, { model: "qwen3.8-27b" }).catch(() => {});
    } catch (e) {
      const aid = Date.now() + "a";
      setMessages((m) => [...m, { role: "assistant", content: `Sorry — I couldn't process that. ${e.message}`, id: aid }]);
    } finally {
      setStreaming(false);
      setStreamingId(null);
    }
  };

  const renderMsg = ({ item }) => (
    <View style={[cfStyles.msg, item.role === "user" ? cfStyles.msgUser : cfStyles.msgAI]}>
      {item.role === "assistant" ? (
        <ChatVizMessage content={item.content} textStyle={cfStyles.msgAIText} isStreaming={streaming && item.id === streamingId} />
      ) : (
        <Text style={cfStyles.msgUserText}>{item.content}</Text>
      )}
    </View>
  );

  return (
    <View style={cfStyles.container}>
      {/* ── Minimal header: title + info toggle ── */}
      <View style={cfStyles.header}>
        <Text style={cfStyles.headerTitle}>{screenTitle}</Text>
        <TouchableOpacity
          style={cfStyles.infoToggle}
          onPress={() => setInfoOpen(!infoOpen)}
          activeOpacity={0.7}
        >
          <Ionicons name={infoOpen ? "chevron-down" : "list"} size={16} color={theme.primary} />
          <Text style={cfStyles.infoToggleText}>{infoLabel || "My Info"}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Chat area (CENTER STAGE, takes most of the screen) ── */}
      <View style={cfStyles.chatArea}>
        {messages.length === 0 ? (
          <View style={cfStyles.welcome}>
            <View style={cfStyles.welcomeAvatar}>
              <Ionicons name="chatbubble-ellipses" size={32} color={theme.primary} />
            </View>
            <Text style={cfStyles.welcomeTitle}>I'm your {screenTitle.toLowerCase()} assistant</Text>
            <Text style={cfStyles.welcomeText}>
              I'm standing right next to you. Ask me anything — no need to search through lists.
            </Text>
            <View style={cfStyles.welcomeHints}>
              {getExamplePrompts(context).map((p, i) => (
                <TouchableOpacity key={i} style={cfStyles.hintCard} onPress={() => { setInput(p); }}>
                  <Text style={cfStyles.hintText}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            ref={flatRef}
            data={messages}
            keyExtractor={(x) => x.id}
            renderItem={renderMsg}
            contentContainerStyle={{ padding: 12, paddingBottom: 80 }}
            onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: true })}
          />
        )}
      </View>

      {/* ── Input bar (always visible, fixed at bottom of chat area) ── */}
      <View style={cfStyles.inputBar}>
        <TextInput
          style={cfStyles.input}
          placeholder="Ask me anything…"
          placeholderTextColor={theme.muted}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={send}
          editable={!streaming}
          multiline
          maxHeight={60}
        />
        <TouchableOpacity style={cfStyles.sendBtn} onPress={send} disabled={streaming || !input.trim()}>
          {streaming ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={16} color="#fff" />}
        </TouchableOpacity>
      </View>

      {/* ── Info panel (bottom sheet overlay — doesn't push chat away) ── */}
      <Modal visible={infoOpen} animationType="slide" transparent={true} onRequestClose={() => setInfoOpen(false)}>
        <View style={cfStyles.infoOverlay}>
          <TouchableOpacity style={cfStyles.infoBackdrop} activeOpacity={1} onPress={() => setInfoOpen(false)} />
          <View style={cfStyles.infoSheet}>
            <View style={cfStyles.infoSheetHeader}>
              <Text style={cfStyles.infoSheetTitle}>{infoLabel || screenTitle}</Text>
              <TouchableOpacity onPress={() => setInfoOpen(false)}>
                <Ionicons name="close" size={22} color={theme.muted} />
              </TouchableOpacity>
            </View>
            <View style={{ flex: 1 }}>
              {children}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Example prompts per screen context ──
function getExamplePrompts(context) {
  const prompts = {
    Insurance: [
      "Do I have enough life insurance?",
      "Compare my policies and find gaps",
      "Which policy should I renew?",
    ],
    Investments: [
      "How is my portfolio doing?",
      "Should I rebalance my investments?",
      "Which investment is underperforming?",
    ],
    Loans: [
      "Am I paying too much interest?",
      "Should I prepay my personal loan?",
      "How much EMI can I afford?",
    ],
    Bills: [
      "Which bills are due this week?",
      "Am I paying for anything I don't use?",
      "How much did I spend last month?",
    ],
    Tax: [
      "How much tax will I pay this year?",
      "Old vs new regime — which is better?",
      "What deductions am I missing?",
    ],
    Retirement: [
      "Will I have enough to retire?",
      "How much should I save monthly?",
      "When can I retire comfortably?",
    ],
    Education: [
      "How much will my child's education cost?",
      "What SIP should I start for education?",
      "Can I afford international education?",
    ],
    Property: [
      "What is my property worth?",
      "Should I sell or rent my property?",
      "How much property tax do I owe?",
    ],
    Legacy: [
      "What happens to my assets if something happens to me?",
      "How do I set up my will?",
      "Who has access to my accounts?",
    ],
    LegalRights: [
      "What are my rights as a tenant?",
      "What are my consumer rights?",
      "What are my employee rights?",
    ],
    MedicalRecords: [
      "What does my latest blood test show?",
      "Track my health trends",
      "When is my next checkup due?",
    ],
    Dashboard: [
      "How is my financial health?",
      "What should I focus on this month?",
      "Any red flags in my finances?",
    ],
  };
  return prompts[context] || ["Ask me anything…", "What should I know?", "Help me decide"];
}

const cfStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.border },
  headerTitle: { fontSize: 16, fontWeight: "700", color: theme.text },
  infoToggle: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: theme.card, borderRadius: 8, borderWidth: 1, borderColor: theme.border },
  infoToggleText: { fontSize: 12, fontWeight: "600", color: theme.primary },

  // Chat area
  chatArea: { flex: 1 },
  welcome: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 24, paddingVertical: 20 },
  welcomeAvatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: theme.primary + "15", justifyContent: "center", alignItems: "center", marginBottom: 16 },
  welcomeTitle: { fontSize: 18, fontWeight: "700", color: theme.text, marginBottom: 8, textAlign: "center" },
  welcomeText: { fontSize: 14, color: theme.muted, textAlign: "center", marginBottom: 20, lineHeight: 20 },
  welcomeHints: { width: "100%", maxWidth: 400, gap: 8 },
  hintCard: { backgroundColor: theme.card, borderRadius: 10, borderWidth: 1, borderColor: theme.border, padding: 12, paddingHorizontal: 14 },
  hintText: { fontSize: 13, color: theme.textSecondary },

  // Messages
  msg: { padding: 10, borderRadius: 12, marginVertical: 3 },
  msgUser: { backgroundColor: theme.primary + "15", alignSelf: "flex-end", maxWidth: "85%" },
  msgAI: { backgroundColor: theme.card, alignSelf: "flex-start", maxWidth: "90%", borderWidth: 1, borderColor: theme.border },
  msgUserText: { fontSize: 14, color: theme.text },
  msgAIText: { fontSize: 14, color: theme.text },

  // Input bar
  inputBar: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: theme.border, backgroundColor: theme.background },
  input: { flex: 1, borderWidth: 1, borderColor: theme.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: theme.text, backgroundColor: theme.card, maxHeight: 60 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.primary, justifyContent: "center", alignItems: "center" },

  // Info bottom sheet
  infoOverlay: { flex: 1, justifyContent: "flex-end" },
  infoBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  infoSheet: { backgroundColor: theme.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "75%", minHeight: 200, borderWidth: 1, borderColor: theme.border },
  infoSheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.border },
  infoSheetTitle: { fontSize: 16, fontWeight: "700", color: theme.text },
});