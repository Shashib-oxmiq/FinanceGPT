import React, { useState, useMemo } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { SCHEMES, checkEligibility, getCategories, getSchemeCount } from "../services/govSchemes";
import { theme } from "../theme";
import PanelChat from "../components/PanelChat";

const CAT_ICONS = {
  "Housing": "home", "Healthcare": "medkit", "Agriculture": "leaf", "Women & Child": "people",
  "Education": "school", "Employment": "briefcase", "Pension": "cash", "Pension & Insurance": "shield",
  "Financial Inclusion": "card", "Food": "nutrition", "Senior Citizens": "happy",
  "Disability": "accessibility", "Minority & Caste": "school",
};

export default function SchemesScreen({ navigation }) {
  const { user } = useAuth();
  const [selectedCat, setSelectedCat] = useState(null);
  const [selectedScheme, setSelectedScheme] = useState(null);
  const [profile, setProfile] = useState({
    age: "", income: "", gender: "", occupation: "", category: "", location: "", economic_category: "",
  });

  const parsedProfile = useMemo(() => ({
    age: parseInt(profile.age) || undefined,
    income: parseInt(profile.income) || undefined,
    gender: profile.gender || undefined,
    occupation: profile.occupation || undefined,
    category: profile.category || undefined,
    location: profile.location || undefined,
    economic_category: profile.economic_category || undefined,
  }), [profile]);

  const results = useMemo(() => {
    return SCHEMES.map(s => {
      const r = checkEligibility(s, parsedProfile);
      return { ...r, scheme: s };
    });
  }, [parsedProfile]);

  const eligibleResults = results.filter(r => r.eligible);
  const filteredResults = selectedCat ? results.filter(r => r.scheme.category === selectedCat) : results;
  const categories = getCategories();

  const hasProfile = parsedProfile.age || parsedProfile.income || parsedProfile.gender || parsedProfile.occupation;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Govt Schemes</Text>
          <Text style={styles.subtitle}>{getSchemeCount()} schemes · Find what you qualify for</Text>
        </View>
      </View>

      <ScrollView>
        {/* Profile card for eligibility */}
        <View style={styles.profileCard}>
          <Text style={styles.profileTitle}>Tell us about yourself to find eligible schemes:</Text>
          <View style={styles.profileRow}>
            <TextInput style={styles.profileInput} placeholder="Age" keyboardType="numeric" value={profile.age} onChangeText={(v) => setProfile({ ...profile, age: v })} />
            <TextInput style={styles.profileInput} placeholder="Annual income ₹" keyboardType="numeric" value={profile.income} onChangeText={(v) => setProfile({ ...profile, income: v })} />
          </View>
          <View style={styles.profileRow}>
            <View style={styles.pickerWrap}>
              {["male", "female"].map((g) => (
                <TouchableOpacity key={g} style={[styles.chip, profile.gender === g && styles.chipActive]} onPress={() => setProfile({ ...profile, gender: g })}>
                  <Text style={[styles.chipText, profile.gender === g && styles.chipTextActive]}>{g === "male" ? "Male" : "Female"}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={styles.profileRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {["farmer", "student", "entrepreneur", "unemployed", "central_govt", "self_employed"].map((o) => (
                <TouchableOpacity key={o} style={[styles.chip, profile.occupation === o && styles.chipActive]} onPress={() => setProfile({ ...profile, occupation: o })}>
                  <Text style={[styles.chipText, profile.occupation === o && styles.chipTextActive]}>{o.replace(/_/g, " ")}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
          <View style={styles.profileRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {["sc", "st", "obc", "minority", "general"].map((c) => (
                <TouchableOpacity key={c} style={[styles.chip, profile.category === c && styles.chipActive]} onPress={() => setProfile({ ...profile, category: c })}>
                  <Text style={[styles.chipText, profile.category === c && styles.chipTextActive]}>{c.toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
          <View style={styles.profileRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {[
                { v: "bpl", l: "BPL" }, { v: "vulnerable", l: "Vulnerable" },
                { v: "aay", l: "Antyodaya" }, { v: "middle", l: "Middle Class" }
              ].map((c) => (
                <TouchableOpacity key={c.v} style={[styles.chip, profile.economic_category === c.v && styles.chipActive]} onPress={() => setProfile({ ...profile, economic_category: c.v })}>
                  <Text style={[styles.chipText, profile.economic_category === c.v && styles.chipTextActive]}>{c.l}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
          {hasProfile && eligibleResults.length > 0 && (
            <View style={styles.eligibleBadge}>
              <Ionicons name="checkmark-circle" size={16} color={theme.accent} />
              <Text style={styles.eligibleText}>{eligibleResults.length} schemes you may qualify for!</Text>
            </View>
          )}
        </View>

        {/* Category filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
          <TouchableOpacity style={[styles.catChip, !selectedCat && styles.catChipActive]} onPress={() => setSelectedCat(null)}>
            <Text style={[styles.catChipText, !selectedCat && styles.catChipTextActive]}>All ({SCHEMES.length})</Text>
          </TouchableOpacity>
          {categories.map((cat) => {
            const count = SCHEMES.filter(s => s.category === cat).length;
            return (
              <TouchableOpacity key={cat} style={[styles.catChip, selectedCat === cat && styles.catChipActive]} onPress={() => setSelectedCat(cat)}>
                <Ionicons name={CAT_ICONS[cat] || "grid"} size={12} color={selectedCat === cat ? "#fff" : theme.muted} />
                <Text style={[styles.catChipText, selectedCat === cat && styles.catChipTextActive]}>{cat} ({count})</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Schemes list */}
        {filteredResults.map(({ scheme, eligible, reasons }) => (
          <TouchableOpacity key={scheme.id} style={styles.schemeCard} onPress={() => setSelectedScheme(scheme)}>
            <View style={styles.schemeHeader}>
              <View style={[styles.schemeIcon, { backgroundColor: (eligible ? theme.accent : theme.muted) + "20" }]}>
                <Ionicons name={CAT_ICONS[scheme.category] || "grid"} size={18} color={eligible ? theme.accent : theme.muted} />
              </View>
              <View style={styles.schemeInfo}>
                <Text style={styles.schemeName}>{scheme.name}</Text>
                <Text style={styles.schemeMeta}>{scheme.category} · {scheme.ministry}</Text>
              </View>
              {hasProfile && (
                <View style={[styles.eligTag, eligible ? styles.eligYes : styles.eligNo]}>
                  <Text style={[styles.eligTagText, eligible ? styles.eligYesText : styles.eligNoText]}>
                    {eligible ? "✓ Eligible" : "Not eligible"}
                  </Text>
                </View>
              )}
            </View>
            <Text style={styles.schemeBenefit} numberOfLines={2}>{scheme.benefit}</Text>
            {!eligible && reasons.length > 0 && (
              <Text style={styles.schemeReason}>{reasons[0]}</Text>
            )}
          </TouchableOpacity>
        ))}

        <View style={{ paddingBottom: 16 }}>
          <PanelChat context="Schemes" title="Ask AI: 'What schemes am I eligible for?'" />
        </View>
      </ScrollView>

      {/* Scheme detail modal */}
      <Modal visible={!!selectedScheme} animationType="slide" transparent onRequestClose={() => setSelectedScheme(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedScheme && (
              <ScrollView>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{selectedScheme.name}</Text>
                  <TouchableOpacity onPress={() => setSelectedScheme(null)}>
                    <Ionicons name="close" size={24} color={theme.muted} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.modalCat}>{selectedScheme.category} · {selectedScheme.ministry}</Text>

                <Text style={styles.modalSection}>Benefit</Text>
                <Text style={styles.modalText}>{selectedScheme.benefit}</Text>

                <Text style={styles.modalSection}>Documents Required</Text>
                {selectedScheme.docs.map((d, i) => (
                  <View key={i} style={styles.docRow}>
                    <Ionicons name="document-text" size={14} color={theme.primary} />
                    <Text style={styles.docText}>{d}</Text>
                  </View>
                ))}

                <Text style={styles.modalSection}>How to Apply</Text>
                <Text style={styles.modalText}>{selectedScheme.apply}</Text>

                <TouchableOpacity style={styles.applyBtn} onPress={() => Linking.openURL(selectedScheme.url)}>
                  <Ionicons name="globe" size={18} color="#fff" />
                  <Text style={styles.applyBtnText}>Visit Official Website</Text>
                </TouchableOpacity>

                <Text style={styles.modalHint}>💡 Ask the AI in chat: "Help me apply for {selectedScheme.name}"</Text>
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
  subtitle: { fontSize: 12, color: theme.muted, marginTop: 2 },
  // Profile card
  profileCard: { marginHorizontal: 16, marginTop: 8, backgroundColor: theme.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: theme.border },
  profileTitle: { fontSize: 14, fontWeight: "600", color: theme.text, marginBottom: 10 },
  profileRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  profileInput: { flex: 1, backgroundColor: theme.background, borderRadius: 10, padding: 10, fontSize: 14, color: theme.text, borderWidth: 1, borderColor: theme.border },
  pickerWrap: { flexDirection: "row", gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: theme.border, marginRight: 6 },
  chipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  chipText: { fontSize: 12, color: theme.textSecondary },
  chipTextActive: { color: "#fff", fontWeight: "600" },
  eligibleBadge: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  eligibleText: { fontSize: 13, fontWeight: "600", color: theme.accent },
  // Category scroll
  catScroll: { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 10 },
  catChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: theme.border, marginRight: 6 },
  catChipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  catChipText: { fontSize: 12, color: theme.textSecondary },
  catChipTextActive: { color: "#fff", fontWeight: "600" },
  // Scheme card
  schemeCard: { marginHorizontal: 16, marginBottom: 10, backgroundColor: theme.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: theme.border },
  schemeHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  schemeIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: "center", alignItems: "center" },
  schemeInfo: { flex: 1 },
  schemeName: { fontSize: 15, fontWeight: "700", color: theme.text },
  schemeMeta: { fontSize: 11, color: theme.muted, marginTop: 2 },
  eligTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  eligYes: { backgroundColor: theme.accent + "20" },
  eligNo: { backgroundColor: "#ef444420" },
  eligTagText: { fontSize: 11, fontWeight: "600" },
  eligYesText: { color: theme.accent },
  eligNoText: { color: "#ef4444" },
  schemeBenefit: { fontSize: 13, color: theme.textSecondary, marginTop: 10, lineHeight: 19 },
  schemeReason: { fontSize: 12, color: "#f59e0b", marginTop: 6, fontStyle: "italic" },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: theme.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, maxHeight: "85%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  modalTitle: { fontSize: 20, fontWeight: "800", color: theme.text, flex: 1, marginRight: 12 },
  modalCat: { fontSize: 12, color: theme.muted, marginTop: 4 },
  modalSection: { fontSize: 14, fontWeight: "700", color: theme.text, marginTop: 16, marginBottom: 8 },
  modalText: { fontSize: 14, color: theme.textSecondary, lineHeight: 20 },
  docRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  docText: { fontSize: 14, color: theme.text },
  applyBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: theme.primary, borderRadius: 12, paddingVertical: 14, marginTop: 16 },
  applyBtnText: { fontSize: 16, color: "#fff", fontWeight: "700" },
  modalHint: { fontSize: 13, color: theme.muted, marginTop: 16, textAlign: "center", fontStyle: "italic" },
});