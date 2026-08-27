import React, { useState, useMemo } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LEGAL_RIGHTS, getLegalCategories, searchRights } from "../services/legalRights";
import { theme } from "../theme";
import PanelChat from "../components/PanelChat";

export default function LegalRightsScreen({ navigation }) {
  const [selectedCat, setSelectedCat] = useState(null);
  const [selectedRight, setSelectedRight] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  const categories = getLegalCategories();

  const filteredRights = useMemo(() => {
    if (searchQuery) return searchRights(searchQuery);
    if (selectedCat) return LEGAL_RIGHTS.filter(r => r.category === selectedCat);
    return LEGAL_RIGHTS;
  }, [selectedCat, searchQuery]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Legal Rights</Text>
      </View>

      <ScrollView>
        <View style={styles.introCard}>
          <Ionicons name="scale" size={32} color={theme.primary} />
          <Text style={styles.introTitle}>Know Your Rights — Don't Get Cheated</Text>
          <Text style={styles.introText}>
            Most Indians get exploited because they don't know their legal rights. This is your empowerent guide —
            consumer, tenant, employee, women, and property rights explained in simple language.
          </Text>
        </View>

        <TextInput style={styles.searchInput} placeholder="Search your rights..." value={searchQuery} onChangeText={setSearchQuery} />

        {/* Category chips */}
        {!searchQuery && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
            <TouchableOpacity style={[styles.catChip, !selectedCat && styles.catChipActive]} onPress={() => setSelectedCat(null)}>
              <Text style={[styles.catChipText, !selectedCat && styles.catChipTextActive]}>All ({LEGAL_RIGHTS.length})</Text>
            </TouchableOpacity>
            {categories.map((cat) => {
              const count = LEGAL_RIGHTS.filter(r => r.category === cat).length;
              return (
                <TouchableOpacity key={cat} style={[styles.catChip, selectedCat === cat && styles.catChipActive]} onPress={() => setSelectedCat(cat)}>
                  <Text style={[styles.catChipText, selectedCat === cat && styles.catChipTextActive]}>{cat} ({count})</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Rights list */}
        {filteredRights.map((right) => (
          <TouchableOpacity key={right.id} style={styles.rightCard} onPress={() => setSelectedRight(right)}>
            <View style={styles.rightHeader}>
              <View style={styles.rightIcon}>
                <Ionicons name={right.icon} size={20} color={theme.primary} />
              </View>
              <View style={styles.rightInfo}>
                <Text style={styles.rightTitle}>{right.title}</Text>
                <Text style={styles.rightCategory}>{right.category}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.muted} />
            </View>
            <Text style={styles.rightSummary} numberOfLines={2}>{right.summary}</Text>
          </TouchableOpacity>
        ))}

        <View style={{ paddingBottom: 16 }}>
          <PanelChat context="LegalRights" title="Ask AI: 'What are my rights as a tenant?'" />
        </View>
      </ScrollView>

      {/* Detail modal */}
      <Modal visible={!!selectedRight} animationType="slide" transparent onRequestClose={() => setSelectedRight(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedRight && (
              <ScrollView>
                <View style={styles.modalHeader}>
                  <View style={styles.modalIconWrap}>
                    <Ionicons name={selectedRight.icon} size={24} color={theme.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalTitle}>{selectedRight.title}</Text>
                    <Text style={styles.modalCat}>{selectedRight.category}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedRight(null)}>
                    <Ionicons name="close" size={24} color={theme.muted} />
                  </TouchableOpacity>
                </View>

                <Text style={styles.modalSection}>Summary</Text>
                <Text style={styles.modalText}>{selectedRight.summary}</Text>

                <Text style={styles.modalSection}>Your Rights</Text>
                {selectedRight.rights.map((r, i) => (
                  <View key={i} style={styles.rightRow}>
                    <Ionicons name="checkmark-circle" size={16} color={theme.accent} />
                    <Text style={styles.rightRowText}>{r}</Text>
                  </View>
                ))}

                <Text style={styles.modalSection}>How to Use This Right</Text>
                <Text style={styles.modalText}>{selectedRight.how_to}</Text>

                <Text style={styles.modalSection}>Real Example</Text>
                <View style={styles.exampleCard}>
                  <Ionicons name="bulb" size={16} color="#f59e0b" />
                  <Text style={styles.exampleText}>{selectedRight.example}</Text>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

import { TextInput } from "react-native";

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingTop: 60, paddingBottom: 12 },
  title: { fontSize: 22, fontWeight: "800", color: theme.text },
  introCard: { marginHorizontal: 16, marginTop: 8, backgroundColor: theme.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: theme.border, alignItems: "center" },
  introTitle: { fontSize: 16, fontWeight: "700", color: theme.text, marginTop: 12 },
  introText: { fontSize: 13, color: theme.muted, marginTop: 8, textAlign: "center", lineHeight: 19 },
  searchInput: { marginHorizontal: 16, marginTop: 12, backgroundColor: theme.card, borderRadius: 12, padding: 12, fontSize: 15, color: theme.text, borderWidth: 1, borderColor: theme.border },
  catScroll: { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 10 },
  catChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: theme.border, marginRight: 6 },
  catChipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  catChipText: { fontSize: 12, color: theme.textSecondary },
  catChipTextActive: { color: "#fff", fontWeight: "600" },
  rightCard: { marginHorizontal: 16, marginBottom: 10, backgroundColor: theme.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: theme.border },
  rightHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  rightIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.primary + "15", justifyContent: "center", alignItems: "center" },
  rightInfo: { flex: 1 },
  rightTitle: { fontSize: 15, fontWeight: "700", color: theme.text },
  rightCategory: { fontSize: 11, color: theme.muted, marginTop: 2 },
  rightSummary: { fontSize: 13, color: theme.textSecondary, marginTop: 10, lineHeight: 19 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: theme.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, maxHeight: "90%" },
  modalHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  modalIconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.primary + "15", justifyContent: "center", alignItems: "center" },
  modalTitle: { fontSize: 18, fontWeight: "800", color: theme.text, flex: 1 },
  modalCat: { fontSize: 12, color: theme.muted, marginTop: 2 },
  modalSection: { fontSize: 14, fontWeight: "700", color: theme.text, marginTop: 16, marginBottom: 8 },
  modalText: { fontSize: 14, color: theme.textSecondary, lineHeight: 20 },
  rightRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 8 },
  rightRowText: { fontSize: 13, color: theme.text, flex: 1, lineHeight: 19 },
  exampleCard: { flexDirection: "row", gap: 8, backgroundColor: "#f59e0b10", borderRadius: 12, padding: 14, marginTop: 8 },
  exampleText: { fontSize: 13, color: theme.text, flex: 1, lineHeight: 19 },
});