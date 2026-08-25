import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api";
import { theme } from "../theme";

const money = (v, cur) => (v == null || isNaN(Number(v)) ? "—" : `${cur ? cur + " " : ""}${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

export default function InsightsScreen() {
  const [docs, setDocs] = useState([]);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [r, setR] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/documents");
      const priority = ["bank_statement", "credit_card_statement", "financial", "investment"];
      const sorted = [...data].sort((a, b) => priority.indexOf(b.category) - priority.indexOf(a.category));
      setDocs(sorted);
      if (sorted.length && !selected) setSelected(sorted[0].document_id);
    } catch {}
  }, [selected]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const analyze = async () => {
    if (!selected) return Alert.alert("Upload a statement in the Vault first");
    setBusy(true); setR(null);
    try {
      const { data } = await api.post("/insights/statement", { document_id: selected });
      setR(data.result);
    } catch (e) {
      Alert.alert("Analysis failed", e.response?.data?.detail || "Try a clearer statement.");
    } finally { setBusy(false); }
  };

  const cur = r?.currency || "";

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={{ padding: 16 }}>
      <Text style={st.h}>Pick a statement to review</Text>
      <View style={st.pickList}>
        {docs.length === 0 && <Text style={st.muted}>No documents yet — upload a bank/credit statement in the Vault.</Text>}
        {docs.map((d) => (
          <TouchableOpacity key={d.document_id} onPress={() => setSelected(d.document_id)}
            style={[st.pickRow, selected === d.document_id && st.pickActive]}>
            <Ionicons name={selected === d.document_id ? "radio-button-on" : "radio-button-off"} size={18} color={selected === d.document_id ? theme.primary : theme.muted} />
            <Text style={st.pickText} numberOfLines={1}>{d.original_filename}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity style={st.analyzeBtn} onPress={analyze} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <><Ionicons name="sparkles" size={16} color="#fff" /><Text style={st.analyzeText}>Analyze spending</Text></>}
      </TouchableOpacity>

      {r && (
        <View style={{ marginTop: 20 }}>
          <View style={st.statRow}>
            <Stat label="Spend" value={money(r.total_spend, cur)} />
            <Stat label="Income" value={money(r.total_income, cur)} />
            <Stat label="Save" value={money(r.savings_potential, cur)} />
          </View>
          {!!r.summary && <Text style={st.summary}>{r.summary}</Text>}

          <Text style={st.sec}>SPENDING BY CATEGORY</Text>
          {(r.by_category || []).map((c, i) => (
            <View key={i} style={{ marginBottom: 10 }}>
              <View style={st.between}><Text style={st.catName}>{c.category}</Text><Text style={st.muted}>{money(c.amount, cur)}</Text></View>
              <View style={st.track}><View style={[st.fill, { width: `${Math.min(100, c.pct || 0)}%` }]} /></View>
            </View>
          ))}

          <Text style={st.sec}>RECURRING SUBSCRIPTIONS</Text>
          {(r.recurring || []).length === 0 ? <Text style={st.muted}>None detected.</Text> :
            (r.recurring || []).map((s, i) => (
              <View key={i} style={st.between}><Text style={st.catName}>{s.merchant} · {s.frequency}</Text><Text style={st.muted}>{money(s.amount, cur)}</Text></View>
            ))}

          <Text style={st.sec}>ADVICE</Text>
          {(r.advice || []).map((a, i) => <Text key={i} style={st.advice}>• {a}</Text>)}
        </View>
      )}
    </ScrollView>
  );
}

function Stat({ label, value }) {
  return (
    <View style={st.stat}>
      <Text style={st.statVal}>{value}</Text>
      <Text style={st.statLbl}>{label}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  h: { color: theme.muted, fontSize: 11, letterSpacing: 1, marginBottom: 8 },
  pickList: { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 12, padding: 8 },
  pickRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 8 },
  pickActive: { backgroundColor: theme.bg },
  pickText: { color: theme.text, flex: 1 },
  muted: { color: theme.muted, fontSize: 13, padding: 8 },
  analyzeBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: theme.primary, borderRadius: 10, paddingVertical: 14, marginTop: 12 },
  analyzeText: { color: "#fff", fontWeight: "700" },
  statRow: { flexDirection: "row", gap: 10 },
  stat: { flex: 1, backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 12, padding: 14, alignItems: "center" },
  statVal: { color: theme.text, fontWeight: "900", fontSize: 16 },
  statLbl: { color: theme.muted, fontSize: 10, letterSpacing: 1, marginTop: 4 },
  summary: { color: theme.muted, fontSize: 13, marginTop: 14, lineHeight: 19 },
  sec: { color: theme.muted, fontSize: 11, letterSpacing: 1, marginTop: 20, marginBottom: 10 },
  between: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  catName: { color: theme.text, fontSize: 13 },
  track: { height: 8, backgroundColor: theme.card, borderRadius: 4, overflow: "hidden" },
  fill: { height: 8, backgroundColor: theme.primary },
  advice: { color: theme.text, fontSize: 13, marginBottom: 6, lineHeight: 19 },
});
