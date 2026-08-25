import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, Alert, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api, errMsg } from "../api";
import { useAuth } from "../AuthContext";
import { theme } from "../theme";
import { s } from "./LoginScreen";

export default function RegisterScreen({ navigation }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();

  const submit = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/auth/register", { name: name.trim(), email: email.trim(), password });
      await login(data);
    } catch (e) {
      Alert.alert("Sign up failed", errMsg(e.response?.data?.detail, e.message));
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
        <Text style={s.title}>Create account</Text>
        <Text style={s.subtitle}>Start building your secure vault</Text>

        <Text style={s.label}>FULL NAME</Text>
        <TextInput style={s.input} value={name} onChangeText={setName} placeholderTextColor={theme.muted} placeholder="Jane Doe" />
        <Text style={s.label}>EMAIL</Text>
        <TextInput style={s.input} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} placeholderTextColor={theme.muted} placeholder="you@example.com" />
        <Text style={s.label}>PASSWORD</Text>
        <TextInput style={s.input} secureTextEntry value={password} onChangeText={setPassword} placeholderTextColor={theme.muted} placeholder="At least 6 characters" />

        <TouchableOpacity style={s.btn} onPress={submit} disabled={busy}>
          <Text style={s.btnText}>{busy ? "Creating…" : "Create account"}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate("Login")} style={{ marginTop: 20 }}>
          <Text style={s.link}>Already have an account? <Text style={{ color: theme.primary }}>Sign in</Text></Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
