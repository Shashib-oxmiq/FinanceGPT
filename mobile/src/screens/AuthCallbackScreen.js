// ── AuthCallback Screen ──────────────────────────────────────────────────────
// Handles OAuth callback redirect (Google sign-in)
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../theme";

export default function AuthCallbackScreen({ route, navigation }) {
  const [status, setStatus] = useState("processing");

  useEffect(() => {
    // Parse token from params or URL
    const token = route?.params?.token || route?.params?.access_token;
    const userId = route?.params?.user_id;

    if (token && userId) {
      // Save token and redirect
      (async () => {
        try {
          const { SecureStoreShim } = await import("../services/platform");
          await SecureStoreShim.setItemAsync("auth_token", token);
          await SecureStoreShim.setItemAsync("user_id", userId);
          setStatus("success");
          setTimeout(() => navigation.navigate("Main"), 1000);
        } catch (e) {
          setStatus("error");
        }
      })();
    } else {
      // No token found — redirect to login after showing message
      setStatus("error");
      setTimeout(() => navigation.navigate("Login"), 2000);
    }
  }, []);

  return (
    <View style={styles.container}>
      {status === "processing" && <>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={styles.text}>Completing sign in…</Text>
      </>}
      {status === "success" && <>
        <Ionicons name="checkmark-circle" size={48} color={theme.accent} />
        <Text style={styles.text}>Sign in successful!</Text>
      </>}
      {status === "error" && <>
        <Ionicons name="close-circle" size={48} color={theme.destructive} />
        <Text style={styles.text}>Sign in failed. Redirecting…</Text>
      </>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background, justifyContent: "center", alignItems: "center", gap: 16 },
  text: { fontSize: 16, color: theme.textSecondary, fontWeight: "600" },
});