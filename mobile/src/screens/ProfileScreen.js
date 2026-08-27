import React, { useState } from "react";
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { theme } from "../theme";
import LanguageSwitcher from "../components/LanguageSwitcher";

export default function ProfileScreen({ navigation }) {
  const { t } = useLanguage();
  const { user, updateProfile, logout } = useAuth();
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
      {/* Header with back button */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
      </View>

      {/* Avatar + name */}
      <View style={styles.profileSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(user?.name || "U").slice(0, 1).toUpperCase()}</Text>
        </View>
        <Text style={styles.profileName}>{user?.name || "User"}</Text>
        <Text style={styles.profileEmail}>{user?.email}</Text>
      </View>

      {/* Profile completeness */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Profile Completeness</Text>
        {(() => {
          const fields = [user?.name, user?.email, phone, dob, address, income];
          const filled = fields.filter((f) => f && String(f).trim()).length;
          const pct = Math.round((filled / fields.length) * 100);
          return (
            <View>
              <View style={styles.completenessBar}>
                <View style={[styles.completenessFill, { width: `${pct}%` }]} />
              </View>
              <Text style={styles.completenessText}>
                {pct === 100 ? "✅ Your profile is complete! The AI can give you better advice with complete info." : `${pct}% complete — fill in more details for better AI assistance.`}
              </Text>
            </View>
          );
        })()}
      </View>

      {/* Personal Info */}
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

      {/* Language — dropdown, not grid */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Language</Text>
        <Text style={styles.sectionHint}>You can also change language by asking the AI advisor in chat.</Text>
        <View style={{ marginTop: 8 }}>
          <LanguageSwitcher />
        </View>
      </View>

      {/* Logout */}
      <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
        <Ionicons name="log-out" size={18} color={theme.destructive} />
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingTop: 50, paddingBottom: 8 },
  backBtn: { padding: 8, borderRadius: 12 },
  // Profile
  profileSection: { alignItems: "center", paddingVertical: 16 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: theme.primary + "20", justifyContent: "center", alignItems: "center", marginBottom: 12 },
  avatarText: { fontSize: 28, fontWeight: "800", color: theme.primary },
  profileName: { fontSize: 20, fontWeight: "700", color: theme.text },
  profileEmail: { fontSize: 14, color: theme.muted, marginTop: 2 },
  // Sections
  section: { paddingHorizontal: 20, paddingVertical: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: theme.text, marginBottom: 8 },
  sectionHint: { fontSize: 12, color: theme.muted, marginBottom: 4 },
  completenessBar: { height: 8, backgroundColor: theme.border, borderRadius: 4, marginBottom: 8, overflow: "hidden" },
  completenessFill: { height: 8, backgroundColor: theme.accent, borderRadius: 4 },
  completenessText: { fontSize: 12, color: theme.muted, lineHeight: 18 },
  input: { backgroundColor: theme.input, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text, marginBottom: 10, borderWidth: 1, borderColor: theme.border },
  saveBtn: { backgroundColor: theme.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  saveText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  logoutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginHorizontal: 20, marginBottom: 20, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: theme.destructive + "40" },
  logoutText: { color: theme.destructive, fontSize: 15, fontWeight: "600" },
});