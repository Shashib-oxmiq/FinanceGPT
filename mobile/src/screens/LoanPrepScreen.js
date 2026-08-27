// ── LoanPrepScreen — Chat-Driven Document Preparation ───────────────────────
// Instead of showing all 100 forms, shows 2-3 examples + lets AI find the right form
// User asks in chat → AI recommends specific form → shows what's in vault + what's missing

import React, { useState, useCallback, useEffect } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, ScrollView, ActivityIndicator, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { searchForms, FORM_CATEGORIES } from "../services/formsData";
import { downloadFormChecklist } from "../services/docGen";
import SmartAddBar from "../components/SmartAddBar";
import PanelChat from "../components/PanelChat";
import { theme } from "../theme";

const EXAMPLES = [
  { icon: "calculator", text: "I need to file my income tax return", formCat: "Tax" },
  { icon: "home", text: "Help me apply for a home loan", formCat: "Financial" },
  { icon: "shield-checkmark", text: "I want to register my vehicle", formCat: "Property" },
];

export default function LoanPrepScreen() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [showSearch, setShowSearch] = useState(false);

  const filtered = searchForms(search, category);

  // If user typed in search, show the form list
  if (showSearch || search) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => { setShowSearch(false); setSearch(""); }} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={18} color={theme.primary} />
            <Text style={styles.backText}>{t("common.back")}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{t("page.loans.title")}</Text>
          <Text style={styles.subtitle}>{t("page.loans.subtitle")}</Text>
        </View>
        <TextInput
          style={styles.searchBar}
          placeholder="Search forms…"
          placeholderTextColor={theme.muted}
          value={search}
          onChangeText={setSearch}
          autoFocus
        />
        <View style={styles.chips}>
          {FORM_CATEGORIES.map((c) => (
            <TouchableOpacity key={c} style={[styles.chip, category === c && styles.chipActive]} onPress={() => setCategory(c)}>
              <Text style={[styles.chipText, category === c && styles.chipTextActive]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <FlatList
          data={filtered}
          keyExtractor={(x) => x.id}
          contentContainerStyle={{ paddingBottom: 20 }}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.formCard} onPress={() => downloadFormChecklist(item).then(() => Alert.alert("Downloaded", "Checklist saved"))} activeOpacity={0.7}>
              <View style={styles.formIcon}><Ionicons name="document-text" size={18} color={theme.primary} /></View>
              <View style={styles.formInfo}>
                <Text style={styles.formName}>{item.name}</Text>
                <Text style={styles.formMeta}>{item.authority} · {item.processing_time}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.muted} />
            </TouchableOpacity>
          )}
          ListFooterComponent={<PanelChat context="LoanPrep" />}
        />
      </View>
    );
  }

  // Default view: examples + chat
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t("page.loans.title")}</Text>
        <Text style={styles.subtitle}>{t("page.loans.subtitle")}</Text>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
        {/* Example prompts */}
        <View style={styles.examplesSection}>
          <Text style={styles.sectionTitle}>What do you need help with?</Text>
          <Text style={styles.sectionDesc}>Tell me what you're trying to do. I'll find the right form and check your vault for what you already have.</Text>
          {EXAMPLES.map((ex, i) => (
            <TouchableOpacity key={i} style={styles.exampleCard} onPress={() => setShowSearch(true)}>
              <View style={styles.exampleIcon}><Ionicons name={ex.icon} size={22} color={theme.primary} /></View>
              <View style={styles.exampleInfo}>
                <Text style={styles.exampleText}>{ex.text}</Text>
                <Text style={styles.exampleCat}>{ex.formCat} forms available</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.muted} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Browse all forms link */}
        <TouchableOpacity style={styles.browseBtn} onPress={() => setShowSearch(true)}>
          <Ionicons name="search" size={18} color={theme.primary} />
          <Text style={styles.browseText}>Browse all 100 forms</Text>
        </TouchableOpacity>

        {/* Smart Add */}
        <SmartAddBar context="LoanPrep" />

        {/* AI Chat */}
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <PanelChat context="LoanPrep" title="Ask AI to find a form for you" />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: { padding: 20, paddingTop: 60 },
  title: { fontSize: 24, fontWeight: "800", color: theme.text },
  subtitle: { fontSize: 14, color: theme.muted, marginTop: 4 },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 8 },
  backText: { color: theme.primary, fontSize: 14, fontWeight: "600" },
  searchBar: { marginHorizontal: 16, marginBottom: 12, backgroundColor: theme.input, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text, borderWidth: 1, borderColor: theme.border },
  chips: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, gap: 8, marginBottom: 12 },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border },
  chipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  chipText: { fontSize: 12, color: theme.textSecondary },
  chipTextActive: { color: "#fff" },
  formCard: { flexDirection: "row", alignItems: "center", backgroundColor: theme.card, borderRadius: 12, padding: 14, marginHorizontal: 16, marginBottom: 8, gap: 12, borderWidth: 1, borderColor: theme.border },
  formIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: theme.primary + "20", justifyContent: "center", alignItems: "center" },
  formInfo: { flex: 1 },
  formName: { fontSize: 15, fontWeight: "600", color: theme.text },
  formMeta: { fontSize: 12, color: theme.muted, marginTop: 2 },
  // ── Examples ──
  examplesSection: { padding: 20 },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: theme.text, marginBottom: 8 },
  sectionDesc: { fontSize: 14, color: theme.muted, marginBottom: 20, lineHeight: 20 },
  exampleCard: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: theme.card, borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: theme.border },
  exampleIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: theme.primary + "15", justifyContent: "center", alignItems: "center" },
  exampleInfo: { flex: 1 },
  exampleText: { fontSize: 15, color: theme.text, fontWeight: "500" },
  exampleCat: { fontSize: 12, color: theme.muted, marginTop: 2 },
  browseBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginHorizontal: 20, marginTop: 8, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: theme.primary + "40" },
  browseText: { color: theme.primary, fontSize: 15, fontWeight: "600" },
});