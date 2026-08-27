import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { theme } from "../theme";

export default function LoginScreen({ navigation }) {
  const { t } = useLanguage();
  const { login, loginAsGuest } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    setLoading(true); setError("");
    try { await login(email, password); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.logo}>
          <Text style={styles.logoText}>Everkin</Text>
          <Text style={styles.tagline}>{t("app.tagline")}</Text>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <TextInput style={styles.input} placeholder="Email" placeholderTextColor={theme.muted} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        <TextInput style={styles.input} placeholder="Password" placeholderTextColor={theme.muted} value={password} onChangeText={setPassword} secureTextEntry />
        <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign In</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate("Register")}>
          <Text style={styles.link}>Don't have an account? Register</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={loginAsGuest} style={styles.guestBtn}>
          <Text style={styles.guestText}>Continue as Guest</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  scroll: { flexGrow: 1, justifyContent: "center", padding: 24 },
  logo: { alignItems: "center", marginBottom: 32 },
  logoText: { fontSize: 32, fontWeight: "800", color: theme.primary },
  tagline: { fontSize: 14, color: theme.muted, marginTop: 4 },
  input: { backgroundColor: theme.input, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: theme.text, marginBottom: 12, borderWidth: 1, borderColor: theme.border },
  button: { backgroundColor: theme.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginBottom: 12 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  link: { color: theme.primary, textAlign: "center", fontSize: 14, marginTop: 8 },
  guestBtn: { marginTop: 20, padding: 12, borderWidth: 1, borderColor: theme.border, borderRadius: 12, alignItems: "center" },
  guestText: { color: theme.muted, fontSize: 14 },
  error: { color: theme.destructive, fontSize: 14, marginBottom: 12, textAlign: "center" },
});