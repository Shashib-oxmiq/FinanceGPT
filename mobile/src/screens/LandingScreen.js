// ── Landing Screen ───────────────────────────────────────────────────────────
// Pre-login landing page with marketing content
import React from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { theme } from "../theme";

export default function LandingScreen({ navigation }) {
  const { t } = useLanguage();
  const { loginAsDemo } = useAuth();

  const features = [
    { icon: "chatbubbles", title: "AI Advisor", desc: "Chat with your personal AI for money, insurance, and life decisions" },
    { icon: "trending-up", title: "Investments", desc: "Track your portfolio with live stock prices and ROI" },
    { icon: "shield-checkmark", title: "Insurance", desc: "Manage all your policies in one secure place" },
    { icon: "folder", title: "Document Vault", desc: "Securely store and organize important documents" },
    { icon: "document-text", title: "100+ Indian Forms", desc: "Find and prepare government forms with checklists" },
    { icon: "create", title: "Legal Documents", desc: "Generate rental agreements, NDAs, wills, and more" },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ flexGrow: 1 }}>
      <View style={styles.hero}>
        <Text style={styles.logo}>Everkin</Text>
        <Text style={styles.tagline}>{t("app.tagline")}</Text>
        <Text style={styles.heroDesc}>Your AI-powered life advisor for money, insurance, property, legal matters, and everything that matters.</Text>
        <View style={styles.heroButtons}>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.navigate("Register")}>
            <Text style={styles.primaryBtnText}>Get Started</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => navigation.navigate("Login")}>
            <Text style={styles.secondaryBtnText}>Sign In</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.demoBtn} onPress={loginAsDemo}>
          <Ionicons name="sparkles" size={16} color={theme.accent} />
          <Text style={styles.demoBtnText}>Try Demo Account (Pre-loaded Data)</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.featuresSection}>
        <Text style={styles.featuresTitle}>Everything in one place</Text>
        {features.map((f, i) => (
          <View key={i} style={styles.featureCard}>
            <View style={styles.featureIcon}><Ionicons name={f.icon} size={22} color={theme.primary} /></View>
            <View style={styles.featureInfo}>
              <Text style={styles.featureTitle}>{f.title}</Text>
              <Text style={styles.featureDesc}>{f.desc}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.bottomCTA}>
        <Text style={styles.bottomTitle}>Ready to take control?</Text>
        <TouchableOpacity style={styles.ctaBtn} onPress={() => navigation.navigate("Register")}>
          <Text style={styles.ctaText}>Create Free Account</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  hero: { padding: 24, paddingTop: 80, alignItems: "center" },
  logo: { fontSize: 40, fontWeight: "900", color: theme.primary },
  tagline: { fontSize: 16, color: theme.textSecondary, marginTop: 4, fontWeight: "600" },
  heroDesc: { fontSize: 15, color: theme.muted, marginTop: 16, textAlign: "center", lineHeight: 22, maxWidth: 320 },
  heroButtons: { flexDirection: "row", gap: 12, marginTop: 24 },
  primaryBtn: { backgroundColor: theme.primary, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 28, alignItems: "center" },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  secondaryBtn: { borderWidth: 1, borderColor: theme.border, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 28, alignItems: "center" },
  secondaryBtnText: { color: theme.text, fontSize: 16, fontWeight: "600" },
  featuresSection: { padding: 20, paddingTop: 40 },
  featuresTitle: { fontSize: 22, fontWeight: "800", color: theme.text, textAlign: "center", marginBottom: 20 },
  featureCard: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: theme.card, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: theme.border },
  featureIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: theme.primary + "15", justifyContent: "center", alignItems: "center" },
  featureInfo: { flex: 1 },
  featureTitle: { fontSize: 15, fontWeight: "700", color: theme.text },
  featureDesc: { fontSize: 13, color: theme.muted, marginTop: 4, lineHeight: 18 },
  bottomCTA: { padding: 24, paddingTop: 40, alignItems: "center", paddingBottom: 60 },
  bottomTitle: { fontSize: 20, fontWeight: "800", color: theme.text, marginBottom: 16 },
  ctaBtn: { backgroundColor: theme.primary, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 36, alignItems: "center" },
  ctaText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  demoBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 16, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: theme.accent + "40", backgroundColor: theme.accent + "10" },
  demoBtnText: { fontSize: 14, color: theme.accent, fontWeight: "600" },
});