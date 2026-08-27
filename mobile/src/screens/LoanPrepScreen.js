// ── LoanPrep Screen (Document Preparation) ───────────────────────────────────
// Full 100 Indian forms + document generation integrated
import React, { useState, useCallback, useEffect } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, Modal, ScrollView, Alert, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { searchForms, FORM_CATEGORIES, DOC_TEMPLATES, getFormById } from "../services/formsData";
import { downloadDocument, downloadFormChecklist, getTemplate } from "../services/docGen";
import SmartAddBar from "../components/SmartAddBar";
import PanelChat from "../components/PanelChat";
import { theme } from "../theme";

export default function LoanPrepScreen() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [selected, setSelected] = useState(null);
  const [showDoc, setShowDoc] = useState(false);
  const [showFields, setShowFields] = useState(false);
  const [tplId, setTplId] = useState(null);
  const [fieldValues, setFieldValues] = useState({});
  const [generating, setGenerating] = useState(false);

  const filtered = searchForms(search, category);

  if (selected) {
    const docList = selected.documents.split(",").map((d) => d.trim());

    const handleDownloadChecklist = async () => {
      setGenerating(true);
      try { await downloadFormChecklist(selected); Alert.alert("Downloaded", "Checklist saved"); }
      catch (e) { Alert.alert("Error", e.message); }
      finally { setGenerating(false); }
    };

    const handleSelectTemplate = (id) => {
      setTplId(id);
      const tpl = getTemplate(id);
      if (tpl) {
        const initVals = {};
        tpl.fields.forEach((f) => initVals[f] = "");
        setFieldValues(initVals);
        setShowDoc(false);
        setShowFields(true);
      }
    };

    const handleGenerate = async () => {
      setGenerating(true);
      try {
        const result = await downloadDocument(tplId, fieldValues, "txt");
        if (result.ok) { Alert.alert("Downloaded", result.filename + " saved"); setShowFields(false); }
        else { Alert.alert("Error", result.error || "Failed"); }
      } catch (e) { Alert.alert("Error", e.message); }
      finally { setGenerating(false); }
    };

    return (
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
        <TouchableOpacity style={styles.backBtn} onPress={() => setSelected(null)}>
          <Ionicons name="arrow-back" size={18} color={theme.primary} />
          <Text style={styles.backText}>{t("common.back")}</Text>
        </TouchableOpacity>
        <View style={styles.detailHeader}>
          <Text style={styles.detailTitle}>{selected.name}</Text>
          <Text style={styles.detailDesc}>{selected.description}</Text>
          <View style={styles.badges}>
            <View style={styles.badge}><Text style={styles.badgeText}>{selected.category}</Text></View>
            <View style={styles.badge}><Text style={styles.badgeText}>{selected.authority}</Text></View>
          </View>
        </View>
        <View style={styles.detailSection}>
          <Text style={styles.detailLabel}>Documents Required</Text>
          {docList.map((doc, i) => (
            <View key={i} style={styles.checklistRow}>
              <Ionicons name="ellipse-outline" size={18} color={theme.muted} />
              <Text style={styles.checklistText}>{doc}</Text>
            </View>
          ))}
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
        <TouchableOpacity style={styles.checklistBtn} onPress={handleDownloadChecklist} disabled={generating}>
          {generating ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="download" size={18} color="#fff" />}
          <Text style={styles.checklistBtnText}>Download Checklist</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.genDocBtn} onPress={() => setShowDoc(true)}>
          <Ionicons name="create" size={18} color={theme.primary} />
          <Text style={styles.genDocText}>Generate Legal Document</Text>
        </TouchableOpacity>
        <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
          <SmartAddBar context="LoanPrep" />
          <PanelChat context="LoanPrep" title="Ask AI about this form" />
        </View>

        {/* Template picker modal */}
        <Modal visible={showDoc} animationType="slide" transparent={true}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Generate Document</Text>
              <Text style={styles.modalSub}>Choose a template:</Text>
              <ScrollView>
                {DOC_TEMPLATES.map((tpl) => (
                  <TouchableOpacity key={tpl.id} style={styles.templateRow} onPress={() => handleSelectTemplate(tpl.id)}>
                    <Ionicons name="document" size={18} color={theme.primary} />
                    <Text style={styles.templateName}>{tpl.name}</Text>
                    <Ionicons name="chevron-forward" size={16} color={theme.muted} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowDoc(false)}><Text style={styles.cancelText}>{t("common.cancel")}</Text></TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Field input modal */}
        <Modal visible={showFields} animationType="slide" transparent={true}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>{getTemplate(tplId)?.title || "Document"}</Text>
              <Text style={styles.modalSub}>Fill in the details:</Text>
              <ScrollView style={{ maxHeight: 400 }}>
                {Object.keys(fieldValues).map((field) => (
                  <View key={field}>
                    <Text style={styles.fieldLabel}>{field.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</Text>
                    <TextInput
                      style={styles.input}
                      placeholder={field.replace(/_/g, " ")}
                      placeholderTextColor={theme.muted}
                      value={fieldValues[field]}
                      onChangeText={(v) => setFieldValues({ ...fieldValues, [field]: v })}
                    />
                  </View>
                ))}
              </ScrollView>
              <View style={styles.modalButtons}>
                <TouchableOpacity style={styles.cancelBtn2} onPress={() => setShowFields(false)}><Text style={styles.cancelText}>{t("common.cancel")}</Text></TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={handleGenerate} disabled={generating}>
                  {generating ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveText}>Generate & Download</Text>}
                </TouchableOpacity>
              </View>
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
      <SmartAddBar context="LoanPrep" />
      <TextInput style={styles.searchBar} placeholder="Search 100+ forms…" placeholderTextColor={theme.muted} value={search} onChangeText={setSearch} />
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
          <TouchableOpacity style={styles.formCard} onPress={() => setSelected(item)} activeOpacity={0.7}>
            <View style={styles.formIcon}><Ionicons name="document-text" size={18} color={theme.primary} /></View>
            <View style={styles.formInfo}>
              <Text style={styles.formName}>{item.name}</Text>
              <Text style={styles.formMeta}>{item.authority} · {item.processing_time}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={theme.muted} />
          </TouchableOpacity>
        )}
        ListFooterComponent={() => (
          <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
            <PanelChat context="LoanPrep" />
          </View>
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
  detailHeader: { padding: 20, paddingTop: 4 },
  detailTitle: { fontSize: 22, fontWeight: "800", color: theme.text, marginBottom: 8 },
  detailDesc: { fontSize: 14, color: theme.textSecondary, marginBottom: 12, lineHeight: 20 },
  badges: { flexDirection: "row", gap: 8 },
  badge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 16, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border },
  badgeText: { fontSize: 11, color: theme.textSecondary },
  detailSection: { padding: 20, paddingTop: 12 },
  detailRow: { flexDirection: "row" },
  detailLabel: { fontSize: 11, color: theme.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  detailValue: { fontSize: 15, color: theme.text },
  checklistRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  checklistText: { flex: 1, fontSize: 14, color: theme.text },
  onlineBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginHorizontal: 20, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: theme.primary + "40" },
  onlineText: { color: theme.primary, fontSize: 15, fontWeight: "600" },
  checklistBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginHorizontal: 20, marginTop: 12, paddingVertical: 14, borderRadius: 12, backgroundColor: theme.primary },
  checklistBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  genDocBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginHorizontal: 20, marginTop: 12, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: theme.primary + "40" },
  genDocText: { color: theme.primary, fontSize: 15, fontWeight: "600" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: theme.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "85%" },
  modalTitle: { fontSize: 20, fontWeight: "700", color: theme.text, marginBottom: 4 },
  modalSub: { fontSize: 14, color: theme.muted, marginBottom: 16 },
  templateRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.border },
  templateName: { flex: 1, fontSize: 15, color: theme.text },
  cancelBtn: { marginTop: 16, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: theme.border, alignItems: "center" },
  cancelText: { color: theme.textSecondary, fontSize: 15, fontWeight: "600" },
  fieldLabel: { fontSize: 12, color: theme.muted, marginBottom: 4, textTransform: "capitalize" },
  input: { backgroundColor: theme.input, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: theme.text, marginBottom: 12, borderWidth: 1, borderColor: theme.border },
  modalButtons: { flexDirection: "row", gap: 12, marginTop: 8 },
  cancelBtn2: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: theme.border, alignItems: "center" },
  saveBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: theme.primary, alignItems: "center" },
  saveText: { color: "#fff", fontSize: 14, fontWeight: "700" },
});