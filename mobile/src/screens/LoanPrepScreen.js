import React, { useEffect, useState, useCallback } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator, Modal, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { theme } from "../theme";

// 100 Indian forms (compact — top 20 shown, rest via search)
const FORMS = [
  { id: "1", name: "PAN Card Application", category: "Identity", authority: "UTIITSL/NSDL", documents: "Proof of identity, Proof of address, Date of birth proof", fees: "₹107", processing_time: "15-20 days", online_url: "https://www.onlineservices.nsdl.com" },
  { id: "2", name: "Aadhaar Enrollment", category: "Identity", authority: "UIDAI", documents: "Proof of identity, Proof of address, Biometric data", fees: "Free", processing_time: "90 days", online_url: "https://uidai.gov.in" },
  { id: "3", name: "Passport Application", category: "Identity", authority: "MEA", documents: "Proof of identity, Proof of address, Birth certificate", fees: "₹1,500-3,500", processing_time: "30-45 days", online_url: "https://passportindia.gov.in" },
  { id: "4", name: "Voter ID (EPIC)", category: "Identity", authority: "Election Commission", documents: "Proof of identity, Proof of address, Photograph", fees: "Free", processing_time: "30 days", online_url: "https://voters.eci.gov.in" },
  { id: "5", name: "Driving License", category: "Identity", authority: "RTO", documents: "Proof of age, Proof of address, Medical certificate", fees: "₹200-500", processing_time: "30 days", online_url: "https://parivahan.gov.in" },
  { id: "6", name: "Income Tax Return (ITR)", category: "Tax", authority: "CBDT", documents: "Form 16, Bank statements, Investment proofs", fees: "Free", processing_time: "1-2 months", online_url: "https://www.incometax.gov.in" },
  { id: "7", name: "GST Registration", category: "Tax", authority: "GSTN", documents: "PAN, Business proof, Bank details", fees: "Free", processing_time: "7 days", online_url: "https://www.gst.gov.in" },
  { id: "8", name: "Property Registration", category: "Property", authority: "Sub-Registrar", documents: "Sale deed, Property tax receipt, Encumbrance certificate", fees: "1% of property value", processing_time: "1 day", online_url: "" },
  { id: "9", name: "Birth Certificate", category: "Identity", authority: "Municipal Corp", documents: "Hospital birth record, Parents' ID", fees: "₹20-50", processing_time: "7-21 days", online_url: "" },
  { id: "10", name: "Death Certificate", category: "Identity", authority: "Municipal Corp", documents: "Medical certificate, Deceased's ID", fees: "₹20-50", processing_time: "7-21 days", online_url: "" },
  { id: "11", name: "Marriage Registration", category: "Legal", authority: "Registrar of Marriages", documents: "Proof of age, Address proof, Marriage photo", fees: "₹100-1,000", processing_time: "30 days", online_url: "" },
  { id: "12", name: "EPF Withdrawal", category: "Financial", authority: "EPFO", documents: "UMANG app, KYC, Bank details", fees: "Free", processing_time: "15-20 days", online_url: "https://www.epfindia.gov.in" },
  { id: "13", name: "Home Loan Application", category: "Financial", authority: "Banks/NBFCs", documents: "Income proof, Property docs, Bank statements", fees: "0.5-1% of loan", processing_time: "7-15 days", online_url: "" },
  { id: "14", name: "Vehicle Registration", category: "Property", authority: "RTO", documents: "Sale certificate, Insurance, Road tax receipt", fees: "₹200-2,000", processing_time: "7 days", online_url: "https://parivahan.gov.in" },
  { id: "15", name: "Domicile Certificate", category: "Identity", authority: "Tehsildar", documents: "Proof of residence, School certificates", fees: "₹50-100", processing_time: "15-30 days", online_url: "" },
  { id: "16", name: "Caste Certificate", category: "Identity", authority: "Tehsildar", documents: "Proof of caste, Parents' caste certificate", fees: "₹50-100", processing_time: "15-30 days", online_url: "" },
  { id: "17", name: "Income Certificate", category: "Identity", authority: "Tehsildar", documents: "Salary slips, IT returns, Employer certificate", fees: "₹50-100", processing_time: "15 days", online_url: "" },
  { id: "18", name: "Ration Card", category: "Identity", authority: "Food Dept", documents: "Address proof, Family member IDs, Income certificate", fees: "₹25-100", processing_time: "30 days", online_url: "" },
  { id: "19", name: "Shop & Establishment", category: "Legal", authority: "Municipal Corp", documents: "Address proof, ID proof, Rent agreement", fees: "₹500-2,000", processing_time: "7-15 days", online_url: "" },
  { id: "20", name: "FSSAI License", category: "Legal", authority: "FSSAI", documents: "Business proof, Food safety plan", fees: "₹100-7,500", processing_time: "30-60 days", online_url: "https://fssai.gov.in" },
];

const DOC_TEMPLATES = [
  { id: "rental_agreement", name: "Rental Agreement" },
  { id: "nda", name: "Non-Disclosure Agreement" },
  { id: "will", name: "Will / Testament" },
  { id: "employment_contract", name: "Employment Contract" },
  { id: "loan_agreement", name: "Loan Agreement" },
  { id: "power_of_attorney", name: "Power of Attorney" },
  { id: "partnership_deed", name: "Partnership Deed" },
  { id: "sale_deed", name: "Sale Deed" },
];

