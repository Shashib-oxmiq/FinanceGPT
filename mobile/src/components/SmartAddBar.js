// ── SmartAddBar Component ────────────────────────────────────────────────────
// AI-powered natural-language data entry — same as web app's SmartAddBar
import React, { useState, useRef } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Animated } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { complete } from "../services/ai";
import { api } from "../services/api";
import { theme } from "../theme";

export default function SmartAddBar({ context, onSaved }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const handleSubmit = async () => {
    if (!text.trim() || loading || !user) return;
    setLoading(true);
    setResult(null);
    try {
      const sys = `You are a financial data assistant. The user is on the "${context}" page. ` +
        `Extract structured data from their natural language input and save it. ` +
        `Respond with a JSON object: {"save_target": "investment|insurance|contact|profile|life_event|reminder|form_fill", "data": {...}, "message": "confirmation message"}. ` +
        `If the input is an action (not a save), use {"save_target": "action", "action": "loan_prep|bundle|form_fill", "data": {...}, "message": "..."}. ` +
        `Be concise. Use the user's language.`;
      const resp = await complete(sys, text.trim(), "qwen3.8-27b");
      // Try to parse JSON from response
      let parsed;
      try {
        const jsonMatch = resp.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { message: resp };
      } catch { parsed = { message: resp }; }

      // Save to DB if it's a save target
      if (parsed.save_target && parsed.save_target !== "action" && parsed.data) {
        const target = parsed.save_target;
        if (target === "investment") await api.addInvestment(user.user_id, parsed.data);
        else if (target === "insurance") await api.addInsurance(user.user_id, parsed.data);
        else if (target === "reminder") await api.addReminder(user.user_id, parsed.data);
        else if (target === "contact") await api.addContact(user.user_id, parsed.data);
      }
      setResult(parsed.message || "Done!");
      setText("");
      if (onSaved) onSaved();
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      setTimeout(() => Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(), 3000);
    } catch (e) {
      setResult("Error: " + e.message);
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.bar}>
        <Ionicons name="sparkles" size={18} color={theme.primary} style={{ marginLeft: 4 }} />
        <TextInput
          style={styles.input}
          placeholder={t("smart_add.placeholder") || `Tell AI to add ${context}…`}
          placeholderTextColor={theme.muted}
          value={text}
          onChangeText={setText}
          onSubmitEditing={handleSubmit}
          returnKeyType="done"
          editable={!loading}
        />
        <TouchableOpacity style={styles.sendBtn} onPress={handleSubmit} disabled={loading || !text.trim()}>
          {loading ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="add" size={20} color="#fff" />}
        </TouchableOpacity>
      </View>
      {result && (
        <Animated.View style={[styles.result, { opacity: fadeAnim }]}>
          <Ionicons name="checkmark-circle" size={16} color={theme.accent} />
          <Text style={styles.resultText}>{result}</Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingVertical: 8 },
  bar: { flexDirection: "row", alignItems: "center", backgroundColor: theme.card, borderRadius: 16, borderWidth: 1, borderColor: theme.border, paddingRight: 6, gap: 8 },
  input: { flex: 1, paddingVertical: 12, fontSize: 14, color: theme.text, maxHeight: 60 },
  sendBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.primary, justifyContent: "center", alignItems: "center" },
  result: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.accent + "15", borderRadius: 10 },
  resultText: { flex: 1, fontSize: 13, color: theme.accent, fontWeight: "500" },
});