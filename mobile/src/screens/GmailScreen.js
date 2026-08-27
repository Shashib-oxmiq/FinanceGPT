import React, { useEffect, useState, useCallback } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { theme } from "../theme";

export default function GmailScreen() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  const connect = async () => {
    if (!email || !password) { Alert.alert("Missing", "Enter email and app password"); return; }
    setLoading(true);
    try {
      // In local mode, we can't do IMAP directly — would need a backend
      Alert.alert("Info", "Gmail IMAP requires the backend server. Use remote mode to scan emails.");
    } catch (e) { Alert.alert("Error", e.message); }
    finally { setLoading(false); }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t("page.gmail.title")}</Text>
        <Text style={styles.subtitle}>{t("page.gmail.subtitle")}</Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Connect with App Password</Text>
        <TextInput style={styles.input} placeholder="Gmail address" placeholderTextColor={theme.muted} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        <TextInput style={styles.input} placeholder="App Password" placeholderTextColor={theme.muted} value={password} onChangeText={setPassword} secureTextEntry />
        <TouchableOpacity style={styles.connectBtn} onPress={connect} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.connectText}>Connect & Scan</Text>}
        </TouchableOpacity>
        <Text style={styles.help}>Use a Gmail App Password (not your regular password). Enable 2FA → generate App Password in Google Account settings.</Text>
      </View>
    </View>
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
  connectBtn: { backgroundColor: theme.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  connectText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  help: { fontSize: 12, color: theme.muted, marginTop: 12, lineHeight: 18 },
});