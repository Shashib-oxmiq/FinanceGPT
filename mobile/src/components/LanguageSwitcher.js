// ── LanguageSwitcher Component ───────────────────────────────────────────────
import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Modal as RNModal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLanguage, LANGUAGES } from "../contexts/LanguageContext";
import { theme } from "../theme";

export default function LanguageSwitcher({ compact = false }) {
  const { lang, changeLang } = useLanguage();
  const [open, setOpen] = useState(false);
  const current = LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0];

  const renderLang = ({ item }) => (
    <TouchableOpacity
      style={[styles.langRow, lang === item.code && styles.langRowActive]}
      onPress={() => { changeLang(item.code); setOpen(false); }}
    >
      <Text style={styles.flag}>{item.flag}</Text>
      <View style={styles.langInfo}>
        <Text style={[styles.langName, lang === item.code && styles.langNameActive]}>{item.native}</Text>
        <Text style={styles.langEng}>{item.name}</Text>
      </View>
      {lang === item.code && <Ionicons name="checkmark" size={18} color={theme.primary} />}
    </TouchableOpacity>
  );

  return (
    <View>
      <TouchableOpacity style={[styles.trigger, compact && styles.triggerCompact]} onPress={() => setOpen(true)}>
        <Text style={styles.triggerFlag}>{current.flag}</Text>
        {!compact && <Text style={styles.triggerText}>{current.native}</Text>}
        <Ionicons name="chevron-down" size={14} color={theme.muted} />
      </TouchableOpacity>
      <RNModal visible={open} animationType="slide" transparent={true} onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Select Language</Text>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <Ionicons name="close" size={22} color={theme.muted} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={LANGUAGES}
              keyExtractor={(x) => x.code}
              renderItem={renderLang}
              contentContainerStyle={{ paddingBottom: 20 }}
              ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: theme.border, marginHorizontal: 16 }} />}
            />
          </View>
        </View>
      </RNModal>
    </View>
  );
}

const styles = StyleSheet.create({
  trigger: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.card, borderRadius: 20, borderWidth: 1, borderColor: theme.border },
  triggerCompact: { paddingHorizontal: 10, paddingVertical: 8 },
  triggerFlag: { fontSize: 18 },
  triggerText: { fontSize: 13, color: theme.text, fontWeight: "600" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  sheet: { backgroundColor: theme.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "70%" },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1, borderBottomColor: theme.border },
  sheetTitle: { fontSize: 18, fontWeight: "700", color: theme.text },
  langRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  langRowActive: { backgroundColor: theme.primary + "10" },
  flag: { fontSize: 24 },
  langInfo: { flex: 1 },
  langName: { fontSize: 15, color: theme.text, fontWeight: "500" },
  langNameActive: { color: theme.primary, fontWeight: "700" },
  langEng: { fontSize: 12, color: theme.muted, marginTop: 2 },
});