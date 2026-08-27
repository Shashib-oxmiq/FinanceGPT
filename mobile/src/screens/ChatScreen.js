// ── ChatScreen — Full ChatGPT-style AI Advisor ───────────────────────────────
// Mirrors desktop Chat.jsx: sidebar (conversations+tools+profile), example prompts,
// all marker detection (INV_ADD/EDIT/DELETE, DOC_GEN, LANG_CHANGE, INS_ADD, REM_ADD, FORM_REC)

import React, { useEffect, useState, useCallback, useRef } from "react";
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Animated, ScrollView, Alert, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { api } from "../services/api";
import { streamChat, buildSystemPrompt } from "../services/ai";
import { setApiKey } from "../services/ai";
import { SecureStoreShim, pickDocument } from "../services/platform";
import { generateDocumentText, generateDocumentObject, downloadDocument, getTemplate } from "../services/docGen";
import { getFormById } from "../services/formsData";
import DocumentCard from "../components/DocumentCard";
import { speak, stopSpeaking } from "../services/tts";
import { getDailyBriefing } from "../services/briefing";
import { startListening, stopListening, isVoiceSupported, getIsListening } from "../services/voice";
import { getMemoryContext, processMemoryMarkers, autoExtractMemories } from "../services/aiMemory";
import LanguageSwitcher from "../components/LanguageSwitcher";
import { ChatVizMessage } from "../components/ChatViz";
import { theme } from "../theme";

const EXAMPLES = [
  "I'm getting married next month — what should I prepare?",
  "I need a rental agreement for my new flat",
  "How are my investments doing?",
  "I want to buy a house — can you help me plan?",
  "What documents does my family need if something happens to me?",
  "I just started a small business — what do I need?",
];

const TPL_NAMES = {
  rental_agreement: "Rental Agreement", nda: "NDA", will: "Will",
  employment_contract: "Employment Contract", loan_agreement: "Loan Agreement",
  power_of_attorney: "Power of Attorney", partnership_deed: "Partnership Deed", sale_deed: "Sale Deed",
};

