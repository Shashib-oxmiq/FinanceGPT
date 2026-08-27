import React, { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Modal, TextInput, Alert, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { getEducationPlans, createEducationPlan, deleteEducationPlan, ADMISSION_CHECKLISTS, EDUCATION_COSTS, EDUCATION_LOAN_INFO, SCHOLARSHIPS, calculateEducationCost } from "../services/education";
import { theme, formatMoney } from "../theme";
import PanelChat from "../components/PanelChat";

const GRADE_OPTIONS = ["nursery", "primary", "secondary", "senior_secondary", "college", "postgrad"];

export default function EducationScreen({ navigation }) {
  const { user } = useAuth();
  const [plans, setPlans] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [activeTab, setActiveTab] = useState("plans");
  const [form, setForm] = useState({ child_name: "", child_age: "", target_education: "Engineering (B.Tech)", current_savings: "", monthly_contribution: "" });

  const load = useCallback(async () => {
    if (!user) return;
    try { setPlans(await getEducationPlans(user.user_id)); } catch (e) { console.error(e); }
  }, [user]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const handleAdd = async () => {
    if (!form.child_name) { Alert.alert("Enter child name"); return; }
    const calc = calculateEducationCost(parseInt(form.child_age) || 5, form.target_education);
    await createEducationPlan(user.user_id, {
      ...form, child_age: parseInt(form.child_age) || 0,
      current_savings: parseFloat(form.current_savings) || 0,
      monthly_contribution: parseFloat(form.monthly_contribution) || calc.monthlyNeeded,
      estimated_cost: calc.inflatedCost,
    });
    setForm({ child_name: "", child_age: "", target_education: "Engineering (B.Tech)", current_savings: "", monthly_contribution: "" });
    setShowAdd(false);
    await load();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Education Planner</Text>
        <TouchableOpacity onPress={() => setShowAdd(true)}>
          <Ionicons name="add-circle" size={28} color={theme.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.tabRow}>
        {["plans", "checklist", "scholarships", "loans"].map((t) => (
          <TouchableOpacity key={t} style={[styles.tab, activeTab === t && styles.tabActive]} onPress={() => setActiveTab(t)}>
            <Text style={[styles.tabText, activeTab === t && styles.tabTextActive]}>{t.charAt(0).toUpperCase() + t.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}>
        {activeTab === "plans" && (
          <>
            {plans.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="school" size={48} color={theme.muted} />
                <Text style={styles.emptyTitle}>No education plans yet</Text>
                <Text style={styles.emptySub}>Plan for your child's education — costs, savings, loans, scholarships</Text>
              </View>
            )}
            {plans.map((plan) => {
              const calc = calculateEducationCost(plan.child_age || 5, plan.target_education);
              const progress = plan.estimated_cost > 0 ? Math.min(100, Math.round(((plan.current_savings || 0) / plan.estimated_cost) * 100)) : 0;
              return (
                <View key={plan.plan_id} style={styles.planCard}>
                  <View style={styles.planHeader}>
                    <Ionicons name="school" size={20} color={theme.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.planName}>{plan.child_name}</Text>
                      <Text style={styles.planTarget}>{plan.target_education}</Text>
                    </View>
                    <TouchableOpacity onPress={() => { deleteEducationPlan(plan.plan_id); load(); }}>
                      <Ionicons name="trash-outline" size={16} color={theme.muted} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.planBar}>
                    <View style={[styles.planBarFill, { width: `${progress}%` }]} />
                  </View>
                  <View style={styles.planStats}>
                    <View><Text style={styles.planStatVal}>{formatMoney(plan.current_savings || 0)}</Text><Text style={styles.planStatLabel}>Saved</Text></View>
                    <View><Text style={styles.planStatVal}>{formatMoney(plan.estimated_cost)}</Text><Text style={styles.planStatLabel}>Needed</Text></View>
                    <View><Text style={styles.planStatVal}>{formatMoney(plan.monthly_contribution)}</Text><Text style={styles.planStatLabel}>Monthly</Text></View>
                  </View>
                  <Text style={styles.planYears}>{calc.yearsUntil} years until higher education · Inflated cost estimate</Text>
                </View>
              );
            })}
          </>
        )}

        {activeTab === "checklist" && (
          <>
            <Text style={styles.sectionTitle}>Admission Document Checklist</Text>
            {GRADE_OPTIONS.map((grade) => (
              <View key={grade} style={styles.checklistCard}>
                <Text style={styles.checklistTitle}>{grade.replace("_", " ").toUpperCase()}</Text>
                {ADMISSION_CHECKLISTS[grade]?.map((doc, i) => (
                  <View key={i} style={styles.checklistRow}>
                    <Ionicons name="checkbox-outline" size={16} color={theme.primary} />
                    <Text style={styles.checklistItem}>{doc}</Text>
                  </View>
                ))}
              </View>
            ))}
          </>
        )}

        {activeTab === "scholarships" && (
          <>
            <Text style={styles.sectionTitle}>Scholarships</Text>
            {SCHOLARSHIPS.map((s, i) => (
              <TouchableOpacity key={i} style={styles.scholarshipCard} onPress={() => Linking.openURL(`https://${s.url}`)}>
                <Ionicons name="ribbon" size={20} color="#8b5cf6" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.scholarshipName}>{s.name}</Text>
                  <Text style={styles.scholarshipElig}>{s.eligibility}</Text>
                  <Text style={styles.scholarshipAmount}>{s.amount}</Text>
                </View>
                <Ionicons name="open-outline" size={16} color={theme.muted} />
              </TouchableOpacity>
            ))}
          </>
        )}

        {activeTab === "loans" && (
          <View style={styles.loanInfoCard}>
            <Ionicons name="briefcase" size={32} color="#3b82f6" />
            <Text style={styles.loanInfoTitle}>Education Loan</Text>
            <View style={styles.loanInfoRow}><Text style={styles.loanInfoLabel}>Max Amount</Text><Text style={styles.loanInfoVal}>{EDUCATION_LOAN_INFO.max_amount}</Text></View>
            <View style={styles.loanInfoRow}><Text style={styles.loanInfoLabel}>Interest</Text><Text style={styles.loanInfoVal}>{EDUCATION_LOAN_INFO.interest_rate}</Text></View>
            <View style={styles.loanInfoRow}><Text style={styles.loanInfoLabel}>Moratorium</Text><Text style={styles.loanInfoVal}>{EDUCATION_LOAN_INFO.moratorium}</Text></View>
            <View style={styles.loanInfoRow}><Text style={styles.loanInfoLabel}>Repayment</Text><Text style={styles.loanInfoVal}>{EDUCATION_LOAN_INFO.repayment_period}</Text></View>
            <View style={styles.loanInfoRow}><Text style={styles.loanInfoLabel}>Tax Benefit</Text><Text style={styles.loanInfoVal}>{EDUCATION_LOAN_INFO.tax_benefit}</Text></View>
            {EDUCATION_LOAN_INFO.govt_schemes.map((s, i) => (
              <View key={i} style={styles.schemeRow}><Ionicons name="checkmark-circle" size={14} color={theme.accent} /><Text style={styles.schemeText}>{s}</Text></View>
            ))}
            <TouchableOpacity style={styles.applyBtn} onPress={() => Linking.openURL(EDUCATION_LOAN_INFO.url)}>
              <Text style={styles.applyBtnText}>Apply at Vidya Lakshmi Portal</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ paddingBottom: 16 }}>
          <PanelChat context="Education" title="Ask AI about education planning" />
        </View>
      </ScrollView>

      <Modal visible={showAdd} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Education Plan</Text>
            <TextInput style={styles.input} placeholder="Child's name" value={form.child_name} onChangeText={(v) => setForm({ ...form, child_name: v })} />
            <TextInput style={styles.input} placeholder="Child's age" keyboardType="numeric" value={form.child_age} onChangeText={(v) => setForm({ ...form, child_age: v })} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              {EDUCATION_COSTS.map((e) => (
                <TouchableOpacity key={e.level} style={[styles.typeChip, form.target_education === e.level && { backgroundColor: theme.primary, borderColor: theme.primary }]} onPress={() => setForm({ ...form, target_education: e.level })}>
                  <Text style={[styles.typeChipText, form.target_education === e.level && { color: "#fff" }]}>{e.level}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TextInput style={styles.input} placeholder="Current savings (₹)" keyboardType="numeric" value={form.current_savings} onChangeText={(v) => setForm({ ...form, current_savings: v })} />
            <TextInput style={styles.input} placeholder="Monthly contribution (auto-calculated)" keyboardType="numeric" value={form.monthly_contribution} onChangeText={(v) => setForm({ ...form, monthly_contribution: v })} />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAdd(false)}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleAdd}><Text style={styles.saveText}>Save</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 60, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: "800", color: theme.text, flex: 1, marginLeft: 12 },
  tabRow: { flexDirection: "row", paddingHorizontal: 16, paddingBottom: 8, gap: 6 },
  tab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: theme.border },
  tabActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  tabText: { fontSize: 12, color: theme.textSecondary },
  tabTextActive: { color: "#fff", fontWeight: "600" },
  emptyState: { alignItems: "center", paddingVertical: 50, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: theme.text, marginTop: 16 },
  emptySub: { fontSize: 13, color: theme.muted, marginTop: 8, textAlign: "center" },
  planCard: { marginHorizontal: 16, marginBottom: 10, backgroundColor: theme.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: theme.border },
  planHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  planName: { fontSize: 16, fontWeight: "700", color: theme.text },
  planTarget: { fontSize: 12, color: theme.muted, marginTop: 2 },
  planBar: { height: 8, backgroundColor: theme.border, borderRadius: 4, marginTop: 12, overflow: "hidden" },
  planBarFill: { height: 8, borderRadius: 4, backgroundColor: theme.accent },
  planStats: { flexDirection: "row", justifyContent: "space-around", marginTop: 10 },
  planStatVal: { fontSize: 14, fontWeight: "700", color: theme.text },
  planStatLabel: { fontSize: 10, color: theme.muted, marginTop: 2 },
  planYears: { fontSize: 11, color: theme.muted, marginTop: 8, fontStyle: "italic" },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: theme.text, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 10 },
  checklistCard: { marginHorizontal: 16, marginBottom: 10, backgroundColor: theme.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: theme.border },
  checklistTitle: { fontSize: 14, fontWeight: "700", color: theme.primary, marginBottom: 8, textTransform: "capitalize" },
  checklistRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  checklistItem: { fontSize: 13, color: theme.text, flex: 1 },
  scholarshipCard: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 16, marginBottom: 8, backgroundColor: theme.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: theme.border },
  scholarshipName: { fontSize: 14, fontWeight: "700", color: theme.text },
  scholarshipElig: { fontSize: 12, color: theme.muted, marginTop: 2 },
  scholarshipAmount: { fontSize: 12, color: "#8b5cf6", fontWeight: "600", marginTop: 2 },
  loanInfoCard: { marginHorizontal: 16, backgroundColor: theme.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: theme.border, alignItems: "center" },
  loanInfoTitle: { fontSize: 18, fontWeight: "700", color: theme.text, marginTop: 12 },
  loanInfoRow: { flexDirection: "row", justifyContent: "space-between", width: "100%", marginTop: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: theme.border },
  loanInfoLabel: { fontSize: 13, color: theme.muted },
  loanInfoVal: { fontSize: 13, color: theme.text, fontWeight: "600", textAlign: "right", flex: 1, marginLeft: 12 },
  schemeRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, alignSelf: "flex-start" },
  schemeText: { fontSize: 12, color: theme.text },
  applyBtn: { backgroundColor: "#3b82f6", borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20, marginTop: 16 },
  applyBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  modalContent: { backgroundColor: theme.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, maxHeight: "90%" },
  modalTitle: { fontSize: 20, fontWeight: "800", color: theme.text, marginBottom: 12 },
  typeChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: theme.border, marginRight: 6 },
  typeChipText: { fontSize: 11, color: theme.textSecondary },
  input: { backgroundColor: theme.background, borderRadius: 10, padding: 10, fontSize: 15, color: theme.text, marginBottom: 8, borderWidth: 1, borderColor: theme.border },
  modalBtns: { flexDirection: "row", gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center", borderWidth: 1, borderColor: theme.border },
  cancelText: { fontSize: 16, color: theme.muted, fontWeight: "600" },
  saveBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center", backgroundColor: theme.primary },
  saveText: { fontSize: 16, color: "#fff", fontWeight: "700" },
});