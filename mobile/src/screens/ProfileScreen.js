import React, { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { theme } from "../theme";

export default function ProfileScreen() {
  const { t } = useLanguage();
  const { user, updateProfile, logout } = useAuth();
  const { lang, changeLang, languages } = useLanguage();
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.profile?.phone || "");
  const [dob, setDob] = useState(user?.profile?.dob || "");
  const [address, setAddress] = useState(user?.profile?.address || "");
  const [income, setIncome] = useState(user?.profile?.income || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try { await updateProfile({ phone, dob, address, income }); }
    catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={styles.header}>
        <Text style={styles.title}>{t("page.profile.title")}</Text>
        <Text style={styles.subtitle}>{t("page.profile.subtitle")}</Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Personal Info</Text>
        <TextInput style={styles.input} placeholder="Name" placeholderTextColor={theme.muted} value={name} onChangeText={setName} />
        <TextInput style={styles.input} placeholder="Phone" placeholderTextColor={theme.muted} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <TextInput style={styles.input} placeholder="Date of Birth" placeholderTextColor={theme.muted} value={dob} onChangeText={setDob} />
        <TextInput style={styles.input} placeholder="Address" placeholderTextColor={theme.muted} value={address} onChangeText={setAddress} multiline />
        <TextInput style={styles.input} placeholder="Annual Income" placeholderTextColor={theme.muted} value={income} onChangeText={setIncome} keyboardType="decimal-pad" />
        <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>{t("button.save")}</Text>}
        </TouchableOpacity>
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Language</Text>
        <View style={styles.langGrid}>
          {languages.map((l) => (
            <TouchableOpacity key={l.code} style={[styles.langChip, lang === l.code && styles.langChipActive]} onPress={() => changeLang(l.code)}>
              <Text style={styles.langFlag}>{l.flag}</Text>
              <Text style={[styles.langName, lang === l.code && styles.langNameActive]}>{l.native}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
        <Ionicons name="log-out" size={18} color={theme.destructive} />
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: { padding: 20, paddingTop: 60 },
  title: { fontSize: 24, fontWeight: "800", color: theme.text },
  subtitle: { fontSize: 14, color: theme.muted, marginTop: 4 },
  section: { padding: 20 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: theme.text, marginBottom: 12 },
  input: { backgroundColor: theme.input, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text, marginBottom: 10, borderWidth: 1, borderColor: theme.border },
  saveBtn: { backgroundColor: theme.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  saveText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  langGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  langChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border },
  langChipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  langFlag: { fontSize: 16 },
  langName: { fontSize: 12, color: theme.textSecondary },
  langNameActive: { color: "#fff", fontWeight: "600" },
  logoutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginHorizontal: 20, marginBottom: 20, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: theme.destructive + "40" },
  logoutText: { color: theme.destructive, fontSize: 15, fontWeight: "600" },
});