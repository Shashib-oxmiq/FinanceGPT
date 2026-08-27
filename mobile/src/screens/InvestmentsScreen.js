import React, { useEffect, useState, useCallback } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Modal, TextInput, RefreshControl, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { api } from "../services/api";
import SmartAddBar from "../components/SmartAddBar";
import PanelChat from "../components/PanelChat";
import { theme, formatMoney } from "../theme";

export default function InvestmentsScreen() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [quotes, setQuotes] = useState({});
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ name: "", asset_type: "stock", amount_invested: "", current_value: "", ticker: "", market: "", notes: "" });
  const [editId, setEditId] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const data = await api.getInvestments(user.user_id);
      setItems(data);
      const s = await api.getInvestmentSummary(user.user_id);
      setSummary(s);
      if (data.length > 0) {
        const { fetchPortfolioQuotes } = await import("../services/market");
        const q = await fetchPortfolioQuotes(data);
        const map = {};
        (q.quotes || []).forEach((x) => { map[x.investment_id] = x; });
        setQuotes(map);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.name) return;
    const data = { ...form, amount_invested: parseFloat(form.amount_invested) || 0, current_value: parseFloat(form.current_value) || 0 };
    if (editId) { await api.updateInvestment(editId, user.user_id, data); }
    else { await api.addInvestment(user.user_id, data); }
    setForm({ name: "", asset_type: "stock", amount_invested: "", current_value: "", ticker: "", market: "", notes: "" }); setEditId(null); setShow(false); load();
  };

  const editItem = (it) => {
    setForm({ name: it.name, asset_type: it.asset_type, amount_invested: String(it.amount_invested), current_value: String(it.current_value), ticker: it.ticker || "", market: it.market || "", notes: it.notes || "" });
    setEditId(it.investment_id); setShow(true);
  };

  const del = async (id) => { await api.deleteInvestment(id, user.user_id); load(); };

  const renderItem = ({ item }) => {
    const q = quotes[item.investment_id];
    const price = q?.live_price || Number(item.current_value) || 0;
    const inv = Number(item.amount_invested) || 0;
    const roi = inv ? (((price - inv) / inv) * 100).toFixed(1) : "0.0";
    const up = price >= inv;
    return (
      <TouchableOpacity style={styles.itemRow} onPress={() => editItem(item)} activeOpacity={0.7}>
        <View style={styles.itemIcon}><Ionicons name="pie-chart" size={18} color={theme.primary} /></View>
        <View style={styles.itemInfo}>
          <Text style={styles.itemName}>{item.name}</Text>
          <Text style={styles.itemType}>{item.asset_type}{item.ticker ? ` · ${item.ticker}` : ""}</Text>
          {q && <Text style={styles.itemMarket}>{q.exchange} · {q.currency}{q.market_state === "REGULAR" ? " · LIVE" : ""}</Text>}
        </View>
        <View style={styles.itemRight}>
          <Text style={styles.itemPrice}>{formatMoney(price, q?.currency)}</Text>
          <Text style={{ fontSize: 12, color: up ? theme.accent : theme.destructive }}>{up ? "+" : ""}{roi}%</Text>
        </View>
        <TouchableOpacity onPress={() => del(item.investment_id)} style={styles.delBtn}><Ionicons name="trash-outline" size={16} color={theme.destructive} /></TouchableOpacity>
      </TouchableOpacity>
    );
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={theme.primary} /></View>;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t("page.investments.title")}</Text>
        <Text style={styles.subtitle}>{t("page.investments.subtitle")}</Text>
      </View>
      <SmartAddBar context="Investments" onSaved={load} />
      {summary && (
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}><Text style={styles.summaryLabel}>{t("stat.total_invested")}</Text><Text style={styles.summaryValue}>{formatMoney(summary.total_invested)}</Text></View>
          <View style={styles.summaryItem}><Text style={styles.summaryLabel}>{t("stat.current_value")}</Text><Text style={styles.summaryValue}>{formatMoney(summary.total_current)}</Text></View>
          <View style={styles.summaryItem}><Text style={styles.summaryLabel}>{t("stat.total_gain")}</Text><Text style={[styles.summaryValue, { color: summary.total_gain >= 0 ? theme.accent : theme.destructive }]}>{summary.total_gain >= 0 ? "+" : ""}{formatMoney(summary.total_gain)}</Text></View>
        </View>
      )}
      {items.length === 0 ? (
        <View style={styles.empty}><Ionicons name="trending-up" size={40} color={theme.muted} /><Text style={styles.emptyText}>{t("empty.investments")}</Text></View>
      ) : (
        <FlatList data={items} keyExtractor={(x) => x.investment_id} renderItem={renderItem} contentContainerStyle={{ paddingBottom: 80 }} refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={theme.primary} />} ListFooterComponent={<PanelChat context="Investments" />} />
      )}
      <TouchableOpacity style={styles.fab} onPress={() => { setForm({ name: "", asset_type: "stock", amount_invested: "", current_value: "", ticker: "", market: "", notes: "" }); setEditId(null); setShow(true); }}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
      <Modal visible={show} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editId ? "Edit Investment" : t("button.add_investment")}</Text>
            <TextInput style={styles.input} placeholder={t("field.name_required")} placeholderTextColor={theme.muted} value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />
            <TextInput style={styles.input} placeholder={t("field.ticker")} placeholderTextColor={theme.muted} value={form.ticker} onChangeText={(v) => setForm({ ...form, ticker: v })} />
            <TextInput style={styles.input} placeholder={t("field.amount_invested")} placeholderTextColor={theme.muted} value={form.amount_invested} onChangeText={(v) => setForm({ ...form, amount_invested: v })} keyboardType="decimal-pad" />
            <TextInput style={styles.input} placeholder={t("page.current_value_optional")} placeholderTextColor={theme.muted} value={form.current_value} onChangeText={(v) => setForm({ ...form, current_value: v })} keyboardType="decimal-pad" />
            <TextInput style={styles.input} placeholder={t("field.notes")} placeholderTextColor={theme.muted} value={form.notes} onChangeText={(v) => setForm({ ...form, notes: v })} multiline />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setShow(false); setEditId(null); }}><Text style={styles.cancelText}>{t("common.cancel")}</Text></TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={save}><Text style={styles.saveText}>{t("button.save")}</Text></TouchableOpacity>
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
  header: { padding: 20, paddingTop: 60 },
  title: { fontSize: 24, fontWeight: "800", color: theme.text },
  subtitle: { fontSize: 14, color: theme.muted, marginTop: 4 },
  summaryRow: { flexDirection: "row", paddingHorizontal: 16, gap: 8, marginBottom: 12 },
  summaryItem: { flex: 1, backgroundColor: theme.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: theme.border },
  summaryLabel: { fontSize: 10, color: theme.muted, textTransform: "uppercase", letterSpacing: 1 },
  summaryValue: { fontSize: 16, fontWeight: "700", color: theme.text, marginTop: 4 },
  itemRow: { flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: theme.border, gap: 12 },
  itemIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: theme.primary + "20", justifyContent: "center", alignItems: "center" },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 15, fontWeight: "600", color: theme.text },
  itemType: { fontSize: 12, color: theme.muted, marginTop: 2 },
  itemMarket: { fontSize: 10, color: theme.muted, marginTop: 2 },
  itemRight: { alignItems: "flex-end" },
  itemPrice: { fontSize: 15, fontWeight: "600", color: theme.text },
  delBtn: { padding: 8 },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", paddingBottom: 100 },
  emptyText: { color: theme.muted, fontSize: 14, marginTop: 12, textAlign: "center" },
  fab: { position: "absolute", bottom: 20, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: theme.primary, justifyContent: "center", alignItems: "center", elevation: 8, shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: theme.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "80%" },
  modalTitle: { fontSize: 20, fontWeight: "700", color: theme.text, marginBottom: 16 },
  input: { backgroundColor: theme.input, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text, marginBottom: 10, borderWidth: 1, borderColor: theme.border },
  modalButtons: { flexDirection: "row", gap: 12, marginTop: 16 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: theme.border, alignItems: "center" },
  cancelText: { color: theme.textSecondary, fontSize: 15, fontWeight: "600" },
  saveBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: theme.primary, alignItems: "center" },
  saveText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});