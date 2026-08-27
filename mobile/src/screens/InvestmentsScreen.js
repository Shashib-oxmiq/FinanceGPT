import React, { useEffect, useState, useCallback } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Modal, TextInput, RefreshControl, ActivityIndicator, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { api } from "../services/api";
import SmartAddBar from "../components/SmartAddBar";
import PanelChat from "../components/PanelChat";
import { theme, formatMoney } from "../theme";
import { analyzeAllocation } from "../services/rebalancing";

const CUR_SYM = { USD: "$", INR: "₹", EUR: "€", GBP: "£", JPY: "¥", AUD: "A$", CAD: "C$" };
const TYPE_LABEL = (t) => (t || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const EMPTY = { name: "", asset_type: "stock", amount_invested: "", current_value: "", ticker: "", market: "", notes: "" };

export default function InvestmentsScreen({ navigation }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [quotes, setQuotes] = useState({});
  const [liveFetched, setLiveFetched] = useState(false);
  const [liveLoading, setLiveLoading] = useState(false);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rebalanceData, setRebalanceData] = useState(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const data = await api.getInvestments(user.user_id);
      setItems(data);
      const s = await api.getInvestmentSummary(user.user_id);
      setSummary(s);
      try { setRebalanceData(await analyzeAllocation(data)); } catch (e) { console.warn(e); }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Auto-fetch live prices
  const fetchLivePrices = useCallback(async () => {
    if (!items.length || !user) return;
    setLiveLoading(true);
    try {
      const { fetchPortfolioQuotes } = await import("../services/market");
      const q = await fetchPortfolioQuotes(items);
      const map = {};
      (q.quotes || []).forEach((x) => { map[x.investment_id] = x; });
      setQuotes(map);
      setLiveFetched(true);
    } catch (e) { console.warn("Live price fetch failed:", e); }
    finally { setLiveLoading(false); }
  }, [items, user]);

  useEffect(() => {
    if (items.length > 0 && !liveFetched) fetchLivePrices();
  }, [items, liveFetched, fetchLivePrices]);

  const onRefresh = async () => {
    setRefreshing(true);
    setLiveFetched(false);
    await load();
    await fetchLivePrices();
    setRefreshing(false);
  };

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.name) return;
    const data = { ...form, amount_invested: parseFloat(form.amount_invested) || 0, current_value: parseFloat(form.current_value) || 0 };
    if (editId) { await api.updateInvestment(editId, user.user_id, data); }
    else { await api.addInvestment(user.user_id, data); }
    setForm(EMPTY); setEditId(null); setShow(false);
    setLiveFetched(false); load();
  };

  const editItem = (it) => {
    setForm({ name: it.name, asset_type: it.asset_type || "stock", amount_invested: String(it.amount_invested ?? ""), current_value: String(it.current_value ?? ""), ticker: it.ticker || "", market: it.market || "", notes: it.notes || "" });
    setEditId(it.investment_id); setShow(true);
  };

  const del = async (id) => { await api.deleteInvestment(id, user.user_id); setLiveFetched(false); load(); };

  // Live-adjusted summary
  const liveSummary = (() => {
    if (!items.length) return null;
    let totalInvested = 0, totalCurrent = 0;
    for (const it of items) {
      const inv = Number(it.amount_invested) || 0;
      const lq = quotes[it.investment_id];
      const cur = lq?.live_price != null ? lq.live_price : (Number(it.current_value) || 0);
      totalInvested += inv; totalCurrent += cur;
    }
    const gain = totalCurrent - totalInvested;
    const roi = totalInvested ? (gain / totalInvested) * 100 : 0;
    return { total_invested: totalInvested, total_current: totalCurrent, net_worth: totalCurrent, total_gain: gain, roi_pct: roi };
  })();

  const displaySummary = liveFetched ? liveSummary : summary;
  const liveCount = Object.values(quotes).filter(q => q.live_price != null).length;
  const gainPositive = (displaySummary?.total_gain ?? 0) >= 0;

  const renderItem = ({ item: it }) => {
    const inv = Number(it.amount_invested) || 0;
    const lq = quotes[it.investment_id];
    const livePrice = lq?.live_price;
    const storedCur = Number(it.current_value) || 0;
    const cur = livePrice != null ? livePrice : storedCur;
    const roi = inv ? (((cur - inv) / inv) * 100).toFixed(1) : "0.0";
    const up = cur >= inv;
    const currency = lq?.currency || "";
    const exchange = lq?.exchange || "";
    const marketState = lq?.market_state || "";
    const changePct = lq?.change_percent;
    const isLive = livePrice != null;
    const curSym = CUR_SYM[currency] || currency || "";

    return (
      <TouchableOpacity style={styles.itemRow} onPress={() => editItem(it)} activeOpacity={0.7}>
        <View style={styles.itemIcon}><Ionicons name="pie-chart" size={18} color={theme.primary} /></View>
        <View style={styles.itemInfo}>
          <Text style={styles.itemName} numberOfLines={1}>{it.name}</Text>
          <View style={styles.itemBadges}>
            <Text style={styles.itemType}>{TYPE_LABEL(it.asset_type)}</Text>
            {it.ticker ? <Text style={styles.itemTicker}>· {it.ticker}</Text> : null}
            {isLive && <Text style={styles.liveBadge}>LIVE</Text>}
            {exchange ? <Text style={styles.exchangeText}>{exchange}</Text> : null}
          </View>
          {isLive && marketState && (
            <Text style={styles.marketState}>{marketState === "REGULAR" ? "🟢 Market Open" : "🔴 Market Closed"}</Text>
          )}
        </View>
        <View style={styles.itemRight}>
          <Text style={styles.itemPrice}>{curSym}{formatMoney(cur)}</Text>
          <Text style={{ fontSize: 12, color: up ? theme.accent : theme.destructive, fontWeight: "600" }}>
            {up ? "+" : ""}{roi}%
          </Text>
          {changePct != null && (
            <Text style={{ fontSize: 10, color: changePct >= 0 ? theme.accent : theme.destructive }}>
              {changePct >= 0 ? "+" : ""}{changePct.toFixed(2)}% today
            </Text>
          )}
        </View>
        <TouchableOpacity onPress={() => del(it.investment_id)} style={styles.delBtn}>
          <Ionicons name="trash-outline" size={16} color={theme.destructive} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={theme.primary} /></View>;

  return (
    <View style={styles.container}>
      {/* Header with refresh + add buttons */}
      <View style={styles.header}>
        <Text style={styles.title}>{t("page.investments.title")}</Text>
        <Text style={styles.subtitle}>{t("page.investments.subtitle")}</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.refreshBtn} onPress={fetchLivePrices} disabled={liveLoading || !items.length}>
            {liveLoading ? <ActivityIndicator size="small" color={theme.primary} /> : <Ionicons name="refresh" size={16} color={theme.primary} />}
            <Text style={styles.refreshText}>{liveLoading ? "Fetching..." : "Refresh"}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.addBtn} onPress={() => { setForm(EMPTY); setEditId(null); setShow(true); }}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addBtnText}>Add</Text>
          </TouchableOpacity>
        </View>
      </View>

      <SmartAddBar context="Investments" onSaved={() => { setLiveFetched(false); load(); }} />

      {/* Live prices status bar */}
      {items.length > 0 && (
        <View style={styles.statusBar}>
          <Ionicons name="globe" size={12} color={theme.muted} />
          {liveLoading ? (
            <Text style={styles.statusText}>Fetching live prices...</Text>
          ) : liveFetched ? (
            <Text style={styles.statusText}>
              {liveCount > 0
                ? `${liveCount} of ${items.length} holdings updated with live prices`
                : "Could not fetch live prices — showing stored values"}
            </Text>
          ) : (
            <Text style={styles.statusText}>Fetching live prices...</Text>
          )}
        </View>
      )}

      {/* 4 stat cards */}
      {displaySummary && (
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Net Worth</Text>
            <Text style={[styles.statValue, styles.statBig]}>{formatMoney(displaySummary.net_worth)}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Invested</Text>
            <Text style={styles.statValue}>{formatMoney(displaySummary.total_invested)}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Current</Text>
            <Text style={styles.statValue}>{formatMoney(displaySummary.total_current)}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>ROI</Text>
            <Text style={[styles.statValue, { color: gainPositive ? theme.accent : theme.destructive }]}>
              {(displaySummary.roi_pct ?? 0).toFixed(1)}%
            </Text>
          </View>
        </View>
      )}

      {/* Rebalancing suggestions */}
      {rebalanceData && rebalanceData.suggestions.length > 0 && (
        <View style={{ marginHorizontal: 16, marginBottom: 12, backgroundColor: theme.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: theme.border }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Ionicons name="swap-horizontal" size={18} color="#8b5cf6" />
            <Text style={{ fontSize: 15, fontWeight: "700", color: theme.text }}>Rebalancing Suggestions</Text>
          </View>
          {rebalanceData.suggestions.slice(0, 3).map((s, i) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 6, marginBottom: 6 }}>
              <Ionicons name="chevron-forward" size={12} color={theme.muted} style={{ marginTop: 2 }} />
              <Text style={{ fontSize: 13, color: theme.textSecondary, flex: 1, lineHeight: 18 }}>{s}</Text>
            </View>
          ))}
          {rebalanceData.concentrationRisk && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: theme.border }}>
              <Ionicons name="warning" size={12} color="#f59e0b" />
              <Text style={{ fontSize: 12, color: "#f59e0b", fontWeight: "600" }}>Concentration risk detected</Text>
            </View>
          )}
        </View>
      )}

      {/* Investment list */}
      {items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="trending-up" size={40} color={theme.muted} />
          <Text style={styles.emptyText}>No investments yet. Tap + to add your first holding.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(x) => x.investment_id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 80 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
        />
      )}

      {/* PanelChat */}
      <PanelChat context="Investments" title="Ask AI about your portfolio" />

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => { setForm(EMPTY); setEditId(null); setShow(true); }}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Add/Edit Modal */}
      <Modal visible={show} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editId ? "Edit Investment" : "Add Investment"}</Text>
            <TextInput style={styles.input} placeholder="Name" placeholderTextColor={theme.muted} value={form.name} onChangeText={(v) => setF("name", v)} />
            <View style={styles.pickerRow}>
              {["stock", "mutual_fund", "etf", "bond", "crypto", "real_estate", "gold", "other"].map((tp) => (
                <TouchableOpacity key={tp} style={[styles.pickerChip, form.asset_type === tp && styles.pickerChipActive]} onPress={() => setF("asset_type", tp)}>
                  <Text style={[styles.pickerChipText, form.asset_type === tp && styles.pickerChipTextActive]}>{TYPE_LABEL(tp)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={styles.input} placeholder="Amount Invested" placeholderTextColor={theme.muted} value={form.amount_invested} onChangeText={(v) => setF("amount_invested", v)} keyboardType="decimal-pad" />
            <TextInput style={styles.input} placeholder="Current Value" placeholderTextColor={theme.muted} value={form.current_value} onChangeText={(v) => setF("current_value", v)} keyboardType="decimal-pad" />
            <TextInput style={styles.input} placeholder="Ticker (e.g. AAPL, RELIANCE.NS)" placeholderTextColor={theme.muted} value={form.ticker} onChangeText={(v) => setF("ticker", v)} autoCapitalize="none" />
            <TextInput style={styles.input} placeholder="Market (e.g. NASDAQ, NSE)" placeholderTextColor={theme.muted} value={form.market} onChangeText={(v) => setF("market", v)} />
            <TextInput style={styles.input} placeholder="Notes" placeholderTextColor={theme.muted} value={form.notes} onChangeText={(v) => setF("notes", v)} multiline />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setShow(false); setEditId(null); setForm(EMPTY); }}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={save}>
                <Text style={styles.saveText}>{editId ? "Update" : "Add"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  center: { flex: 1, backgroundColor: theme.background, justifyContent: "center", alignItems: "center" },
  // Header
  header: { padding: 20, paddingTop: 60 },
  title: { fontSize: 24, fontWeight: "800", color: theme.text },
  subtitle: { fontSize: 14, color: theme.muted, marginTop: 4 },
  headerActions: { flexDirection: "row", gap: 8, marginTop: 12 },
  refreshBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: theme.border },
  refreshText: { fontSize: 13, color: theme.primary, fontWeight: "600" },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, backgroundColor: theme.primary },
  addBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  // Status bar
  statusBar: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 20, marginBottom: 8 },
  statusText: { fontSize: 12, color: theme.muted },
  // Stats grid
  statsGrid: { flexDirection: "row", paddingHorizontal: 16, gap: 8, marginBottom: 12 },
  statCard: { flex: 1, backgroundColor: theme.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: theme.border },
  statLabel: { fontSize: 11, color: theme.muted, marginBottom: 4 },
  statValue: { fontSize: 16, fontWeight: "700", color: theme.text },
  statBig: { fontSize: 18 },
  // Items
  itemRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: theme.border },
  itemIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: theme.primary + "20", justifyContent: "center", alignItems: "center" },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 15, fontWeight: "600", color: theme.text },
  itemBadges: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  itemType: { fontSize: 11, color: theme.muted, textTransform: "uppercase" },
  itemTicker: { fontSize: 11, color: theme.muted },
  liveBadge: { fontSize: 9, color: theme.accent, fontWeight: "700", backgroundColor: theme.accent + "20", paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 },
  exchangeText: { fontSize: 10, color: theme.muted },
  marketState: { fontSize: 10, color: theme.muted, marginTop: 2 },
  itemRight: { alignItems: "flex-end" },
  itemPrice: { fontSize: 15, fontWeight: "700", color: theme.text },
  delBtn: { padding: 8 },
  // Empty
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80 },
  emptyText: { fontSize: 14, color: theme.muted, textAlign: "center", marginTop: 12, paddingHorizontal: 40 },
  // FAB
  fab: { position: "absolute", right: 20, bottom: 80, width: 56, height: 56, borderRadius: 28, backgroundColor: theme.primary, justifyContent: "center", alignItems: "center", elevation: 4, shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: theme.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, maxHeight: "90%" },
  modalTitle: { fontSize: 20, fontWeight: "700", color: theme.text, marginBottom: 16 },
  input: { backgroundColor: theme.input, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text, marginBottom: 10, borderWidth: 1, borderColor: theme.border },
  pickerRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  pickerChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: theme.input, borderWidth: 1, borderColor: theme.border },
  pickerChipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  pickerChipText: { fontSize: 12, color: theme.textSecondary },
  pickerChipTextActive: { color: "#fff", fontWeight: "600" },
  modalButtons: { flexDirection: "row", gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center", borderWidth: 1, borderColor: theme.border },
  cancelText: { color: theme.textSecondary, fontSize: 16 },
  saveBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center", backgroundColor: theme.primary },
  saveText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});