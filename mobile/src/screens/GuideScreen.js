import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Linking, Modal } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import { api } from "../api";
import { BACKEND_URL } from "../config";
import { theme } from "../theme";

const TYPES = ["health", "life", "auto", "home", "travel", "critical illness"];

export default function GuideScreen() {
  const [type, setType] = useState("health");
  const [docs, setDocs] = useState([]);
  const [docId, setDocId] = useState("");
  const [busy, setBusy] = useState(false);
  const [r, setR] = useState(null);
  const [speaking, setSpeaking] = useState(false);
  const [sound, setSound] = useState(null);
  const [incident, setIncident] = useState(false);

  const load = useCallback(async () => {
    try { const { data } = await api.get("/documents?category=insurance"); setDocs(data); } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); return () => { sound && sound.unloadAsync(); }; }, [load]));

  const analyze = async () => {
    setBusy(true); setR(null);
    try {
      const { data } = await api.post("/insurance/analyze", { insurance_type: type, document_id: docId || null });
      setR(data);
    } catch (e) { Alert.alert("Analysis failed", e.response?.data?.detail || "Try again"); }
    finally { setBusy(false); }
  };

  const listen = async () => {
    if (!r) return;
    setSpeaking(true);
    const text = [
      `Here is your ${r.policy_type || type} policy guide.`, r.summary,
      "Covered: " + (r.covered || []).map((c) => c.item).join(", "),
      "Not covered: " + (r.not_covered || []).join(". "),
      "During an incident, do: " + (r.dos || []).join(". "),
      "Do not: " + (r.donts || []).join(". "),
    ].filter(Boolean).join(". ");
    try {
      const { data } = await api.post("/tts", { text });
      const { sound: s } = await Audio.Sound.createAsync({ uri: `${BACKEND_URL}${data.url}` }, { shouldPlay: true });
      setSound(s);
    } catch { Alert.alert("Voice failed"); }
    finally { setSpeaking(false); }
  };

  const call = (num) => Linking.openURL(`tel:${String(num).replace(/[^0-9+]/g, "")}`);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={{ padding: 16 }}>
      <Text style={st.h}>Insurance type</Text>
      <View style={st.chips}>
        {TYPES.map((t) => (
          <TouchableOpacity key={t} onPress={() => setType(t)} style={[st.chip, type === t && st.chipOn]}>
            <Text style={[st.chipTxt, type === t && { color: "#fff" }]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {docs.length > 0 && (
        <>
          <Text style={st.h}>Use a document (optional)</Text>
          <View style={st.chips}>
            <TouchableOpacity onPress={() => setDocId("")} style={[st.chip, !docId && st.chipOn]}><Text style={[st.chipTxt, !docId && { color: "#fff" }]}>General</Text></TouchableOpacity>
            {docs.map((d) => (
              <TouchableOpacity key={d.document_id} onPress={() => setDocId(d.document_id)} style={[st.chip, docId === d.document_id && st.chipOn]}>
                <Text style={[st.chipTxt, docId === d.document_id && { color: "#fff" }]} numberOfLines={1}>{d.original_filename}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      <TouchableOpacity style={st.analyze} onPress={analyze} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <><Ionicons name="sparkles" size={16} color="#fff" /><Text style={st.analyzeTxt}>Analyze policy</Text></>}
      </TouchableOpacity>

      {r && (
        <View style={{ marginTop: 18 }}>
          <View style={st.row}>
            <TouchableOpacity style={st.incidentBtn} onPress={() => setIncident(true)}>
              <Ionicons name="warning" size={18} color="#fff" />
              <Text style={st.incidentTxt}>I'm in an incident</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.listen} onPress={listen} disabled={speaking}>
              <Ionicons name="volume-high" size={18} color={theme.primary} />
              <Text style={{ color: theme.primary, fontWeight: "700" }}>{speaking ? "…" : "Listen"}</Text>
            </TouchableOpacity>
          </View>
          {!!r.summary && <Text style={st.summary}>{r.summary}</Text>}
          <Section title="Covered (with conditions)" items={(r.covered || []).map((c) => `${c.item}${c.conditions ? " — " + c.conditions : ""}`)} />
          <Section title="Not covered" items={r.not_covered} />
          <Section title="Corner cases" items={r.corner_cases} />
          <Section title="How to claim" items={r.claim_steps} />
        </View>
      )}

      <Modal visible={incident} animationType="slide" onRequestClose={() => setIncident(false)}>
        <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={{ padding: 20, paddingTop: 60 }}>
          <View style={st.rowBetween}>
            <Text style={st.incidentH}>Incident Mode</Text>
            <TouchableOpacity onPress={() => setIncident(false)}><Ionicons name="close" size={26} color={theme.text} /></TouchableOpacity>
          </View>
          <Text style={st.incidentSub}>Stay calm. Call the right number, then follow these steps.</Text>

          <Text style={st.blockH}>CALL NOW</Text>
          {(r?.emergency_numbers || []).map((e, i) => (
            <TouchableOpacity key={i} style={st.callBtn} onPress={() => call(e.number)}>
              <Ionicons name="call" size={18} color="#fff" />
              <Text style={st.callTxt}>{e.label}: {e.number}</Text>
            </TouchableOpacity>
          ))}
          {(!r?.emergency_numbers || r.emergency_numbers.length === 0) && <Text style={st.muted}>No numbers on file. Add your policy for exact helplines.</Text>}

          <Text style={[st.blockH, { color: theme.accent }]}>DO</Text>
          {(r?.dos || []).map((d, i) => <Text key={i} style={st.li}>✓ {d}</Text>)}
          <Text style={[st.blockH, { color: theme.danger }]}>DON'T</Text>
          {(r?.donts || []).map((d, i) => <Text key={i} style={st.li}>✕ {d}</Text>)}
        </ScrollView>
      </Modal>
    </ScrollView>
  );
}

function Section({ title, items }) {
  if (!items || items.length === 0) return null;
  return (
    <View style={st.section}>
      <Text style={st.sectionH}>{title}</Text>
      {items.map((it, i) => <Text key={i} style={st.li}>• {it}</Text>)}
    </View>
  );
}

const st = StyleSheet.create({
  h: { color: theme.muted, fontSize: 11, letterSpacing: 1, marginBottom: 8, marginTop: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderColor: theme.border, borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, maxWidth: 220 },
  chipOn: { backgroundColor: theme.primary, borderColor: theme.primary },
  chipTxt: { color: theme.muted, fontSize: 12, fontWeight: "600" },
  analyze: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: theme.primary, borderRadius: 10, paddingVertical: 14, marginTop: 16 },
  analyzeTxt: { color: "#fff", fontWeight: "700" },
  row: { flexDirection: "row", gap: 10 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  incidentBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: theme.danger, borderRadius: 10, paddingVertical: 12 },
  incidentTxt: { color: "#fff", fontWeight: "800" },
  listen: { flexDirection: "row", alignItems: "center", gap: 6, borderColor: theme.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  summary: { color: theme.muted, fontSize: 14, lineHeight: 20, marginTop: 14 },
  section: { marginTop: 16 },
  sectionH: { color: theme.text, fontSize: 13, fontWeight: "800", letterSpacing: 0.5, marginBottom: 6 },
  li: { color: theme.muted, fontSize: 13, lineHeight: 20, marginBottom: 4 },
  incidentH: { color: theme.danger, fontSize: 26, fontWeight: "900" },
  incidentSub: { color: theme.muted, fontSize: 14, marginTop: 4, marginBottom: 16 },
  blockH: { color: theme.text, fontSize: 12, letterSpacing: 1, fontWeight: "800", marginTop: 20, marginBottom: 8 },
  callBtn: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: theme.danger, borderRadius: 10, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 8 },
  callTxt: { color: "#fff", fontWeight: "700", fontSize: 15 },
  muted: { color: theme.muted, fontSize: 13 },
});
