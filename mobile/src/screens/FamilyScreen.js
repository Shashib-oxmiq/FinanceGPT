import React, { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Modal, TextInput, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { getFamilyMembers, addFamilyMember, removeFamilyMember, updateFamilyMember, ACCESS_SCOPES, getScopeLabel, getScopeDescription } from "../services/family";
import { theme } from "../theme";
import PanelChat from "../components/PanelChat";

export default function FamilyScreen({ navigation }) {
  const { user } = useAuth();
  const [members, setMembers] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", relationship: "", access_scope: "view" });

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const m = await getFamilyMembers(user.user_id);
      setMembers(m);
    } catch (e) { console.error(e); }
  }, [user]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const handleAdd = async () => {
    if (!form.name) { Alert.alert("Name required"); return; }
    await addFamilyMember(user.user_id, form);
    setForm({ name: "", email: "", phone: "", relationship: "", access_scope: "view" });
    setShowAdd(false);
    await load();
  };

  const handleRemove = (member) => {
    Alert.alert("Remove Access", `Revoke ${member.name}'s access?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: async () => { await removeFamilyMember(member.member_id); await load(); } },
    ]);
  };

  const handleScopeChange = async (member, scope) => {
    await updateFamilyMember(member.member_id, { access_scope: scope });
    await load();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Family Access</Text>
        <TouchableOpacity onPress={() => setShowAdd(true)}>
          <Ionicons name="add-circle" size={28} color={theme.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}>
        <View style={styles.introCard}>
          <Ionicons name="people" size={32} color={theme.primary} />
          <Text style={styles.introTitle}>Share with Family — Safely</Text>
          <Text style={styles.introText}>
            Invite family members with scoped access. Your spouse can see investments and insurance.
            Your parents can see emergency contacts. Your CA can see tax documents. You control what each person sees.
          </Text>
        </View>

        {members.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="person-add" size={48} color={theme.muted} />
            <Text style={styles.emptyTitle}>No family members yet</Text>
            <Text style={styles.emptySub}>Tap + to invite someone</Text>
          </View>
        )}

        {members.map((member) => {
          const scope = ACCESS_SCOPES[member.access_scope] || ACCESS_SCOPES.view;
          return (
            <View key={member.member_id} style={styles.memberCard}>
              <View style={styles.memberHeader}>
                <View style={[styles.memberAvatar, { backgroundColor: scope.color + "20" }]}>
                  <Text style={[styles.memberInitial, { color: scope.color }]}>{member.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{member.name}</Text>
                  <Text style={styles.memberRel}>{member.relationship}</Text>
                </View>
                <TouchableOpacity onPress={() => handleRemove(member)}>
                  <Ionicons name="trash-outline" size={18} color={theme.muted} />
                </TouchableOpacity>
              </View>

              <View style={[styles.scopeBadge, { backgroundColor: scope.color + "15", borderColor: scope.color + "40" }]}>
                <Ionicons name="lock-closed" size={12} color={scope.color} />
                <Text style={[styles.scopeLabel, { color: scope.color }]}>{scope.label}</Text>
              </View>
              <Text style={styles.scopeDesc}>{scope.description}</Text>

              {member.email && <Text style={styles.memberContact}>📧 {member.email}</Text>}
              {member.phone && <Text style={styles.memberContact}>📱 {member.phone}</Text>}

              {/* Scope selector */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scopeScroll}>
                {Object.entries(ACCESS_SCOPES).map(([key, s]) => (
                  <TouchableOpacity
                    key={key}
                    style={[styles.scopeChip, member.access_scope === key && { backgroundColor: s.color, borderColor: s.color }]}
                    onPress={() => handleScopeChange(member, key)}
                  >
                    <Text style={[styles.scopeChipText, member.access_scope === key && { color: "#fff" }]}>{s.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          );
        })}

        <View style={{ paddingBottom: 16 }}>
          <PanelChat context="Family" title="Ask AI about family access" />
        </View>
      </ScrollView>

      <Modal visible={showAdd} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Invite Family Member</Text>
            <TextInput style={styles.input} placeholder="Name" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />
            <TextInput style={styles.input} placeholder="Email" keyboardType="email-address" value={form.email} onChangeText={(v) => setForm({ ...form, email: v })} />
            <TextInput style={styles.input} placeholder="Phone" keyboardType="phone-pad" value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} />
            <TextInput style={styles.input} placeholder="Relationship (e.g. Spouse, Father)" value={form.relationship} onChangeText={(v) => setForm({ ...form, relationship: v })} />
            <Text style={styles.scopePickerLabel}>Access level:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {Object.entries(ACCESS_SCOPES).map(([key, s]) => (
                <TouchableOpacity key={key} style={[styles.scopeChip, form.access_scope === key && { backgroundColor: s.color, borderColor: s.color }]} onPress={() => setForm({ ...form, access_scope: key })}>
                  <Text style={[styles.scopeChipText, form.access_scope === key && { color: "#fff" }]}>{s.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAdd(false)}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleAdd}><Text style={styles.saveText}>Invite</Text></TouchableOpacity>
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
  introCard: { marginHorizontal: 16, marginTop: 8, backgroundColor: theme.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: theme.border, alignItems: "center" },
  introTitle: { fontSize: 16, fontWeight: "700", color: theme.text, marginTop: 12 },
  introText: { fontSize: 13, color: theme.muted, marginTop: 8, textAlign: "center", lineHeight: 19 },
  emptyState: { alignItems: "center", paddingVertical: 50 },
  emptyTitle: { fontSize: 16, fontWeight: "600", color: theme.muted, marginTop: 12 },
  emptySub: { fontSize: 13, color: theme.muted, marginTop: 4 },
  memberCard: { marginHorizontal: 16, marginBottom: 12, backgroundColor: theme.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: theme.border },
  memberHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  memberAvatar: { width: 44, height: 44, borderRadius: 22, justifyContent: "center", alignItems: "center" },
  memberInitial: { fontSize: 18, fontWeight: "700" },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 16, fontWeight: "700", color: theme.text },
  memberRel: { fontSize: 12, color: theme.muted, marginTop: 2 },
  scopeBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, alignSelf: "flex-start", marginTop: 10 },
  scopeLabel: { fontSize: 11, fontWeight: "600" },
  scopeDesc: { fontSize: 12, color: theme.muted, marginTop: 6, lineHeight: 17 },
  memberContact: { fontSize: 12, color: theme.textSecondary, marginTop: 4 },
  scopeScroll: { marginTop: 10 },
  scopeChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, borderWidth: 1, borderColor: theme.border, marginRight: 6 },
  scopeChipText: { fontSize: 11, color: theme.textSecondary },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  modalContent: { backgroundColor: theme.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalTitle: { fontSize: 20, fontWeight: "800", color: theme.text, marginBottom: 16 },
  input: { backgroundColor: theme.background, borderRadius: 12, padding: 12, fontSize: 16, color: theme.text, marginBottom: 10, borderWidth: 1, borderColor: theme.border },
  scopePickerLabel: { fontSize: 13, fontWeight: "600", color: theme.text, marginBottom: 8 },
  modalBtns: { flexDirection: "row", gap: 12, marginTop: 16 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center", borderWidth: 1, borderColor: theme.border },
  cancelText: { fontSize: 16, color: theme.muted, fontWeight: "600" },
  saveBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center", backgroundColor: theme.primary },
  saveText: { fontSize: 16, color: "#fff", fontWeight: "700" },
});