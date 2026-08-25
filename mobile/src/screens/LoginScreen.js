import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api, errMsg } from "../api";
import { useAuth } from "../AuthContext";
import { theme } from "../theme";

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();

  const submit = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/auth/login", { email: email.trim(), password });
      await login(data);
    } catch (e) {
      Alert.alert("Sign in failed", errMsg(e.response?.data?.detail, e.message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.brand}>
          <Ionicons name="shield-checkmark" size={28} color={theme.primary} />
          <Text style={s.brandText}>EVERKIN</Text>
        </View>
        <Text style={s.title}>Sign in</Text>
        <Text style={s.subtitle}>Access your secure financial vault</Text>

        <Text style={s.label}>EMAIL</Text>
        <TextInput style={s.input} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} placeholderTextColor={theme.muted} placeholder="you@example.com" />
        <Text style={s.label}>PASSWORD</Text>
        <TextInput style={s.input} secureTextEntry value={password} onChangeText={setPassword} placeholderTextColor={theme.muted} placeholder="••••••••" />

        <TouchableOpacity style={s.btn} onPress={submit} disabled={busy}>
          <Text style={s.btnText}>{busy ? "Signing in…" : "Sign in"}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate("Register")} style={{ marginTop: 20 }}>
          <Text style={s.link}>No account? <Text style={{ color: theme.primary }}>Create one</Text></Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  scroll: { padding: 24, paddingTop: 80, flexGrow: 1 },
  brand: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 40 },
  brandText: { color: theme.text, fontWeight: "900", fontSize: 20, letterSpacing: 1 },
  title: { color: theme.text, fontSize: 32, fontWeight: "900" },
  subtitle: { color: theme.muted, fontSize: 14, marginTop: 4, marginBottom: 28 },
  label: { color: theme.muted, fontSize: 11, letterSpacing: 1, marginBottom: 6, marginTop: 14 },
  input: { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, color: theme.text, fontSize: 15 },
  btn: { backgroundColor: theme.primary, borderRadius: 8, paddingVertical: 14, alignItems: "center", marginTop: 28 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  link: { color: theme.muted, textAlign: "center", fontSize: 14 },
});