export default function ChatScreen({ navigation }) {
  const { t, lang, changeLang } = useLanguage();
  const { user, logout } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingAssistantId, setStreamingAssistantId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [convDropdown, setConvDropdown] = useState(false);
  const [toast, setToast] = useState(null);
  const flatRef = useRef(null);
  const activeIdRef = useRef(null);
  activeIdRef.current = activeId;

  // Active conversation object (for header title)
  const activeConvo = conversations.find((c) => c.conversation_id === activeId);

  // ── Load AI key ──
  useEffect(() => {
    (async () => {
      const key = await SecureStoreShim.getItemAsync("ai_api_key");
      if (key) setApiKey(key);
    })();
  }, []);

  // ── Load conversations ──
  const loadConvos = useCallback(async () => {
    if (!user) return;
    try {
      const convs = await api.getConversations(user.user_id);
      setConversations(convs);
      // Only auto-select first conversation if we truly have none active
      // Use ref to avoid stale closure
      if (convs.length > 0 && !activeIdRef.current) {
        const cid = convs[0].conversation_id;
        setActiveId(cid);
        const msgs = await api.getMessages(cid, user.user_id);
        setMessages(msgs);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { loadConvos(); }, [loadConvos]);

  // ── Reload conversations when returning to Chat screen from other screens ──
  // This ensures PanelChat conversations created on other screens appear here
  useFocusEffect(
    useCallback(() => {
      loadConvos();
    }, [loadConvos])
  );

  // ── Daily Briefing ──
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const briefing = await getDailyBriefing(user, lang);
        if (briefing && briefing.text) {
          // Show briefing as a special system message at top
          setMessages((m) => {
            // Don't add if already has a briefing message
            if (m.some((msg) => msg.isBriefing)) return m;
            return [{ role: "assistant", content: briefing.text, message_id: "briefing_" + briefing.timestamp, isBriefing: true }, ...m];
          });
        }
      } catch (e) { console.warn("Briefing failed:", e.message); }
    })();
  }, [user, lang]);

  // ── Select conversation ──
  const selectConvo = async (id) => {
    setActiveId(id);
    setSidebarOpen(false);
    const msgs = await api.getMessages(id, user.user_id);
    setMessages(msgs);
  };

  // ── New conversation ──
  const newConvo = async () => {
    if (!user) return;
    const conv = await api.createConversation(user.user_id);
    setConversations([conv, ...conversations]);
    setActiveId(conv.conversation_id);
    setMessages([]);
    setSidebarOpen(false);
  };

  // ── Delete conversation ──
  const deleteConvo = async (id) => {
    await api.deleteConversation(id, user.user_id);
    setConversations((c) => c.filter((x) => x.conversation_id !== id));
    if (activeId === id) { setActiveId(null); setMessages([]); }
  };

  // ── Show toast ──
  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // ── Send message ──
  const send = async (overrideText) => {
    const text = (overrideText || input).trim();
    if (!text || streaming || !user) return;
    setInput("");

    try {
      let convId = activeId;
      if (!convId) {
        const conv = await api.createConversation(user.user_id, text.slice(0, 40));
        setConversations([conv, ...conversations]);
        convId = conv.conversation_id;
        setActiveId(convId);
      }

      // Add user message
      const userMsg = { role: "user", content: text, message_id: Date.now() + "u" };
      setMessages((m) => [...m, userMsg]);
      await api.saveMessage(convId, user.user_id, "user", text).catch(() => {});

      // Build system prompt (wrapped in try/catch — if data loading fails, fall back to basic prompt)
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      let system = "";
      try {
        const memoryCtx = await getMemoryContext(user.user_id).catch(() => "");
        system = await buildSystemPrompt(user, history, lang) + memoryCtx;
      } catch (e) {
        console.warn("buildSystemPrompt failed, using fallback:", e.message);
        system = `You are Everkin — a personal AI assistant for money, insurance, property, legal documents, taxes, and family planning. Be conversational, warm, and concise. Respond in ${lang || "English"}.`;
      }

      // Auto-extract memories from user message
      autoExtractMemories(user.user_id, text).catch(() => {});

      // Add assistant placeholder
      const assistantId = Date.now() + "a";
      setMessages((m) => [...m, { role: "assistant", content: "", message_id: assistantId }]);
      setStreamingAssistantId(assistantId);
      setStreaming(true);

      const fullText = await streamChat(system, text, "qwen3.8-27b", (delta) => {
        setMessages((m) => m.map((msg) =>
          msg.message_id === assistantId ? { ...msg, content: msg.content + delta } : msg
        ));
      });

      // Save assistant message
      await api.saveMessage(convId, user.user_id, "assistant", fullText, { model: "qwen3.8-27b" });

      let cleanText = fullText;

      // ── Detect [LANG_CHANGE:xx] ──
      const langMatch = fullText.match(/\[LANG_CHANGE:([a-z]{2})\]/i);
      if (langMatch) {
        changeLang(langMatch[1].toLowerCase());
        cleanText = cleanText.replace(/\[LANG_CHANGE:[a-z]{2}\]/gi, "").trim();
        showToast("App language changed");
      }

      // ── Detect [INV_ADD:...] ──
      const invAddMatches = [...fullText.matchAll(/\[INV_ADD:(\{[^}]+\})\]/g)];
      for (const m of invAddMatches) {
        try { await api.investmentChatAction(user.user_id, "add", { data: JSON.parse(m[1]) }); cleanText = cleanText.replace(m[0], ""); showToast("Investment added"); }
        catch (e) { console.warn(e); }
      }

      // ── Detect [INV_EDIT:...] ──
      const invEditMatches = [...fullText.matchAll(/\[INV_EDIT:(\{[^}]+\})\]/g)];
      for (const m of invEditMatches) {
        try { const p = JSON.parse(m[1]); await api.investmentChatAction(user.user_id, "edit", { name: p.name, updates: p.updates || p }); cleanText = cleanText.replace(m[0], ""); showToast("Investment updated"); }
        catch (e) { console.warn(e); }
      }

      // ── Detect [INV_DELETE:...] ──
      const invDeleteMatches = [...fullText.matchAll(/\[INV_DELETE:([^\]]+)\]/g)];
      for (const m of invDeleteMatches) {
        try { await api.investmentChatAction(user.user_id, "delete", { name: m[1].trim() }); cleanText = cleanText.replace(m[0], ""); showToast("Investment deleted"); }
        catch (e) { console.warn(e); }
      }

      // ── Detect [DOC_GEN:...] ──
      const docGenMatches = [...fullText.matchAll(/\[DOC_GEN:(\{[^}]*(?:\{[^}]*\}[^}]*)*\})\]/g)];
      for (const m of docGenMatches) {
        try {
          const parsed = JSON.parse(m[1]);
          const tplId = parsed.template_id;
          const tplData = parsed.data || {};
          // Generate structured document object for DocumentCard
          const docObj = generateDocumentObject(tplId, tplData);
          cleanText = cleanText.replace(m[0], "");
          // Add as a special "document" message after the AI message
          setMessages((m) => [...m, {
            role: "assistant",
            content: docObj.content,
            message_id: Date.now() + "doc",
            isDocument: true,
            docObj: docObj,
          }]);
          showToast(docObj.title + " ready");
        } catch (e) { console.warn("DOC_GEN failed:", e); }
      }

      // ── Detect [FORM_REC:form_id] ──
      const formRecMatches = [...fullText.matchAll(/\[FORM_REC:(\d+)\]/g)];
      for (const m of formRecMatches) {
        try {
          const form = getFormById(m[1]);
          if (form) {
            // Check which docs the user already has in vault
            const docs = await api.getDocuments(user.user_id);
            const userCats = new Set(docs.map((d) => (d.category || "").toLowerCase()));
            const userFiles = new Set(docs.map((d) => (d.original_filename || "").toLowerCase()));
            const requiredDocs = form.documents.split(",").map((d) => d.trim());
            const have = requiredDocs.filter((d) =>
              userCats.has(d.toLowerCase().split(" ")[0]) ||
              userFiles.has(d.toLowerCase())
            );
            const missing = requiredDocs.filter((d) =>
              !userCats.has(d.toLowerCase().split(" ")[0]) &&
              !userFiles.has(d.toLowerCase())
            );
            // Conversational format — not a table
            let formInfo = `\n\n\u2705 **${form.name}**\n`;
            formInfo += `Authority: ${form.authority} \u00b7 Fees: ${form.fees}\n`;
            if (have.length > 0) {
              formInfo += `You already have: ${have.join(", ")} \u2014 great!\n`;
            }
            if (missing.length > 0) {
              formInfo += `You still need: ${missing.join(", ")}. `;
              formInfo += `Want me to help you get any of these?\n`;
            } else {
              formInfo += `You have everything you need. You're ready to apply!\n`;
            }
            if (form.online_url) formInfo += `Apply online: ${form.online_url}`;
            cleanText += formInfo;
          }
          cleanText = cleanText.replace(m[0], "");
        } catch (e) { console.warn(e); }
      }

      // ── Detect [INS_ADD:...] ──
      const insAddMatches = [...fullText.matchAll(/\[INS_ADD:(\{[^}]+\})\]/g)];
      for (const m of insAddMatches) {
        try { await api.addInsurance(user.user_id, JSON.parse(m[1])); cleanText = cleanText.replace(m[0], ""); showToast("Insurance policy added"); }
        catch (e) { console.warn(e); }
      }

      // ── Detect [REM_ADD:...] ──
      const remAddMatches = [...fullText.matchAll(/\[REM_ADD:(\{[^}]+\})\]/g)];
      for (const m of remAddMatches) {
        try { await api.addReminder(user.user_id, JSON.parse(m[1])); cleanText = cleanText.replace(m[0], ""); showToast("Reminder created"); }
        catch (e) { console.warn(e); }
      }

      // ── Detect [GOAL_ADD:...] ──
      const goalAddMatches = [...fullText.matchAll(/\[GOAL_ADD:(\{[^}]+\})\]/g)];
      for (const m of goalAddMatches) {
        try {
          const { createGoal } = require("../services/goals");
          await createGoal(user.user_id, JSON.parse(m[1]));
          cleanText = cleanText.replace(m[0], "");
          showToast("Financial goal created");
        } catch (e) { console.warn(e); }
      }

      // ── Detect [EXP_ADD:...] ──
      const expAddMatches = [...fullText.matchAll(/\[EXP_ADD:(\{[^}]+\})\]/g)];
      for (const m of expAddMatches) {
        try {
          const { createExpense } = require("../services/expenses");
          await createExpense(user.user_id, JSON.parse(m[1]));
          cleanText = cleanText.replace(m[0], "");
          showToast("Expense logged");
        } catch (e) { console.warn(e); }
      }

      // ── Detect [MEMORY:category:key=value] ──
      const memoryCount = await processMemoryMarkers(user.user_id, fullText);
      if (memoryCount > 0) {
        // Clean memory markers from displayed text
        cleanText = cleanText.replace(/\[MEMORY:\w+:[^=]+=[^\]]+\]/g, "");
      }

      // ── Detect [SCHEME_REC:scheme_id] ──
      const schemeMatches = [...fullText.matchAll(/\[SCHEME_REC:(\w+)\]/g)];
      for (const m of schemeMatches) {
        try {
          const { SCHEMES } = require("../services/govSchemes");
          const scheme = SCHEMES.find(s => s.id === m[1]);
          if (scheme) {
            cleanText = cleanText.replace(m[0], "");
            showToast(`Scheme: ${scheme.name}`);
          }
        } catch (e) { console.warn(e); }
      }

      // ── Detect [LOAN_ADD:...] ──
      const loanAddMatches = [...fullText.matchAll(/\[LOAN_ADD:(\{[^}]+\})\]/g)];
      for (const m of loanAddMatches) {
        try {
          const { createLoan } = require("../services/loans");
          await createLoan(user.user_id, JSON.parse(m[1]));
          cleanText = cleanText.replace(m[0], "");
          showToast("Loan added");
        } catch (e) { console.warn(e); }
      }

      // ── Detect [BILL_ADD:...] ──
      const billAddMatches = [...fullText.matchAll(/\[BILL_ADD:(\{[^}]+\})\]/g)];
      for (const m of billAddMatches) {
        try {
          const { createBill } = require("../services/bills");
          await createBill(user.user_id, JSON.parse(m[1]));
          cleanText = cleanText.replace(m[0], "");
          showToast("Bill added");
        } catch (e) { console.warn(e); }
      }

      // ── Detect [EDU_ADD:...] ──
      const eduAddMatches = [...fullText.matchAll(/\[EDU_ADD:(\{[^}]+\})\]/g)];
      for (const m of eduAddMatches) {
        try {
          const { createEducationPlan } = require("../services/education");
          await createEducationPlan(user.user_id, JSON.parse(m[1]));
          cleanText = cleanText.replace(m[0], "");
          showToast("Education plan created");
        } catch (e) { console.warn(e); }
      }

      // ── Detect [RETIREMENT_ADD:...] ──
      const retireAddMatches = [...fullText.matchAll(/\[RETIREMENT_ADD:(\{[^}]+\})\]/g)];
      for (const m of retireAddMatches) {
        try {
          const { addCorpusSource } = require("../services/retirement");
          await addCorpusSource(user.user_id, JSON.parse(m[1]));
          cleanText = cleanText.replace(m[0], "");
          showToast("Retirement source added");
        } catch (e) { console.warn(e); }
      }

      // ── Detect [TAX_CALC:...] ──
      const taxCalcMatches = [...fullText.matchAll(/\[TAX_CALC:(\{[^}]+\})\]/g)];
      for (const m of taxCalcMatches) {
        try {
          const { calculateTax, compareRegimes } = require("../services/tax");
          const data = JSON.parse(m[1]);
          const comparison = compareRegimes(data.income || 0, data.deductions || {});
          cleanText = cleanText.replace(m[0], "");
          showToast(`Tax: Old ₹${comparison.old.totalTax} vs New ₹${comparison.new.totalTax}`);
        } catch (e) { console.warn(e); }
      }

      // ── Detect [PROP_ADD:...] ──
      const propAddMatches = [...fullText.matchAll(/\[PROP_ADD:(\{[^}]+\})\]/g)];
      for (const m of propAddMatches) {
        try {
          const { createProperty } = require("../services/property");
          await createProperty(user.user_id, JSON.parse(m[1]));
          cleanText = cleanText.replace(m[0], "");
          showToast("Property added");
        } catch (e) { console.warn(e); }
      }

      // ── Detect [SCENARIO:...] ──
      const scenarioMatches = [...fullText.matchAll(/\[SCENARIO:(\{[^}]+\})\]/g)];
      for (const m of scenarioMatches) {
        try {
          const { simulateScenario, formatScenarioResult } = require("../services/scenarioSimulator");
          const result = await simulateScenario(user.user_id, JSON.parse(m[1]));
          if (result) {
            const formatted = formatScenarioResult(result);
            cleanText = cleanText.replace(m[0], formatted);
            showToast("Scenario simulated");
          } else { cleanText = cleanText.replace(m[0], ""); }
        } catch (e) { console.warn(e); }
      }

      // ── Detect [GOAL_OPT:...] ──
      const goalOptMatches = [...fullText.matchAll(/\[GOAL_OPT:(\{[^}]+\})\]/g)];
      for (const m of goalOptMatches) {
        try {
          const { optimizeGoals, formatOptimizationForPrompt } = require("../services/goalOptimizer");
          const result = await optimizeGoals(user.user_id);
          if (result) {
            const lines = [
              `📊 **Goal Optimization Plan**\n`,
              `Monthly surplus: ₹${result.totalSurplus.toLocaleString("en-IN")}`,
              `Allocated: ₹${result.totalAllocated.toLocaleString("en-IN")}\n`,
              ...result.goals.map((g, i) => `${i + 1}. ${g.name}: ₹${g.allocated.toLocaleString("en-IN")}/mo — ${g.status === "fully_funded" ? "✓ Funded" : g.status === "partially_funded" ? "Partial" : "Unfunded"} (${g.pct}%)`),
              `\n💡 ${result.recommendation}`,
            ].join("\n");
            cleanText = cleanText.replace(m[0], lines);
            showToast("Goal optimization ready");
          } else { cleanText = cleanText.replace(m[0], ""); }
        } catch (e) { console.warn(e); }
      }

      // Update the assistant message with cleaned text
      setMessages((m) => m.map((msg) =>
        msg.message_id === assistantId ? { ...msg, content: cleanText } : msg
      ));

      loadConvos();
    } catch (e) {
      setMessages((m) => m.map((msg) =>
        msg.message_id === assistantId ? { ...msg, content: `Sorry — I couldn't process that. ${e.message}` } : msg
      ));
    } finally {
      setStreaming(false);
      setStreamingAssistantId(null);
    }
  };

  // ── Demo Viz: inject pre-built visualization markers for instant testing ──
  const showDemoViz = () => {
    const demoContent = [
      'Here is your portfolio overview:',
      '',
      '[CHART:{"type":"bar","title":"Portfolio Allocation","data":[{"label":"HDFC Mid-Cap","value":3800000,"color":"#3b82f6"},{"label":"Nifty ETF","value":2450000,"color":"#10b981"},{"label":"Reliance","value":1850000,"color":"#6366f1"},{"label":"Gold SGB","value":1280000,"color":"#f59e0b"},{"label":"SBI FD","value":530000,"color":"#94a3b8"},{"label":"Bitcoin","value":72000,"color":"#ef4444"}]}]',
      '',
      '[STAT:{"label":"Total Portfolio","value":"Rs. 99.82L","icon":"wallet","color":"#10b981"}]',
      '',
      '[STAT:{"label":"Total Invested","value":"Rs. 15.8L","icon":"trending-down","color":"#f59e0b"}]',
      '',
      '[STAT:{"label":"Total Gain","value":"Rs. 84L","icon":"trending-up","color":"#10b981"}]',
      '',
      '[TABLE:{"title":"Performance Breakdown","headers":["Holding","Invested","Current","Return"],"rows":[["HDFC Mid-Cap","Rs. 2L","Rs. 38L","+1800%"],["Nifty ETF","Rs. 2L","Rs. 24.5L","+1125%"],["Gold SGB","Rs. 1L","Rs. 12.8L","+1180%"],["Reliance","Rs. 5L","Rs. 18.5L","+270%"],["SBI FD","Rs. 5.3L","Rs. 5.3L","0%"],["Bitcoin","Rs. 0.5L","Rs. 0.72L","+44%"]]}]',
      '',
      '[COMPARE:{"title":"Equity vs Fixed Income","leftLabel":"Equity","leftValue":"Rs. 81L","rightLabel":"Fixed Income","rightValue":"Rs. 5.3L","better":"left"}]',
      '',
      '[PROGRESS:{"label":"Tax Saving Progress","percent":75,"color":"#10b981"}]',
      '',
      '[TIMELINE:{"events":[{"date":"Jun 15","title":"Advance Tax Q1","desc":"Pay 15% of estimated tax"},{"date":"Sep 15","title":"Advance Tax Q2","desc":"Pay 45% of estimated tax"},{"date":"Dec 15","title":"Advance Tax Q3","desc":"Pay 75% of estimated tax"},{"date":"Mar 15","title":"Advance Tax Q4","desc":"Pay 100% of estimated tax"}]}]',
      '',
      '[CALLOUT:{"type":"warning","title":"Rebalancing Suggestion","text":"Your portfolio is 85% equity. Consider shifting some gains to safer instruments if you are near a goal date."}]',
      '',
      '[CHART:{"type":"pie","title":"Asset Mix","data":[{"label":"Equity","value":81,"color":"#3b82f6"},{"label":"FD","value":5.3,"color":"#f59e0b"},{"label":"Gold","value":12.8,"color":"#10b981"},{"label":"Crypto","value":0.72,"color":"#ef4444"}]}]',
      '',
      'Would you like me to model a rebalancing plan?',
    ].join('\n');
    setMessages((m) => [
      { role: "user", content: "Show demo visualizations", message_id: Date.now() + "u" },
      { role: "assistant", content: demoContent, message_id: Date.now() + "a" },
    ]);
  };

  // ── Render message ──
  const renderMessage = ({ item }) => {
    if (item.isBriefing) {
      return (
        <View style={styles.briefingCard}>
          <View style={styles.briefingHeader}>
            <Ionicons name="sunny" size={16} color={theme.accent} />
            <Text style={styles.briefingLabel}>Today's Briefing</Text>
          </View>
          <Text style={styles.briefingText}>{item.content}</Text>
          <TouchableOpacity style={styles.speakBtn} onPress={() => speak(item.content, lang)}>
            <Ionicons name="volume-medium" size={14} color={theme.muted} />
            <Text style={styles.speakBtnText}>Listen</Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (item.isDocument && item.docObj) {
      return (
        <View style={styles.msgDocWrap}>
          <DocumentCard doc={item.docObj} user={user} onModify={(doc) => {
            // Pre-fill the input with a modification request
            setInput(`Please modify the ${doc.title}: `);
            flatRef.current?.scrollToOffset({ offset: 0, animated: true });
          }} />
        </View>
      );
    }
    return (
      <View style={[styles.msg, item.role === "user" ? styles.msgUser : styles.msgAssistant]}>
        {item.role === "assistant" && (
          <View style={styles.msgAvatar}><Ionicons name="chatbubble-ellipses" size={14} color={theme.primary} /></View>
        )}
        <View style={{ flex: 1 }}>
          {item.role === "assistant" ? (
            <ChatVizMessage content={item.content} textStyle={styles.msgAssistantText} isStreaming={streaming && item.message_id === streamingAssistantId} />
          ) : (
            <Text style={styles.msgUserText}>{item.content}</Text>
          )}
          {item.role === "assistant" && item.content && (
            <TouchableOpacity style={styles.speakBtn} onPress={() => speak(item.content, lang)}>
              <Ionicons name="volume-medium" size={14} color={theme.muted} />
              <Text style={styles.speakBtnText}>Listen</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={theme.primary} /></View>;

  return (
    <View style={styles.container}>
      {/* ── Sidebar (drawer) ── */}
      {sidebarOpen && (
        <View style={styles.sidebarOverlay}>
          <View style={styles.sidebar}>
            {/* Brand + New Chat */}
            <View style={styles.sidebarHeader}>
              <View style={styles.brandRow}>
                <Ionicons name="chatbubble-ellipses" size={22} color={theme.primary} />
                <Text style={styles.brandText}>EVERKIN</Text>
                <Text style={styles.brandSub}>{t("chat.title")}</Text>
              </View>
              <TouchableOpacity style={styles.newChatBtn} onPress={newConvo}>
                <Ionicons name="add" size={16} color={theme.text} />
                <Text style={styles.newChatText}>{t("chat.new_conversation")}</Text>
              </TouchableOpacity>
            </View>

            {/* Conversations list */}
            <ScrollView style={styles.convoList} contentContainerStyle={{ paddingBottom: 8 }}>
              {conversations.length === 0 && <Text style={styles.emptyConvo}>No conversations yet.</Text>}
              {conversations.map((c) => (
                <TouchableOpacity
                  key={c.conversation_id}
                  style={[styles.convoItem, activeId === c.conversation_id && styles.convoItemActive]}
                  onPress={() => selectConvo(c.conversation_id)}
                >
                  <Text style={styles.convoTitle} numberOfLines={1}>{c.title}</Text>
                  <TouchableOpacity onPress={() => deleteConvo(c.conversation_id)}>
                    <Ionicons name="trash-outline" size={14} color={theme.muted} />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Tools section */}
            <View style={styles.toolsSection}>
              <TouchableOpacity style={styles.toolsHeader} onPress={() => setToolsOpen(!toolsOpen)}>
                <Ionicons name="grid-outline" size={16} color={theme.muted} />
                <Text style={styles.toolsHeaderText}>{t("chat.tools") || "Tools"}</Text>
                <Ionicons name={toolsOpen ? "chevron-up" : "chevron-down"} size={14} color={theme.muted} />
              </TouchableOpacity>
              {toolsOpen && (
                <ScrollView style={{ maxHeight: 200 }}>
                  {[
                    { label: t("nav.dashboard"), screen: "Home", icon: "grid" },
                    { label: t("nav.investments"), screen: "Money", icon: "trending-up" },
                    { label: t("nav.insurance"), screen: "Insurance", icon: "shield-checkmark" },
                    { label: t("nav.loan_prep"), screen: "Forms", icon: "document-text" },
                    { label: t("nav.vault"), screen: "Vault", icon: "folder" },
                    { label: t("nav.reminders"), screen: "Reminders", icon: "notifications" },
                    { label: t("nav.profile"), screen: "Profile", icon: "person" },
                    { label: t("nav.insights"), screen: "Insights", icon: "stats-chart" },
                    { label: t("nav.legacy"), screen: "Legacy", icon: "heart" },
                    { label: t("nav.gmail"), screen: "Gmail", icon: "mail" },
                    { label: t("nav.bundler"), screen: "Bundler", icon: "cube" },
                    { label: t("nav.form_filler"), screen: "FormFiller", icon: "create" },
                  ].map((item) => (
                    <TouchableOpacity
                      key={item.screen}
                      style={styles.toolItem}
                      onPress={() => { setSidebarOpen(false); navigation.navigate(item.screen); }}
                    >
                      <Ionicons name={item.icon} size={16} color={theme.muted} />
                      <Text style={styles.toolLabel}>{item.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>

            {/* Language switcher + profile */}
            <View style={styles.sidebarFooter}>
              <View style={{ marginBottom: 8 }}><LanguageSwitcher /></View>
              <View style={styles.profileRow}>
                <View style={styles.profileAvatar}>
                  <Text style={styles.profileAvatarText}>{(user?.name || "U").slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={styles.profileInfo}>
                  <Text style={styles.profileName} numberOfLines={1}>{user?.name || "User"}</Text>
                  <Text style={styles.profileEmail} numberOfLines={1}>{user?.email}</Text>
                </View>
                <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
                  <Ionicons name="log-out-outline" size={16} color={theme.destructive} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
          <TouchableOpacity style={styles.sidebarBackdrop} onPress={() => setSidebarOpen(false)} />
        </View>
      )}

      {/* ── Main chat area ── */}
      <View style={styles.main}>
        {/* Header bar */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setSidebarOpen(true)} style={styles.menuBtn}>
            <Ionicons name="menu" size={22} color={theme.text} />
          </TouchableOpacity>
          {/* Conversation switcher dropdown */}
          <TouchableOpacity style={styles.convSwitcher} onPress={() => setConvDropdown(!convDropdown)}>
            <Ionicons name="chatbubbles" size={16} color={theme.primary} />
            <View style={styles.convSwitcherText}>
              <Text style={styles.headerTitleText} numberOfLines={1}>
                {activeConvo?.title || "AI Advisor"}
              </Text>
              <Text style={styles.headerSub} numberOfLines={1}>
                {conversations.length > 0 ? `${conversations.length} conversation${conversations.length !== 1 ? "s" : ""}` : "Financial · Insurance · Legacy"}
              </Text>
            </View>
            <Ionicons name={convDropdown ? "chevron-up" : "chevron-down"} size={14} color={theme.muted} />
          </TouchableOpacity>
          {/* New chat button */}
          <TouchableOpacity onPress={newConvo} style={styles.newChatHeaderBtn}>
            <Ionicons name="add-circle" size={24} color={theme.primary} />
          </TouchableOpacity>
        </View>

        {/* Conversation dropdown panel */}
        {convDropdown && (
          <TouchableOpacity activeOpacity={1} style={styles.convDropdownBackdrop} onPress={() => setConvDropdown(false)}>
          <View style={styles.convDropdown} onStartShouldSetResponder={() => true}>
            <TouchableOpacity style={styles.convDropdownNew} onPress={() => { newConvo(); setConvDropdown(false); }}>
              <Ionicons name="add" size={18} color={theme.primary} />
              <Text style={styles.convDropdownNewText}>New conversation</Text>
            </TouchableOpacity>
            <ScrollView style={styles.convDropdownList} persistentScrollbar>
              {conversations.length === 0 && (
                <Text style={styles.convDropdownEmpty}>No conversations yet. Start chatting!</Text>
              )}
              {conversations.map((c) => (
                <TouchableOpacity
                  key={c.conversation_id}
                  style={[styles.convDropdownItem, activeId === c.conversation_id && styles.convDropdownItemActive]}
                  onPress={() => { selectConvo(c.conversation_id); setConvDropdown(false); }}
                >
                  <Ionicons name="chatbubble-outline" size={14} color={activeId === c.conversation_id ? theme.primary : theme.muted} />
                  <Text style={[styles.convDropdownItemText, activeId === c.conversation_id && styles.convDropdownItemTextActive]} numberOfLines={1}>
                    {c.title}
                  </Text>
                  <TouchableOpacity onPress={() => deleteConvo(c.conversation_id)} style={styles.convDropdownDelete}>
                    <Ionicons name="trash-outline" size={12} color={theme.muted} />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
          </TouchableOpacity>
        )}

        {/* Messages */}
        {messages.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}><Ionicons name="chatbubble-ellipses" size={32} color={theme.primary} /></View>
            <Text style={styles.emptyTitle}>{t("chat.how_can_help")}</Text>
            <Text style={styles.emptyDesc}>Ask a financial question, request a form, or tell me about your goals.</Text>
            <View style={styles.examplesGrid}>
              {EXAMPLES.map((s) => (
                <TouchableOpacity key={s} style={styles.exampleCard} onPress={() => send(s)}>
                  <Text style={styles.exampleText}>{s}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={[styles.exampleCard, { borderColor: theme.primary, borderWidth: 1, flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center" }]} onPress={showDemoViz}>
                <Ionicons name="sparkles" size={14} color={theme.primary} />
                <Text style={[styles.exampleText, { color: theme.primary, fontWeight: "600" }]}>Demo Visualizations</Text>
              </TouchableOpacity>
            </View>
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

        {/* Toast */}
        {toast && (
          <View style={styles.toast}>
            <Ionicons name="checkmark-circle" size={16} color={theme.accent} />
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        )}

        {/* Input bar */}
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={0}>
          <View style={styles.inputBar}>
            <TouchableOpacity style={styles.attachBtn} onPress={async () => {
              try {
                const result = await pickDocument();
                if (result.canceled) return;
                const asset = result.assets[0];
                setInput(prev => prev + (prev ? "\n" : "") + `[Attached: ${asset.name}]`);
              } catch (e) { console.warn(e); }
            }}>
              <Ionicons name="attach" size={20} color={theme.muted} />
            </TouchableOpacity>
            {isVoiceSupported() && (
              <TouchableOpacity
                style={[styles.attachBtn, getIsListening() && styles.voiceBtnActive]}
                onPress={() => {
                  if (getIsListening()) {
                    stopListening();
                  } else {
                    startListening(
                      (text, isFinal) => {
                        if (text) setInput(text);
                        if (isFinal) setInput(prev => prev || text);
                      },
                      (err) => console.warn("Voice error:", err),
                      lang
                    );
                  }
                }}
              >
                <Ionicons name={getIsListening() ? "radio-button-on" : "mic"} size={20} color={getIsListening() ? theme.destructive : theme.muted} />
              </TouchableOpacity>
            )}
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
            <TouchableOpacity style={styles.sendBtn} onPress={() => send()} disabled={streaming || !input.trim()}>
              {streaming ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={18} color="#fff" />}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  center: { flex: 1, backgroundColor: theme.background, justifyContent: "center", alignItems: "center" },
  // ── Sidebar ──
  sidebarOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, flexDirection: "row", zIndex: 100 },
  sidebar: { width: 280, backgroundColor: theme.card, borderRightWidth: 1, borderRightColor: theme.border },
  sidebarBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  sidebarHeader: { padding: 16, borderBottomWidth: 1, borderBottomColor: theme.border },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  brandText: { fontSize: 16, fontWeight: "900", color: theme.text, letterSpacing: -0.5 },
  brandSub: { fontSize: 9, color: theme.muted, letterSpacing: 2, textTransform: "uppercase", marginLeft: "auto" },
  newChatBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 10, borderRadius: 16, backgroundColor: theme.input, borderWidth: 1, borderColor: theme.border },
  newChatText: { fontSize: 13, color: theme.text, fontWeight: "600" },
  convoList: { flex: 1, padding: 8 },
  emptyConvo: { fontSize: 12, color: theme.muted, paddingHorizontal: 12, paddingVertical: 8 },
  convoItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, marginVertical: 2 },
  convoItemActive: { backgroundColor: theme.input },
  convoTitle: { flex: 1, fontSize: 13, color: theme.textSecondary, marginRight: 8 },
  toolsSection: { borderTopWidth: 1, borderTopColor: theme.border, padding: 8 },
  toolsHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 8, paddingVertical: 8 },
  toolsHeaderText: { flex: 1, fontSize: 13, color: theme.muted, fontWeight: "600" },
  toolItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12 },
  toolLabel: { fontSize: 13, color: theme.textSecondary },
  sidebarFooter: { borderTopWidth: 1, borderTopColor: theme.border, padding: 12 },
  profileRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  profileAvatar: { width: 32, height: 32, borderRadius: 10, backgroundColor: theme.primary + "20", justifyContent: "center", alignItems: "center" },
  profileAvatarText: { fontSize: 13, fontWeight: "700", color: theme.primary },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 12, fontWeight: "600", color: theme.text },
  profileEmail: { fontSize: 10, color: theme.muted },
  logoutBtn: { padding: 6 },
  // ── Main ──
  main: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingTop: 50, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.border },
  menuBtn: { padding: 4 },
  convSwitcher: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 12 },
  convSwitcherText: { flex: 1 },
  headerTitleText: { fontSize: 15, fontWeight: "700", color: theme.text },
  headerSub: { fontSize: 10, color: theme.muted },
  newChatHeaderBtn: { padding: 4 },
  // ── Conversation dropdown ──
  convDropdownBackdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 49 },
  convDropdown: { position: "absolute", top: 100, left: 12, right: 12, backgroundColor: theme.card, borderRadius: 16, borderWidth: 1, borderColor: theme.border, maxHeight: 400, elevation: 8, shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, zIndex: 50 },
  convDropdownNew: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.border },
  convDropdownNewText: { fontSize: 14, fontWeight: "600", color: theme.primary },
  convDropdownList: { maxHeight: 340 },
  convDropdownEmpty: { fontSize: 13, color: theme.muted, paddingHorizontal: 16, paddingVertical: 16, textAlign: "center" },
  convDropdownItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: theme.border },
  convDropdownItemActive: { backgroundColor: theme.primary + "10" },
  convDropdownItemText: { flex: 1, fontSize: 14, color: theme.textSecondary },
  convDropdownItemTextActive: { color: theme.primary, fontWeight: "600" },
  convDropdownDelete: { padding: 6 },
  // ── Empty state ──
  emptyState: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  emptyIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: theme.primary + "15", justifyContent: "center", alignItems: "center", marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: theme.text, marginBottom: 8 },
  emptyDesc: { fontSize: 14, color: theme.muted, textAlign: "center", marginBottom: 24, maxWidth: 280 },
  examplesGrid: { width: "100%", gap: 10 },
  exampleCard: { backgroundColor: theme.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: theme.border },
  exampleText: { fontSize: 13, color: theme.textSecondary },
  // ── Messages ──
  msg: { maxWidth: "85%", borderRadius: 16, padding: 12, marginBottom: 10 },
  msgUser: { alignSelf: "flex-end", backgroundColor: theme.primary },
  msgUserText: { color: "#fff", fontSize: 14, lineHeight: 20 },
  msgAssistant: { alignSelf: "flex-start", backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, flexDirection: "row", gap: 8 },
  msgAvatar: { width: 24, height: 24, borderRadius: 8, backgroundColor: theme.primary + "15", justifyContent: "center", alignItems: "center", alignSelf: "flex-start" },
  msgAssistantText: { flex: 1, color: theme.text, fontSize: 14, lineHeight: 20 },
  msgDocWrap: { alignSelf: "stretch", marginVertical: 4 },
  speakBtn: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8, alignSelf: "flex-start" },
  speakBtnText: { fontSize: 11, color: theme.muted, fontWeight: "500" },
  // Briefing
  briefingCard: { marginHorizontal: 12, marginVertical: 8, backgroundColor: theme.accent + "10", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: theme.accent + "40" },
  briefingHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  briefingLabel: { fontSize: 12, fontWeight: "700", color: theme.accent, textTransform: "uppercase", letterSpacing: 1 },
  briefingText: { fontSize: 14, color: theme.text, lineHeight: 20 },
  // ── Toast ──
  toast: { position: "absolute", top: 60, left: 0, right: 0, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 8, marginHorizontal: 40, backgroundColor: theme.card, borderRadius: 12, borderWidth: 1, borderColor: theme.border, elevation: 4, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  toastText: { fontSize: 13, color: theme.accent, fontWeight: "500" },
  // ── Input ──
  inputBar: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 12, paddingVertical: 8, gap: 8, borderTopWidth: 1, borderTopColor: theme.border, backgroundColor: theme.card },
  attachBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: theme.border },
  voiceBtnActive: { borderColor: theme.destructive, backgroundColor: theme.destructive + "10" },
  input: { flex: 1, backgroundColor: theme.input, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: theme.text, maxHeight: 100, borderWidth: 1, borderColor: theme.border },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.primary, justifyContent: "center", alignItems: "center" },
});