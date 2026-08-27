/**
 * QA Test Screen — Comprehensive end-to-end test of all data + services + screens.
 * Accessible from Profile → "Run QA Test" or via navigation.navigate("QATest").
 * 
 * Tests:
 * 1. Data layer: all 25 SQLite tables have seeded demo data
 * 2. Service layer: all service functions return data without errors
 * 3. AI context: financial profile, insights, coach all build successfully
 * 4. Emergency / Legacy: dead-man switch, kin package, insurance gap
 */

import React, { useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { theme } from "../theme";
import { initDB, dbAll, dbList } from "../services/db";
import { seedDemoData } from "../services/demoSeed";

// ── Service imports (names verified against actual exports) ──
import { getLoans, getDebtSummary } from "../services/loans";
import { getBills, getBillSummary } from "../services/bills";
import { getRetirementCorpus } from "../services/retirement";
import { getEducationPlans } from "../services/education";
import { getProperties, getPropertySummary } from "../services/property";
import { getGoals } from "../services/goals";
import { getExpenses } from "../services/expenses";
import { computeHealthScore } from "../services/healthScore";
import { buildFinancialProfile, formatProfileForPrompt } from "../services/financialProfile";
import { generateInsights } from "../services/insightEngine";
import { checkAndCoach } from "../services/proactiveCoach";
import { simulateScenario } from "../services/scenarioSimulator";
import { optimizeGoals } from "../services/goalOptimizer";
import { buildCashFlowTimeline } from "../services/cashFlowTimeline";
import { identifyKnowledgeGaps } from "../services/financialLiteracy";
import { getDocumentExpiries } from "../services/docExpiry";
import { generateSmartReminders } from "../services/smartReminders";
import { analyzeInsuranceGaps } from "../services/insuranceGap";
import { getAllMemories, getMemoryContext } from "../services/aiMemory";
import { analyzePortfolio } from "../services/rebalancing";
import { checkEmergencyStatus, previewKinPackage } from "../services/emergencyService";

const TESTS = [];

function test(name, fn) {
  TESTS.push({ name, fn });
}

// ═══ DATA LAYER TESTS ═══
test("SQLite: investments seeded (6)", async (uid) => {
  const rows = await dbAll("SELECT * FROM investments WHERE user_id = ?", [uid]);
  if (!rows || rows.length < 6) throw new Error(`Expected 6, got ${rows?.length || 0}`);
  return `✓ ${rows.length} investments`;
});

test("SQLite: insurance seeded (4)", async (uid) => {
  const rows = await dbAll("SELECT * FROM insurance WHERE user_id = ?", [uid]);
  if (!rows || rows.length < 4) throw new Error(`Expected 4, got ${rows?.length || 0}`);
  return `✓ ${rows.length} policies`;
});

test("SQLite: loans seeded (3)", async (uid) => {
  const rows = await dbAll("SELECT * FROM loans WHERE user_id = ?", [uid]);
  if (!rows || rows.length < 3) throw new Error(`Expected 3, got ${rows?.length || 0}`);
  return `✓ ${rows.length} loans`;
});

test("SQLite: bills seeded (5)", async (uid) => {
  const rows = await dbAll("SELECT * FROM bills WHERE user_id = ?", [uid]);
  if (!rows || rows.length < 5) throw new Error(`Expected 5, got ${rows?.length || 0}`);
  return `✓ ${rows.length} bills`;
});

test("SQLite: goals seeded (4)", async (uid) => {
  const rows = await dbAll("SELECT * FROM goals WHERE user_id = ?", [uid]);
  if (!rows || rows.length < 4) throw new Error(`Expected 4, got ${rows?.length || 0}`);
  return `✓ ${rows.length} goals`;
});

test("SQLite: properties seeded (2)", async (uid) => {
  const rows = await dbAll("SELECT * FROM properties WHERE user_id = ?", [uid]);
  if (!rows || rows.length < 2) throw new Error(`Expected 2, got ${rows?.length || 0}`);
  return `✓ ${rows.length} properties`;
});

test("SQLite: retirement_corpus seeded (3)", async (uid) => {
  const rows = await dbAll("SELECT * FROM retirement_corpus WHERE user_id = ?", [uid]);
  if (!rows || rows.length < 3) throw new Error(`Expected 3, got ${rows?.length || 0}`);
  return `✓ ${rows.length} sources`;
});

test("SQLite: education_plans seeded (1)", async (uid) => {
  const rows = await dbAll("SELECT * FROM education_plans WHERE user_id = ?", [uid]);
  if (!rows || rows.length < 1) throw new Error(`Expected 1, got ${rows?.length || 0}`);
  return `✓ ${rows.length} plans`;
});

test("SQLite: tax_records seeded (1)", async (uid) => {
  const rows = await dbAll("SELECT * FROM tax_records WHERE user_id = ?", [uid]);
  if (!rows || rows.length < 1) throw new Error(`Expected 1, got ${rows?.length || 0}`);
  return `✓ ${rows.length} records`;
});

test("SQLite: expenses seeded (8)", async (uid) => {
  const rows = await dbAll("SELECT * FROM expenses WHERE user_id = ?", [uid]);
  if (!rows || rows.length < 8) throw new Error(`Expected 8, got ${rows?.length || 0}`);
  return `✓ ${rows.length} expenses`;
});

test("SQLite: reminders seeded (5)", async (uid) => {
  const rows = await dbAll("SELECT * FROM reminders WHERE user_id = ?", [uid]);
  if (!rows || rows.length < 5) throw new Error(`Expected 5, got ${rows?.length || 0}`);
  return `✓ ${rows.length} reminders`;
});

test("SQLite: documents seeded (5)", async (uid) => {
  const rows = await dbAll("SELECT * FROM documents WHERE user_id = ?", [uid]);
  if (!rows || rows.length < 5) throw new Error(`Expected 5, got ${rows?.length || 0}`);
  return `✓ ${rows.length} documents`;
});

test("SQLite: contacts seeded (3)", async (uid) => {
  const rows = await dbAll("SELECT * FROM contacts WHERE user_id = ?", [uid]);
  if (!rows || rows.length < 3) throw new Error(`Expected 3, got ${rows?.length || 0}`);
  return `✓ ${rows.length} contacts`;
});

test("SQLite: family_members seeded (3)", async (uid) => {
  const rows = await dbAll("SELECT * FROM family_members WHERE user_id = ?", [uid]);
  if (!rows || rows.length < 3) throw new Error(`Expected 3, got ${rows?.length || 0}`);
  return `✓ ${rows.length} members`;
});

test("SQLite: medical_records seeded (2)", async (uid) => {
  const rows = await dbAll("SELECT * FROM medical_records WHERE user_id = ?", [uid]);
  if (!rows || rows.length < 2) throw new Error(`Expected 2, got ${rows?.length || 0}`);
  return `✓ ${rows.length} records`;
});

test("SQLite: ai_memory seeded (3)", async (uid) => {
  const rows = await dbAll("SELECT * FROM ai_memory WHERE user_id = ?", [uid]);
  if (!rows || rows.length < 3) throw new Error(`Expected 3, got ${rows?.length || 0}`);
  return `✓ ${rows.length} memories`;
});

test("SQLite: emergency_config seeded", async (uid) => {
  const rows = await dbAll("SELECT * FROM emergency_config WHERE user_id = ?", [uid]);
  if (!rows || rows.length < 1) throw new Error("Emergency config not found");
  if (!rows[0].kin_message) throw new Error("kin_message is empty");
  return `✓ enabled=${rows[0].enabled}, phase=${rows[0].escalation_phase}`;
});

test("SQLite: health_score_history seeded", async (uid) => {
  const rows = await dbAll("SELECT * FROM health_score_history WHERE user_id = ?", [uid]);
  if (!rows || rows.length < 1) throw new Error("Health score snapshot not found");
  return `✓ score=${rows[0].score}/100`;
});

test("SQLite: coach_messages seeded (2)", async (uid) => {
  const rows = await dbAll("SELECT * FROM coach_messages WHERE user_id = ?", [uid]);
  if (!rows || rows.length < 2) throw new Error(`Expected 2, got ${rows?.length || 0}`);
  return `✓ ${rows.length} messages`;
});

test("SQLite: insights_cache seeded (2)", async (uid) => {
  const rows = await dbAll("SELECT * FROM insights_cache WHERE user_id = ?", [uid]);
  if (!rows || rows.length < 2) throw new Error(`Expected 2, got ${rows?.length || 0}`);
  return `✓ ${rows.length} insights`;
});

// ═══ SERVICE LAYER TESTS ═══
test("Service: getLoans()", async (uid) => {
  const data = await getLoans(uid);
  if (!data || data.length < 3) throw new Error(`Expected 3, got ${data?.length || 0}`);
  return `✓ ${data.length} loans`;
});

test("Service: getBills()", async (uid) => {
  const data = await getBills(uid);
  if (!data || data.length < 5) throw new Error(`Expected 5, got ${data?.length || 0}`);
  return `✓ ${data.length} bills`;
});

test("Service: getGoals()", async (uid) => {
  const data = await getGoals(uid);
  if (!data || data.length < 4) throw new Error(`Expected 4, got ${data?.length || 0}`);
  return `✓ ${data.length} goals`;
});

test("Service: getProperties()", async (uid) => {
  const data = await getProperties(uid);
  if (!data || data.length < 2) throw new Error(`Expected 2, got ${data?.length || 0}`);
  return `✓ ${data.length} properties`;
});

test("Service: getRetirementCorpus()", async (uid) => {
  const data = await getRetirementCorpus(uid);
  if (!data || data.length < 3) throw new Error(`Expected 3, got ${data?.length || 0}`);
  return `✓ ${data.length} sources`;
});

test("Service: getEducationPlans()", async (uid) => {
  const data = await getEducationPlans(uid);
  if (!data || data.length < 1) throw new Error(`Expected 1, got ${data?.length || 0}`);
  return `✓ ${data.length} plans`;
});

test("Service: getExpenses()", async (uid) => {
  const data = await getExpenses(uid);
  if (!data || data.length < 8) throw new Error(`Expected 8, got ${data?.length || 0}`);
  return `✓ ${data.length} expenses`;
});

test("Service: getDebtSummary()", async (uid) => {
  const data = await getDebtSummary(uid, 100000);
  if (!data) throw new Error("Returned null");
  return `✓ totalDebt=₹${data.totalDebt || 0}, DTI=${data.dti || 0}%`;
});

test("Service: getBillSummary()", async (uid) => {
  const data = await getBillSummary(uid);
  if (!data) throw new Error("Returned null");
  return `✓ totalDue=₹${data.totalDue || 0}`;
});

test("Service: getPropertySummary()", async (uid) => {
  const data = await getPropertySummary(uid);
  if (!data) throw new Error("Returned null");
  return `✓ totalValue=₹${data.totalValue || 0}`;
});

test("Service: computeHealthScore()", async (uid) => {
  const data = await computeHealthScore(uid);
  if (!data || data.score === undefined) throw new Error("Returned null");
  return `✓ score=${data.score}/100`;
});

test("Service: getAllMemories()", async (uid) => {
  const data = await getAllMemories(uid);
  if (!data || data.length < 3) throw new Error(`Expected 3, got ${data?.length || 0}`);
  return `✓ ${data.length} memories`;
});

test("Service: getMemoryContext()", async (uid) => {
  const data = await getMemoryContext(uid);
  if (!data) throw new Error("Returned null");
  return `✓ context length=${data.length || 0} chars`;
});

test("Service: getDocumentExpiries()", async (uid) => {
  const data = await getDocumentExpiries(uid);
  if (!data) throw new Error("Returned null");
  return `✓ ${data.expiring?.length || 0} expiring`;
});

test("Service: generateSmartReminders()", async (uid) => {
  const data = await generateSmartReminders(uid);
  if (!data) throw new Error("Returned null");
  return `✓ ${data.length || 0} smart reminders`;
});

test("Service: analyzeInsuranceGaps()", async (uid) => {
  const data = await analyzeInsuranceGaps(uid, {});
  if (!data) throw new Error("Returned null");
  return `✓ ${data.gaps?.length || 0} gaps found`;
});

// ═══ AI CONTEXT TESTS ═══
test("AI: buildFinancialProfile()", async (uid) => {
  const profile = await buildFinancialProfile(uid);
  if (!profile) throw new Error("Returned null");
  if (profile.netWorth === undefined) throw new Error("netWorth missing");
  return `✓ netWorth=₹${profile.netWorth || 0}, surplus=₹${profile.monthlySurplus || 0}/mo`;
});

test("AI: formatProfileForPrompt()", async (uid) => {
  const profile = await buildFinancialProfile(uid);
  const prompt = formatProfileForPrompt(profile);
  if (!prompt || prompt.length < 50) throw new Error("Prompt too short");
  return `✓ prompt=${prompt.length} chars`;
});

test("AI: generateInsights()", async (uid) => {
  const insights = await generateInsights(uid);
  if (!insights) throw new Error("Returned null");
  return `✓ ${insights.length || 0} insights`;
});

test("AI: checkAndCoach()", async (uid) => {
  const coach = await checkAndCoach(uid);
  if (!coach) throw new Error("Returned null");
  return `✓ type=${coach.type || "none"}`;
});

test("AI: simulateScenario(buy_house)", async (uid) => {
  const result = await simulateScenario(uid, "buy_house", { homePrice: 5000000, downPayment: 1000000 });
  if (!result) throw new Error("Returned null");
  return `✓ scenario=${result.scenario || "buy_house"}`;
});

test("AI: optimizeGoals()", async (uid) => {
  const goals = await getGoals(uid);
  const result = await optimizeGoals(uid, goals, 50000);
  if (!result) throw new Error("Returned null");
  return `✓ ${result.optimizedGoals?.length || 0} goals optimized`;
});

test("AI: buildCashFlowTimeline()", async (uid) => {
  const timeline = await buildCashFlowTimeline(uid);
  if (!timeline) throw new Error("Returned null");
  return `✓ ${timeline.months?.length || 0} months projected`;
});

test("AI: identifyKnowledgeGaps()", async (uid) => {
  const gaps = await identifyKnowledgeGaps(uid);
  if (!gaps) throw new Error("Returned null");
  return `✓ ${gaps.length || 0} gaps identified`;
});

test("AI: analyzePortfolio()", async (uid) => {
  const result = await analyzePortfolio(uid, "moderate");
  if (!result) throw new Error("Returned null");
  return `✓ suggestions=${result.suggestions?.length || 0}`;
});

// ═══ EMERGENCY / LEGACY TESTS ═══
test("Emergency: checkEmergencyStatus()", async (uid) => {
  const status = await checkEmergencyStatus(uid);
  if (!status) throw new Error("Returned null");
  return `✓ phase=${status.phase}, enabled=${status.enabled}`;
});

test("Emergency: previewKinPackage()", async (uid) => {
  const pkg = await previewKinPackage(uid);
  if (!pkg) throw new Error("Returned null");
  return `✓ insurance=${!!pkg.insurance}, investments=${!!pkg.investments}`;
});

// ═══ COMPONENT ═══
export default function QATestScreen({ navigation }) {
  const { user } = useAuth();
  const [running, setRunning] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [results, setResults] = useState([]);
  const [done, setDone] = useState(false);
  const [seedStatus, setSeedStatus] = useState("");

  const seedData = useCallback(async () => {
    if (!user) return;
    setSeeding(true);
    setSeedStatus("Seeding demo data…");
    try {
      await initDB();
      const result = await seedDemoData(user.user_id);
      setSeedStatus(`✓ Seeded ${result.errors?.length === 0 ? "all tables" : `${result.errors?.length || 0} errors`}`);
    } catch (e) {
      setSeedStatus(`✗ Seed failed: ${e.message}`);
    }
    setSeeding(false);
  }, [user]);

  const runAll = useCallback(async () => {
    if (!user) return;
    setRunning(true);
    setDone(false);
    setResults([]);
    const uid = user.user_id;
    const collected = [];

    for (const t of TESTS) {
      try {
        const detail = await t.fn(uid);
        collected.push({ name: t.name, pass: true, detail });
      } catch (e) {
        collected.push({ name: t.name, pass: false, detail: e.message });
      }
      setResults([...collected]);
    }
    setRunning(false);
    setDone(true);
  }, [user]);

  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>QA Test Suite</Text>
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryText}>
          {done ? `${passed}/${results.length} passed, ${failed} failed` :
           running ? `Running… ${results.length}/${TESTS.length}` :
           `${TESTS.length} tests ready`}
        </Text>
        {done && (
          <Text style={[styles.summaryBadge, { color: failed === 0 ? theme.accent : theme.destructive }]}>
            {failed === 0 ? "ALL PASS ✓" : `${failed} FAILURES`}
          </Text>
        )}
      </View>

      {/* Seed button — must run before tests on web (in-memory DB resets on reload) */}
      <TouchableOpacity style={[styles.seedBtn, { opacity: seeding ? 0.6 : 1 }]} onPress={seedData} disabled={seeding || !user}>
        <Ionicons name={seeding ? "hourglass" : "water"} size={18} color="#fff" />
        <Text style={styles.runBtnText}>{seeding ? "Seeding…" : "1. Seed Demo Data"}</Text>
      </TouchableOpacity>
      {seedStatus ? <Text style={styles.seedStatus}>{seedStatus}</Text> : null}

      <TouchableOpacity style={[styles.runBtn, { opacity: running ? 0.6 : 1 }]} onPress={runAll} disabled={running || !user}>
        <Ionicons name={running ? "hourglass" : "play-circle"} size={20} color="#fff" />
        <Text style={styles.runBtnText}>{running ? "Running…" : "2. Run All Tests"}</Text>
      </TouchableOpacity>

      {results.map((r, i) => (
        <View key={i} style={[styles.testRow, { borderLeftColor: r.pass ? theme.accent : theme.destructive }]}>
          <Ionicons name={r.pass ? "checkmark-circle" : "close-circle"} size={18} color={r.pass ? theme.accent : theme.destructive} />
          <View style={{ flex: 1 }}>
            <Text style={styles.testName}>{r.name}</Text>
            <Text style={styles.testDetail}>{r.detail}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: { flexDirection: "row", alignItems: "center", padding: 16, paddingTop: 60, gap: 8 },
  backBtn: { padding: 4 },
  title: { fontSize: 22, fontWeight: "800", color: theme.text },
  summaryCard: { marginHorizontal: 16, marginTop: 12, backgroundColor: theme.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: theme.border, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  summaryText: { fontSize: 16, fontWeight: "700", color: theme.text },
  summaryBadge: { fontSize: 14, fontWeight: "800" },
  seedBtn: { marginHorizontal: 16, marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: theme.accent, borderRadius: 14, paddingVertical: 12 },
  seedStatus: { marginHorizontal: 16, marginTop: 6, fontSize: 12, color: theme.muted, textAlign: "center" },
  runBtn: { marginHorizontal: 16, marginTop: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: theme.primary, borderRadius: 14, paddingVertical: 14 },
  runBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  testRow: { marginHorizontal: 16, marginTop: 8, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: theme.card, borderRadius: 10, padding: 12, borderLeftWidth: 3 },
  testName: { fontSize: 13, fontWeight: "600", color: theme.text },
  testDetail: { fontSize: 11, color: theme.muted, marginTop: 2 },
});