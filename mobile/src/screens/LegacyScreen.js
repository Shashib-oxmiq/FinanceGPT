import React, { useEffect, useState, useCallback } from "react";
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView, Modal, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { api } from "../services/api";
import { dbGet, dbRun } from "../services/db";
import { checkEmergencyStatus, configureEmergency, userResponded, previewKinPackage, unlockKinAccess } from "../services/emergencyService";
import SmartAddBar from "../components/SmartAddBar";
import PanelChat from "../components/PanelChat";
import { theme, formatMoney } from "../theme";

export default function LegacyScreen({ navigation }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", relationship: "", email: "", phone: "" });
  const [emergencyEnabled, setEmergencyEnabled] = useState(false);
  const [inactiveDays, setInactiveDays] = useState(30);
  const [graceDays, setGraceDays] = useState(7);
  const [kinMessage, setKinMessage] = useState("");
  const [status, setStatus] = useState(null);
  const [preview, setPreview] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const c = await api.getContacts(user.user_id);
      setContacts(c);
      try {
        const cfg = await dbGet("SELECT * FROM emergency_config WHERE user_id = ?", [user.user_id]);
        if (cfg) {
          setEmergencyEnabled(cfg.enabled === 1);
          setInactiveDays(cfg.inactive_days || 30);
          setGraceDays(cfg.grace_period_days || 7);
          setKinMessage(cfg.kin_message || "");
        }
      } catch { /* */ }
      const s = await checkEmergencyStatus(user.user_id);
      setStatus(s);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const addContact = async () => {
    if (!form.name) return;
    await api.addContact(user.user_id, { ...form, access_level: "view" });
    setForm({ name: "", relationship: "", email: "", phone: "" });
    setShowAdd(false);
    load();
  };

  const toggleEmergency = async () => {
    if (!emergencyEnabled && contacts.length === 0) {
      Alert.alert("Add Trusted Contacts First", "You need at least one trusted contact before enabling emergency access.");
      return;
    }
    const newVal = !emergencyEnabled;
    setEmergencyEnabled(newVal);
    await configureEmergency(user.user_id, {
      enabled: newVal,
      inactiveDays,
      gracePeriodDays: graceDays,
      trustedContactIds: contacts.map(c => c.contact_id),
      kinMessage,
    });
    if (newVal) {
      Alert.alert(
        "Emergency Access Enabled",
        `If you don't open the app for ${inactiveDays} days:\n\n` +
        `1. We'll try to reach you (days ${inactiveDays}-${inactiveDays + graceDays})\n` +
        `2. If you don't respond within ${graceDays} days, your trusted contacts get full access\n` +
        `3. They'll see: insurance, investments, loans, property, documents, and a step-by-step checklist\n\n` +
        `Open the app regularly to reset the timer.`
      );
    }
    load();
  };

  const updateInactiveDays = async (days) => {
    setInactiveDays(days);
    await configureEmergency(user.user_id, {
      enabled: emergencyEnabled, inactiveDays: days, gracePeriodDays: graceDays,
      trustedContactIds: contacts.map(c => c.contact_id), kinMessage,
    });
  };

  const updateGraceDays = async (days) => {
    setGraceDays(days);
    await configureEmergency(user.user_id, {
      enabled: emergencyEnabled, inactiveDays, gracePeriodDays: days,
      trustedContactIds: contacts.map(c => c.contact_id), kinMessage,
    });
  };

  const updateKinMessage = async (msg) => {
    setKinMessage(msg);
    await dbRun("UPDATE emergency_config SET kin_message = ?, updated_at = datetime('now') WHERE user_id = ?", [msg, user.user_id]);
  };

  const handlePreview = async () => {
    try {
      const ins = await api.getInsurance(user.user_id).catch(() => []);
      const inv = await api.getInvestments(user.user_id).catch(() => []);
      const pkg = await previewKinPackage(user.user_id, inv, ins, contacts);
      setPreview(pkg);
      setShowPreview(true);
    } catch (e) { Alert.alert("Error", e.message); }
  };

  const handleIamOkay = async () => {
    await userResponded(user.user_id);
    Alert.alert("✓ All Clear", "Emergency timer reset. Your trusted contacts will NOT be contacted.");
    load();
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={theme.primary} /></View>;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Legacy & Emergency</Text>
          <Text style={styles.subtitle}>Protect your family when you can't</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <SmartAddBar context="Legacy" onSaved={load} />

        {/* ── Emergency Status Banner ── */}
        {status && status.phase !== "disabled" && (
          <View style={[styles.statusBanner, status.phase === "monitoring" && { backgroundColor: theme.accent + "15", borderColor: theme.accent },
            status.phase === "checking" && { backgroundColor: "#f59e0b15", borderColor: "#f59e0b" },
            status.phase === "escalated" && { backgroundColor: "#ef444415", borderColor: "#ef4444" }]}>
            <Ionicons name={status.phase === "monitoring" ? "shield-checkmark" : status.phase === "checking" ? "time" : "warning"} size={24} color={status.phase === "monitoring" ? theme.accent : status.phase === "checking" ? "#f59e0b" : "#ef4444"} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.statusTitle, { color: status.phase === "monitoring" ? theme.accent : status.phase === "checking" ? "#f59e0b" : "#ef4444" }]}>
                {status.phase === "monitoring" ? "✓ Protected & Active" : status.phase === "checking" ? "⚠️ Checking on You" : "🚨 Emergency Escalated"}
              </Text>
              <Text style={styles.statusMsg}>{status.message}</Text>
            </View>
          </View>
        )}

        {/* ── I'm Okay button (when checking/escalated) ── */}
        {status && (status.phase === "checking" || status.phase === "escalated") && (
          <TouchableOpacity style={styles.okayBtn} onPress={handleIamOkay}>
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
            <Text style={styles.okayBtnText}>I'm Okay — Cancel Emergency</Text>
          </TouchableOpacity>
        )}

        {/* ── Trusted Contacts ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Trusted Contacts (Next of Kin)</Text>
          {contacts.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="people" size={32} color={theme.muted} />
              <Text style={styles.emptyTitle}>No trusted contacts yet</Text>
              <Text style={styles.emptySub}>Add family members or close friends who should be contacted and given access in an emergency.</Text>
            </View>
          ) : (
            contacts.map((item) => (
              <View key={item.contact_id} style={styles.contactCard}>
                <View style={styles.contactAvatar}>
                  <Ionicons name="person" size={20} color={theme.primary} />
                </View>
                <View style={styles.contactInfo}>
                  <Text style={styles.contactName}>{item.name}</Text>
                  <Text style={styles.contactMeta}>{item.relationship}{item.phone ? ` · ${item.phone}` : ""}{item.email ? ` · ${item.email}` : ""}</Text>
                </View>
                {item.phone && (
                  <TouchableOpacity onPress={() => Linking.openURL(`tel:${item.phone}`)}>
                    <Ionicons name="call" size={18} color={theme.primary} />
                  </TouchableOpacity>
                )}
              </View>
            ))
          )}
          <TouchableOpacity style={styles.addContactBtn} onPress={() => setShowAdd(true)}>
            <Ionicons name="add" size={18} color={theme.primary} />
            <Text style={styles.addContactText}>Add Trusted Contact</Text>
          </TouchableOpacity>
        </View>

        {/* ── Dead-Man Switch Configuration ── */}
        <View style={styles.emergencySection}>
          <View style={styles.emergencyHeader}>
            <Ionicons name="shield-half" size={28} color={emergencyEnabled ? theme.accent : theme.muted} />
            <View style={{ flex: 1 }}>
              <Text style={styles.emergencyTitle}>Dead-Man Switch</Text>
              <Text style={styles.emergencySub}>If you stop opening the app, we check on you — then help your family.</Text>
            </View>
            <TouchableOpacity style={[styles.toggleSwitch, emergencyEnabled && styles.toggleOn]} onPress={toggleEmergency}>
              <View style={[styles.toggleKnob, emergencyEnabled && styles.toggleKnobOn]} />
            </TouchableOpacity>
          </View>

          {emergencyEnabled && (
            <View style={styles.emergencyDetails}>
              {/* How it works */}
              <View style={styles.howItWorks}>
                <Text style={styles.howTitle}>How it works:</Text>
                <View style={styles.stepRow}><Ionicons name="1" size={16} color={theme.primary} /><Text style={styles.stepText}>You stop opening the app</Text></View>
                <View style={styles.stepRow}><Ionicons name="2" size={16} color={theme.primary} /><Text style={styles.stepText}>After {inactiveDays} days, we try to reach you</Text></View>
                <View style={styles.stepRow}><Ionicons name="3" size={16} color="#f59e0b" /><Text style={styles.stepText}>{graceDays}-day grace period for you to respond</Text></View>
                <View style={styles.stepRow}><Ionicons name="4" size={16} color="#ef4444" /><Text style={styles.stepText}>If no response: kin gets full access + checklist</Text></View>
              </View>

              {/* Inactivity threshold */}
              <Text style={styles.configLabel}>Trigger after inactivity:</Text>
              <View style={styles.daysRow}>
                {[15, 30, 60, 90].map((d) => (
                  <TouchableOpacity key={d} style={[styles.dayChip, inactiveDays === d && styles.dayChipActive]} onPress={() => updateInactiveDays(d)}>
                    <Text style={[styles.dayChipText, inactiveDays === d && styles.dayChipTextActive]}>{d}d</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Grace period */}
              <Text style={styles.configLabel}>Grace period (time to respond):</Text>
              <View style={styles.daysRow}>
                {[3, 7, 14, 30].map((d) => (
                  <TouchableOpacity key={d} style={[styles.dayChip, graceDays === d && styles.dayChipActive]} onPress={() => updateGraceDays(d)}>
                    <Text style={[styles.dayChipText, graceDays === d && styles.dayChipTextActive]}>{d}d</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Kin message */}
              <Text style={styles.configLabel}>Message for your family (optional):</Text>
              <TextInput style={styles.kinMsgInput} placeholder="e.g. Dear family, if you're reading this, I may need help. Here's everything you need..." placeholderTextColor={theme.muted} value={kinMessage} onChangeText={updateKinMessage} multiline numberOfLines={3} textAlignVertical="top" />

              {/* Trusted contacts count */}
              <View style={styles.emergencyInfo}>
                <Ionicons name="information-circle" size={14} color={theme.muted} />
                <Text style={styles.emergencyInfoText}>
                  {contacts.length} trusted contact{contacts.length !== 1 ? "s" : ""} will receive: insurance policies, investments, loans, property, documents, reminders, and a step-by-step checklist for the family.
                </Text>
              </View>

              {contacts.length === 0 && (
                <Text style={styles.emergencyWarn}>⚠️ Add trusted contacts above to enable this feature.</Text>
              )}

              {/* Preview button */}
              <TouchableOpacity style={styles.previewBtn} onPress={handlePreview}>
                <Ionicons name="eye" size={16} color={theme.primary} />
                <Text style={styles.previewBtnText}>Preview What Your Family Will See</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={{ paddingBottom: 16 }}>
          <PanelChat context="Legacy" title="Ask AI about estate planning" />
        </View>
      </ScrollView>

      {/* ── Preview Modal ── */}
      <Modal visible={showPreview} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.previewModalContent}>
            <View style={styles.previewHeader}>
              <Text style={styles.previewTitle}>Family Handoff Package Preview</Text>
              <TouchableOpacity onPress={() => setShowPreview(false)}><Ionicons name="close" size={24} color={theme.muted} /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {preview ? (
                <>
                  {/* Immediate actions */}
                  {preview.immediate?.length > 0 && (
                    <View style={styles.previewSection}>
                      <Text style={styles.previewSectionTitle}>🚨 Immediate Actions Needed</Text>
                      {preview.immediate.map((a, i) => (
                        <View key={i} style={styles.previewItem}>
                          <Ionicons name="alert-circle" size={14} color="#ef4444" />
                          <Text style={styles.previewItemText}>{a.action} — {a.due || `₹${a.amount}`}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {/* Insurance */}
                  {preview.insurance?.length > 0 && (
                    <View style={styles.previewSection}>
                      <Text style={styles.previewSectionTitle}>🛡️ Insurance Policies</Text>
                      {preview.insurance.map((i, idx) => (
                        <View key={idx} style={styles.previewCard}>
                          <Text style={styles.previewCardTitle}>{i.policy_type} — {i.provider}</Text>
                          <Text style={styles.previewCardMeta}>Sum: ₹{Number(i.sum_assured || 0).toLocaleString("en-IN")} · Policy: {i.policy_number}</Text>
                          <Text style={styles.previewCardMeta}>Nominee: {i.nominee || "Not specified"}</Text>
                          <Text style={styles.previewNextSteps}>→ {i.next_steps}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {/* Investments */}
                  {preview.investments?.length > 0 && (
                    <View style={styles.previewSection}>
                      <Text style={styles.previewSectionTitle}>💰 Investments</Text>
                      {preview.investments.map((inv, i) => (
                        <View key={i} style={styles.previewCard}>
                          <Text style={styles.previewCardTitle}>{inv.name} ({inv.asset_type})</Text>
                          <Text style={styles.previewCardMeta}>Value: ₹{Number(inv.current_value || 0).toLocaleString("en-IN")}</Text>
                          <Text style={styles.previewNextSteps}>→ {inv.next_steps}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {/* Loans */}
                  {preview.loans?.length > 0 && (
                    <View style={styles.previewSection}>
                      <Text style={styles.previewSectionTitle}>💳 Loans & Debt</Text>
                      {preview.loans.map((l, i) => (
                        <View key={i} style={styles.previewCard}>
                          <Text style={styles.previewCardTitle}>{l.loan_type} — {l.lender}</Text>
                          <Text style={styles.previewCardMeta}>Remaining: ₹{Number(l.remaining_amount || 0).toLocaleString("en-IN")} · EMI: ₹{Number(l.emi_amount || 0).toLocaleString("en-IN")}/mo</Text>
                          <Text style={styles.previewNextSteps}>→ {l.next_steps}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {/* Properties */}
                  {preview.properties?.length > 0 && (
                    <View style={styles.previewSection}>
                      <Text style={styles.previewSectionTitle}>🏠 Properties</Text>
                      {preview.properties.map((p, i) => (
                        <View key={i} style={styles.previewCard}>
                          <Text style={styles.previewCardTitle}>{p.type} — {p.address || p.city}</Text>
                          <Text style={styles.previewCardMeta}>Value: ₹{Number(p.current_value || 0).toLocaleString("en-IN")}</Text>
                          <Text style={styles.previewNextSteps}>→ {p.next_steps}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {/* Family checklist */}
                  <View style={styles.previewSection}>
                    <Text style={styles.previewSectionTitle}>📋 Family Checklist ({preview.familyChecklist?.length} steps)</Text>
                    {preview.familyChecklist?.slice(0, 8).map((c, i) => (
                      <View key={i} style={styles.checklistRow}>
                        <Ionicons name="checkbox-outline" size={14} color={theme.primary} />
                        <Text style={styles.checklistText}>{c}</Text>
                      </View>
                    ))}
                    {preview.familyChecklist?.length > 8 && <Text style={styles.moreText}>+ {preview.familyChecklist.length - 8} more steps</Text>}
                  </View>
                </>
              ) : (
                <Text style={styles.emptySub}>Loading preview...</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Add Contact Modal ── */}
      <Modal visible={showAdd} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Trusted Contact</Text>
            <TextInput style={styles.input} placeholder="Name" placeholderTextColor={theme.muted} value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />
            <TextInput style={styles.input} placeholder="Relationship (spouse, son, daughter, friend)" placeholderTextColor={theme.muted} value={form.relationship} onChangeText={(v) => setForm({ ...form, relationship: v })} />
            <TextInput style={styles.input} placeholder="Phone" placeholderTextColor={theme.muted} value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} keyboardType="phone-pad" />
            <TextInput style={styles.input} placeholder="Email" placeholderTextColor={theme.muted} value={form.email} onChangeText={(v) => setForm({ ...form, email: v })} keyboardType="email-address" />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAdd(false)}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={addContact}><Text style={styles.saveText}>Save</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  center: { flex: 1, backgroundColor: theme.background, justifyContent: "center", alignItems: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, padding: 20, paddingTop: 60 },
  backBtn: { padding: 4 },
  title: { fontSize: 24, fontWeight: "800", color: theme.text },
  subtitle: { fontSize: 14, color: theme.muted, marginTop: 4 },
  section: { padding: 20, paddingTop: 24 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: theme.text, marginBottom: 12 },
  emptyCard: { alignItems: "center", padding: 24, backgroundColor: theme.card, borderRadius: 14, borderWidth: 1, borderColor: theme.border },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: theme.text, marginTop: 12 },
  emptySub: { fontSize: 13, color: theme.muted, marginTop: 8, textAlign: "center", lineHeight: 19 },
  contactCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: theme.card, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: theme.border },
  contactAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.primary + "15", justifyContent: "center", alignItems: "center" },
  contactInfo: { flex: 1 },
  contactName: { fontSize: 15, fontWeight: "600", color: theme.text },
  contactMeta: { fontSize: 12, color: theme.muted, marginTop: 2 },
  addContactBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.primary + "40", marginTop: 8 },
  addContactText: { fontSize: 14, color: theme.primary, fontWeight: "600" },
  statusBanner: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 16, marginTop: 8, borderRadius: 12, padding: 12, borderWidth: 1 },
  statusTitle: { fontSize: 15, fontWeight: "700" },
  statusMsg: { fontSize: 12, color: theme.textSecondary, marginTop: 4, lineHeight: 17 },
  okayBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginHorizontal: 16, marginTop: 8, paddingVertical: 14, borderRadius: 12, backgroundColor: theme.accent },
  okayBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  emergencySection: { margin: 16, backgroundColor: theme.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: theme.border },
  emergencyHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  emergencyTitle: { fontSize: 18, fontWeight: "800", color: theme.text },
  emergencySub: { fontSize: 13, color: theme.muted, marginTop: 2 },
  toggleSwitch: { width: 52, height: 30, borderRadius: 15, backgroundColor: theme.border, justifyContent: "center", paddingHorizontal: 2 },
  toggleOn: { backgroundColor: theme.accent },
  toggleKnob: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#fff" },
  toggleKnobOn: { transform: [{ translateX: 22 }] },
  emergencyDetails: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: theme.border },
  howItWorks: { backgroundColor: theme.background, borderRadius: 12, padding: 12, marginBottom: 14 },
  howTitle: { fontSize: 13, fontWeight: "700", color: theme.text, marginBottom: 8 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  stepText: { fontSize: 12, color: theme.textSecondary, flex: 1 },
  configLabel: { fontSize: 13, fontWeight: "600", color: theme.text, marginTop: 10, marginBottom: 6 },
  daysRow: { flexDirection: "row", gap: 8 },
  dayChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: theme.border },
  dayChipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  dayChipText: { fontSize: 13, color: theme.textSecondary, fontWeight: "600" },
  dayChipTextActive: { color: "#fff", fontWeight: "700" },
  kinMsgInput: { backgroundColor: theme.background, borderRadius: 10, padding: 10, fontSize: 13, color: theme.text, marginTop: 4, borderWidth: 1, borderColor: theme.border, minHeight: 60 },
  emergencyInfo: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 14, backgroundColor: theme.background, borderRadius: 10, padding: 10 },
  emergencyInfoText: { fontSize: 12, color: theme.muted, flex: 1, lineHeight: 17 },
  emergencyWarn: { fontSize: 13, color: "#f59e0b", marginTop: 10, fontWeight: "600" },
  previewBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 14, paddingVertical: 12, borderRadius: 12, backgroundColor: theme.primary + "10", borderWidth: 1, borderColor: theme.primary + "40" },
  previewBtnText: { fontSize: 14, color: theme.primary, fontWeight: "600" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: theme.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
  modalTitle: { fontSize: 20, fontWeight: "800", color: theme.text, marginBottom: 12 },
  input: { backgroundColor: theme.background, borderRadius: 10, padding: 12, fontSize: 15, color: theme.text, marginBottom: 10, borderWidth: 1, borderColor: theme.border },
  modalButtons: { flexDirection: "row", gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center", borderWidth: 1, borderColor: theme.border },
  cancelText: { fontSize: 16, color: theme.muted, fontWeight: "600" },
  saveBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center", backgroundColor: theme.primary },
  saveText: { fontSize: 16, color: "#fff", fontWeight: "700" },
  previewModalContent: { backgroundColor: theme.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, maxHeight: "90%" },
  previewHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  previewTitle: { fontSize: 18, fontWeight: "800", color: theme.text },
  previewSection: { marginBottom: 16 },
  previewSectionTitle: { fontSize: 15, fontWeight: "700", color: theme.text, marginBottom: 8 },
  previewItem: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  previewItemText: { fontSize: 13, color: theme.text, flex: 1 },
  previewCard: { backgroundColor: theme.background, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: theme.border },
  previewCardTitle: { fontSize: 14, fontWeight: "700", color: theme.text },
  previewCardMeta: { fontSize: 12, color: theme.muted, marginTop: 2 },
  previewNextSteps: { fontSize: 12, color: theme.primary, marginTop: 6 },
  checklistRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginBottom: 6 },
  checklistText: { fontSize: 12, color: theme.textSecondary, flex: 1, lineHeight: 17 },
  moreText: { fontSize: 12, color: theme.muted, marginTop: 4 },
});