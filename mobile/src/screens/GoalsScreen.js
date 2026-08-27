import React, { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Modal, TextInput, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { getGoals, createGoal, updateGoal, deleteGoal, contributeToGoal, getGoalProgress } from "../services/goals";
import { formatMoney } from "../theme";
import { theme } from "../theme";
import PanelChat from "../components/PanelChat";

export default function GoalsScreen({ navigation }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [goals, setGoals] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [form, setForm] = useState({ title: "", target_amount: "", target_date: "", monthly_contribution: "", category: "savings" });

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const g = await getGoals(user.user_id);
      setGoals(g);
    } catch (e) { console.error(e); }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const handleSave = async () => {
    if (!form.title || !form.target_amount) {
      Alert.alert("Missing info", "Please enter a title and target amount");
      return;
    }
    const data = {
      title: form.title,
      target_amount: parseFloat(form.target_amount),
      target_date: form.target_date || null,
      monthly_contribution: parseFloat(form.monthly_contribution) || 0,
      category: form.category,
    };
    if (editingGoal) {
      await updateGoal(editingGoal.goal_id, data);
    } else {
      await createGoal(user.user_id, data);
    }
    setShowAdd(false);
    setEditingGoal(null);
    setForm({ title: "", target_amount: "", target_date: "", monthly_contribution: "", category: "savings" });
    await load();
  };

  const handleContribute = async (goal) => {
    Alert.prompt("Contribute", `Add amount to "${goal.title}":`, async (text) => {
      const amt = parseFloat(text);
      if (isNaN(amt) || amt <= 0) return;
      await contributeToGoal(goal.goal_id, amt);
      await load();
    });
  };

  const handleDelete = (goal) => {
    Alert.alert("Delete Goal", `Remove "${goal.title}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { await deleteGoal(goal.goal_id); await load(); } },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Goals</Text>
        <TouchableOpacity onPress={() => { setEditingGoal(null); setForm({ title: "", target_amount: "", target_date: "", monthly_contribution: "", category: "savings" }); setShowAdd(true); }}>
          <Ionicons name="add-circle" size={28} color={theme.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}>
        {goals.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="flag" size={48} color={theme.muted} />
            <Text style={styles.emptyTitle}>No goals yet</Text>
            <Text style={styles.emptySub}>Tell the AI: "I want to save ₹10 lakh in 3 years"</Text>
            <Text style={styles.emptySub}>or tap + to create one manually</Text>
          </View>
        )}

        {goals.map((goal) => {
          const prog = getGoalProgress(goal);
          return (
            <View key={goal.goal_id} style={styles.goalCard}>
              <View style={styles.goalHeader}>
                <View>
                  <Text style={styles.goalTitle}>{goal.title}</Text>
                  <Text style={styles.goalCategory}>{goal.category}</Text>
                </View>
                <TouchableOpacity onPress={() => handleDelete(goal)}>
                  <Ionicons name="trash-outline" size={18} color={theme.muted} />
                </TouchableOpacity>
              </View>

              <View style={styles.goalAmounts}>
                <Text style={styles.goalCurrent}>{formatMoney(goal.current_amount)}</Text>
                <Text style={styles.goalTarget}> / {formatMoney(goal.target_amount)}</Text>
              </View>

              <View style={styles.goalBar}>
                <View style={[styles.goalBarFill, { width: `${prog.pct}%`, backgroundColor: prog.onTrack ? theme.accent : theme.primary }]} />
              </View>

              <View style={styles.goalStats}>
                <Text style={styles.goalPct}>{prog.pct}% complete</Text>
                {prog.monthsLeft !== null && <Text style={styles.goalMonths}>{prog.monthsLeft} months left</Text>}
              </View>

              {prog.requiredMonthly !== null && (
                <View style={styles.goalTrack}>
                  <Ionicons name={prog.onTrack ? "checkmark-circle" : "warning"} size={14} color={prog.onTrack ? theme.accent : "#f59e0b"} />
                  <Text style={[styles.goalTrackText, { color: prog.onTrack ? theme.accent : "#f59e0b" }]}>
                    {prog.onTrack ? "On track!" : `Need ₹${prog.requiredMonthly}/month to stay on track`}
                  </Text>
                </View>
              )}

              <TouchableOpacity style={styles.contributeBtn} onPress={() => handleContribute(goal)}>
                <Ionicons name="add" size={16} color={theme.primary} />
                <Text style={styles.contributeText}>Add Contribution</Text>
              </TouchableOpacity>
            </View>
          );
        })}

        <View style={{ paddingBottom: 16 }}>
          <PanelChat context="Goals" />
        </View>
      </ScrollView>

      {/* Add/Edit Modal */}
      <Modal visible={showAdd} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingGoal ? "Edit Goal" : "New Goal"}</Text>
            <TextInput style={styles.input} placeholder="Goal title (e.g. Daughter's wedding)" value={form.title} onChangeText={(v) => setForm({ ...form, title: v })} />
            <TextInput style={styles.input} placeholder="Target amount (₹)" keyboardType="numeric" value={form.target_amount} onChangeText={(v) => setForm({ ...form, target_amount: v })} />
            <TextInput style={styles.input} placeholder="Target date (YYYY-MM-DD)" value={form.target_date} onChangeText={(v) => setForm({ ...form, target_date: v })} />
            <TextInput style={styles.input} placeholder="Monthly contribution (₹)" keyboardType="numeric" value={form.monthly_contribution} onChangeText={(v) => setForm({ ...form, monthly_contribution: v })} />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowAdd(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={handleSave}>
                <Text style={styles.modalSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 60, paddingBottom: 12 },
  title: { fontSize: 22, fontWeight: "800", color: theme.text },
  emptyState: { alignItems: "center", paddingVertical: 60, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: theme.text, marginTop: 16 },
  emptySub: { fontSize: 14, color: theme.muted, marginTop: 8, textAlign: "center" },
  goalCard: { marginHorizontal: 16, marginBottom: 12, backgroundColor: theme.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: theme.border },
  goalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  goalTitle: { fontSize: 16, fontWeight: "700", color: theme.text },
  goalCategory: { fontSize: 11, color: theme.muted, marginTop: 2, textTransform: "capitalize" },
  goalAmounts: { flexDirection: "row", alignItems: "baseline", marginTop: 12 },
  goalCurrent: { fontSize: 20, fontWeight: "800", color: theme.accent },
  goalTarget: { fontSize: 14, color: theme.muted },
  goalBar: { height: 8, backgroundColor: theme.border, borderRadius: 4, marginTop: 10, overflow: "hidden" },
  goalBarFill: { height: 8, borderRadius: 4 },
  goalStats: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  goalPct: { fontSize: 12, fontWeight: "600", color: theme.text },
  goalMonths: { fontSize: 12, color: theme.muted },
  goalTrack: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 },
  goalTrackText: { fontSize: 12, fontWeight: "500" },
  contributeBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, marginTop: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: theme.primary + "40" },
  contributeText: { fontSize: 13, color: theme.primary, fontWeight: "600" },
  // Modal
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  modalContent: { backgroundColor: theme.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalTitle: { fontSize: 20, fontWeight: "800", color: theme.text, marginBottom: 16 },
  input: { backgroundColor: theme.background, borderRadius: 12, padding: 12, fontSize: 16, color: theme.text, marginBottom: 12, borderWidth: 1, borderColor: theme.border },
  modalBtns: { flexDirection: "row", gap: 12, marginTop: 8 },
  modalCancel: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center", borderWidth: 1, borderColor: theme.border },
  modalCancelText: { fontSize: 16, color: theme.muted, fontWeight: "600" },
  modalSave: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center", backgroundColor: theme.primary },
  modalSaveText: { fontSize: 16, color: "#fff", fontWeight: "700" },
});