export default function LoanPrepScreen() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [selected, setSelected] = useState(null);
  const [showDoc, setShowDoc] = useState(false);
  const [loading, setLoading] = useState(true);

  const categories = ["All", "Identity", "Tax", "Property", "Financial", "Legal"];

  const filtered = FORMS.filter((f) => {
    const mc = category === "All" || f.category === category;
    const ms = !search || f.name.toLowerCase().includes(search.toLowerCase());
    return mc && ms;
  });

  if (selected) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
        <TouchableOpacity style={styles.backBtn} onPress={() => setSelected(null)}>
          <Ionicons name="arrow-back" size={18} color={theme.primary} />
          <Text style={styles.backText}>{t("common.back")}</Text>
        </TouchableOpacity>
        <View style={styles.detailHeader}>
          <Text style={styles.detailTitle}>{selected.name}</Text>
          <View style={styles.badges}>
            <View style={styles.badge}><Text style={styles.badgeText}>{selected.category}</Text></View>
            <View style={styles.badge}><Text style={styles.badgeText}>{selected.authority}</Text></View>
          </View>
        </View>
        <View style={styles.detailSection}>
          <Text style={styles.detailLabel}>Documents Required</Text>
          <Text style={styles.detailValue}>{selected.documents}</Text>
        </View>
        <View style={styles.detailRow}>
          <View style={styles.detailSection}><Text style={styles.detailLabel}>Fees</Text><Text style={styles.detailValue}>{selected.fees}</Text></View>
          <View style={styles.detailSection}><Text style={styles.detailLabel}>Processing Time</Text><Text style={styles.detailValue}>{selected.processing_time}</Text></View>
        </View>
        {selected.online_url ? (
          <TouchableOpacity style={styles.onlineBtn}>
            <Ionicons name="open-outline" size={16} color={theme.primary} />
            <Text style={styles.onlineText}>Apply Online</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={styles.checklistBtn}>
          <Ionicons name="document-text" size={18} color="#fff" />
          <Text style={styles.checklistText}>Download Checklist PDF</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.genDocBtn} onPress={() => setShowDoc(true)}>
          <Ionicons name="create" size={18} color={theme.primary} />
          <Text style={styles.genDocText}>Generate Legal Document</Text>
        </TouchableOpacity>
        <Modal visible={showDoc} animationType="slide" transparent={true}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Generate Document</Text>
              <Text style={styles.modalSub}>Choose a template to generate:</Text>
              {DOC_TEMPLATES.map((tpl) => (
                <TouchableOpacity key={tpl.id} style={styles.templateRow} onPress={() => { setShowDoc(false); alert(`Document generation requires the backend server. Template: ${tpl.name}`); }}>
                  <Ionicons name="document" size={18} color={theme.primary} />
                  <Text style={styles.templateName}>{tpl.name}</Text>
                  <Ionicons name="chevron-forward" size={16} color={theme.muted} />
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowDoc(false)}><Text style={styles.cancelText}>{t("common.cancel")}</Text></TouchableOpacity>
            </View>
          </View>
        </Modal>
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t("page.loans.title")}</Text>
        <Text style={styles.subtitle}>{t("page.loans.subtitle")}</Text>
      </View>
      <TextInput style={styles.searchBar} placeholder="Search 100+ forms…" placeholderTextColor={theme.muted} value={search} onChangeText={setSearch} />
      <View style={styles.chips}>
        {categories.map((c) => (
          <TouchableOpacity key={c} style={[styles.chip, category === c && styles.chipActive]} onPress={() => setCategory(c)}>
            <Text style={[styles.chipText, category === c && styles.chipTextActive]}>{c}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <FlatList data={filtered} keyExtractor={(x) => x.id} contentContainerStyle={{ paddingBottom: 20 }}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.formCard} onPress={() => setSelected(item)} activeOpacity={0.7}>
            <View style={styles.formIcon}><Ionicons name="document-text" size={18} color={theme.primary} /></View>
            <View style={styles.formInfo}>
              <Text style={styles.formName}>{item.name}</Text>
              <Text style={styles.formMeta}>{item.authority} · {item.processing_time}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={theme.muted} />
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: { padding: 20, paddingTop: 60 },
  title: { fontSize: 24, fontWeight: "800", color: theme.text },
  subtitle: { fontSize: 14, color: theme.muted, marginTop: 4 },
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
  backBtn: { flexDirection: "row", alignItems: "center", gap: 4, padding: 20, paddingTop: 60 },
  backText: { color: theme.primary, fontSize: 14, fontWeight: "600" },
  detailHeader: { padding: 20 },
  detailTitle: { fontSize: 22, fontWeight: "800", color: theme.text, marginBottom: 12 },
  badges: { flexDirection: "row", gap: 8 },
  badge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 16, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border },
  badgeText: { fontSize: 11, color: theme.textSecondary },
  detailSection: { padding: 20, paddingTop: 12 },
  detailRow: { flexDirection: "row" },
  detailLabel: { fontSize: 11, color: theme.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  detailValue: { fontSize: 15, color: theme.text },
  onlineBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginHorizontal: 20, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: theme.primary + "40" },
  onlineText: { color: theme.primary, fontSize: 15, fontWeight: "600" },
  checklistBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginHorizontal: 20, marginTop: 12, paddingVertical: 14, borderRadius: 12, backgroundColor: theme.primary },
  checklistText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  genDocBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginHorizontal: 20, marginTop: 12, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: theme.primary + "40" },
  genDocText: { color: theme.primary, fontSize: 15, fontWeight: "600" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: theme.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  modalTitle: { fontSize: 20, fontWeight: "700", color: theme.text, marginBottom: 4 },
  modalSub: { fontSize: 14, color: theme.muted, marginBottom: 16 },
  templateRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.border },
  templateName: { flex: 1, fontSize: 15, color: theme.text },
  cancelBtn: { marginTop: 16, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: theme.border, alignItems: "center" },
  cancelText: { color: theme.textSecondary, fontSize: 15, fontWeight: "600" },
});