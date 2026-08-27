// ── LoanPrepScreen — Pure Conversational Document Preparation ─────────────────
// NO form catalog. NO search bar. NO category filters. NO browse-all link.
// The user tells the AI what they need in their own words. The AI figures out
// which form, checks their vault, and guides them — all in conversation.

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLanguage } from "../contexts/LanguageContext";
import PanelChat from "../components/PanelChat";
import { theme } from "../theme";

const LIFE_SITUATIONS = [
  { icon: "calculator", text: "I need to file my income tax return" },
  { icon: "home", text: "I'm applying for a home loan" },
  { icon: "shield-checkmark", text: "I want to register my vehicle" },
];

export default function LoanPrepScreen({ navigation }) {
  const { t } = useLanguage();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{t("page.loans.title")}</Text>
          <Text style={styles.subtitle}>Tell me what you need — I'll find the right form</Text>
        </View>
      </View>

      {/* Life situation prompts — NOT a form catalog */}
      <View style={styles.introSection}>
        <Text style={styles.introTitle}>How can I help you today?</Text>
        <Text style={styles.introSub}>Just describe your situation in your own words. I'll figure out which form you need, check your vault for required documents, and guide you step by step.</Text>
      </View>

      {LIFE_SITUATIONS.map((ex, i) => (
        <TouchableOpacity key={i} style={styles.suggestionCard} activeOpacity={0.7}>
          <View style={styles.suggestionIcon}>
            <Ionicons name={ex.icon} size={22} color={theme.primary} />
          </View>
          <Text style={styles.suggestionText}>{ex.text}</Text>
          <Ionicons name="chevron-forward" size={16} color={theme.muted} />
        </TouchableOpacity>
      ))}

      {/* PanelChat — the primary interaction */}
      <PanelChat context="LoanPrep" title="Ask me about any form or document" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: { flexDirection: "row", alignItems: "center", gap: 12, padding: 20, paddingTop: 60 },
  backBtn: { padding: 4 },
  title: { fontSize: 24, fontWeight: "800", color: theme.text },
  subtitle: { fontSize: 14, color: theme.muted, marginTop: 4 },
  introSection: { paddingHorizontal: 20, paddingVertical: 16 },
  introTitle: { fontSize: 18, fontWeight: "700", color: theme.text, marginBottom: 6 },
  introSub: { fontSize: 14, color: theme.muted, lineHeight: 20 },
  suggestionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: theme.card,
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.border,
  },
  suggestionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: theme.primary + "20",
    justifyContent: "center",
    alignItems: "center",
  },
  suggestionText: { flex: 1, fontSize: 14, color: theme.text, fontWeight: "500" },
});