import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput, ScrollView, Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api";
import { theme } from "../theme";

const TYPE_LABEL = (t) => (t || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default function InsuranceScreen() {
  const [policies, setPolicies] = useState([]);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ policy_type: "life_term", provider: "", sum_assured: "", nominee_name: "", claim_contact: "" });
  const [review, setReview] = useState(null);
  const [reviewing, setReviewing] = useState(false);

  const load = useCallback(async () => {
    try { const { data } = await api.get("/insurance"); setPolicies(data); } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const add = async () => {
    if (!form.provider) return Alert.alert("Provider required");
    try {
      await api.post("/insurance", form);
      setForm({ policy_type: "life_term", provider: "", sum_assured: "", nominee_name: "", claim_contact: "" });
      setShow(false);
      load();
    } catch { Alert.alert("Failed to add policy"); }
  };

  const del = async (id) => { await api.delete(`/insurance/${id}`); load(); };

  const runReview = async () => {
    setReviewing(true);
    try { const { data } = await api.post("/insurance/review", { question: "" }); setReview(data); }
    catch { Alert.alert("Review failed"); }
    finally { setReviewing(false); }
  };

  const renderItem = ({ item }) => (
    <View style={st.card}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={st.type}>{TYPE_LABEL(item.policy_type)}</Text>
        <TouchableOpacity onPress={() => del(item.policy_id)}><Ionicons name="trash" size={16} color={theme.danger} /></TouchableOpacity>
      </View>
      <Text style={st.provider}>{item.provider}</Text>
      {!!item.sum_assured && <Text style={st.row}>Sum assured: {item.sum_assured}</Text>}
      {!!item.nominee_name ? <Text style={st.row}>Nominee: {item.nominee_name}</Text>
        : <Text style={[st.row, { color: theme.warning }]}>No nominee — benefit may not reach family</Text>}
      {!!item.claim_contact && <Text style={st.row}>Claim: {item.claim_contact}</Text>}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={st.actions}>
        <TouchableOpacity style={st.outlineBtn} onPress={runReview} disabled={reviewing}>
          <Ionicons name="sparkles" size={14} color={theme.text} />
          <Text style={st.outlineText}>{reviewing ? "Analyzing…" : "AI Review"}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.primaryBtn} onPress={() => setShow(true)}>
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={st.primaryText}>Add policy</Text>
        </TouchableOpacity>
      </View>

      {review && (
        <View style={st.reviewCard}>
          <Text style={st.reviewScore}>Health score: {review.health_score}/100</Text>
          <Text style={st.reviewSummary}>{review.summary}</Text>
        </View>
      )}

      <FlatList
        data={policies}
        renderItem={renderItem}
        keyExtractor={(i) => i.policy_id}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={<Text style={st.empty}>No policies yet. Add your first to build your coverage map.</Text>}
      />

      <Modal visible={show} animationType="slide" transparent onRequestClose={() => setShow(false)}>
        <View style={st.modalWrap}>
          <View style={st.modal}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 12 }}>
              <Text style={st.modalTitle}>Add policy</Text>
              <TouchableOpacity onPress={() => setShow(false)}><Ionicons name="close" size={22} color={theme.text} /></TouchableOpacity>
            </View>
            <ScrollView>
              {[
                ["Provider *", "provider"],
                ["Type (e.g. life_term)", "policy_type"],
                ["Sum assured", "sum_assured"],
                ["Nominee name", "nominee_name"],
                ["Claim contact", "claim_contact"],
              ].map(([label, key]) => (
                <View key={key}>
                  <Text style={st.label}>{label.toUpperCase()}</Text>
                  <TextInput style={st.input} value={form[key]} onChangeText={(v) => setForm((f) => ({ ...f, [key]: v }))} placeholderTextColor={theme.muted} />
                </View>
              ))}
              <TouchableOpacity style={[st.primaryBtn, { justifyContent: "center", marginTop: 16 }]} onPress={add}>
                <Text style={st.primaryText}>Save policy</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  actions: { flexDirection: "row", gap: 8, padding: 12, borderBottomColor: theme.border, borderBottomWidth: 1 },
  outlineBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderColor: theme.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  outlineText: { color: theme.text, fontWeight: "600", fontSize: 13 },
  primaryBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: theme.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  reviewCard: { margin: 16, marginBottom: 0, backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 12, padding: 16 },
  reviewScore: { color: theme.primary, fontWeight: "800", fontSize: 16 },
  reviewSummary: { color: theme.muted, fontSize: 13, marginTop: 6 },
  card: { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 12 },
  type: { color: theme.primary, fontSize: 11, letterSpacing: 1, textTransform: "uppercase" },
  provider: { color: theme.text, fontSize: 18, fontWeight: "800", marginBottom: 6 },
  row: { color: theme.muted, fontSize: 13, marginTop: 2 },
  empty: { color: theme.muted, textAlign: "center", marginTop: 40 },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modal: { backgroundColor: theme.card, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, maxHeight: "85%" },
  modalTitle: { color: theme.text, fontSize: 20, fontWeight: "800" },
  label: { color: theme.muted, fontSize: 11, letterSpacing: 1, marginTop: 12, marginBottom: 5 },
  input: { backgroundColor: theme.bg, borderColor: theme.border, borderWidth: 1, borderRadius: 8, color: theme.text, paddingHorizontal: 12, paddingVertical: 10 },
});
