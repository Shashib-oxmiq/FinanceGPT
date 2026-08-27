// ── ChatViz — Rich inline visualizations for chat messages ────────────────────
// Parses AI output markers and renders charts, diagrams, tables, stat cards,
// progress bars, comparison cards, timelines, and callouts inline in chat.
//
// Supported markers (all use [TYPE:JSON] format):
//   [CHART:{"type":"bar","title":"...","data":[{"label":"A","value":100,"color":"#xxx"},...]}]
//   [CHART:{"type":"pie","title":"...","data":[{"label":"A","value":60,"color":"#xxx"},...]}]
//   [CHART:{"type":"line","title":"...","data":[{"label":"Jan","value":100},...],"color":"#xxx"}]
//   [MERMAID:graph TD; A-->B]
//   [TABLE:{"title":"...","headers":["A","B"],"rows":[["x","y"],["z","w"]]}]
//   [STAT:{"label":"Net Worth","value":"Rs.15L","icon":"wallet","color":"#10b981"}]
//   [PROGRESS:{"label":"Tax saving","percent":75,"color":"#10b981"}]
//   [COMPARE:{"title":"Old vs New","leftLabel":"Old","leftValue":"Rs.2L","rightLabel":"New","rightValue":"Rs.1L","better":"right"}]
//   [TIMELINE:{"events":[{"date":"Jun 15","title":"Advance Tax Q1","desc":"Pay 15%"}]}]
//   [CALLOUT:{"type":"warning","title":"Deadline approaching","text":"ITR due in 30 days"}]

import React, { useMemo } from "react";
import { View, Text, Image, ScrollView, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../theme";

// ── Marker regex ──
const MARKER_RE = /\[(CHART|MERMAID|TABLE|STAT|PROGRESS|COMPARE|TIMELINE|CALLOUT):([\s\S]*?)\]/g;

// ── Main parser: splits text into segments and viz blocks ──
export function parseVizBlocks(text) {
  if (!text) return [{ type: "text", content: "" }];
  const blocks = [];
  let lastIndex = 0;
  // Reset regex
  MARKER_RE.lastIndex = 0;
  let match;
  while ((match = MARKER_RE.exec(text)) !== null) {
    // Text before marker
    if (match.index > lastIndex) {
      const before = text.slice(lastIndex, match.index).trim();
      if (before) blocks.push({ type: "text", content: before });
    }
    const vizType = match[1];
    const rawPayload = match[2].trim();
    // For MERMAID, payload is the diagram source (not JSON)
    if (vizType === "MERMAID") {
      blocks.push({ type: "mermaid", content: rawPayload });
    } else {
      try {
        const data = JSON.parse(rawPayload);
        blocks.push({ type: vizType.toLowerCase(), data });
      } catch (e) {
        // If JSON parse fails, render as text
        blocks.push({ type: "text", content: `[${vizType}: ${rawPayload}]` });
      }
    }
    lastIndex = match.index + match[0].length;
  }
  // Remaining text after last marker
  if (lastIndex < text.length) {
    const after = text.slice(lastIndex).trim();
    if (after) blocks.push({ type: "text", content: after });
  }
  return blocks.length > 0 ? blocks : [{ type: "text", content: text }];
}

// ── Color palette for charts ──
const CHART_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

function getColor(idx, override) {
  return override || CHART_COLORS[idx % CHART_COLORS.length];
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHART COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

function BarChart({ data, title }) {
  const maxVal = Math.max(...data.map(d => Number(d.value) || 0), 1);
  return (
    <View style={vizStyles.chartCard}>
      {title && <Text style={vizStyles.chartTitle}>{title}</Text>}
      <View style={vizStyles.barChartRow}>
        {data.map((d, i) => {
          const h = Math.max(4, (Number(d.value) / maxVal) * 120);
          return (
            <View key={i} style={vizStyles.barCol}>
              <Text style={vizStyles.barVal}>{Number(d.value).toLocaleString("en-IN")}</Text>
              <View style={[vizStyles.bar, { height: h, backgroundColor: getColor(i, d.color) }]} />
              <Text style={vizStyles.barLabel} numberOfLines={1}>{d.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function PieChart({ data, title }) {
  const total = data.reduce((s, d) => s + (Number(d.value) || 0), 0) || 1;
  // Donut chart using overlapping Views (conic gradient approximation via segments)
  return (
    <View style={vizStyles.chartCard}>
      {title && <Text style={vizStyles.chartTitle}>{title}</Text>}
      <View style={vizStyles.pieRow}>
        <View style={vizStyles.donutOuter}>
          {data.map((d, i) => {
            const pct = ((Number(d.value) || 0) / total) * 100;
            return (
              <View
                key={i}
                style={[
                  vizStyles.donutSeg,
                  {
                    backgroundColor: getColor(i, d.color),
                    height: `${pct}%`,
                  },
                ]}
              />
            );
          })}
          <View style={vizStyles.donutInner}>
            <Text style={vizStyles.donutCenter}>{total.toLocaleString("en-IN")}</Text>
          </View>
        </View>
        <View style={vizStyles.legendCol}>
          {data.map((d, i) => (
            <View key={i} style={vizStyles.legendRow}>
              <View style={[vizStyles.legendDot, { backgroundColor: getColor(i, d.color) }]} />
              <Text style={vizStyles.legendLabel}>{d.label}</Text>
              <Text style={vizStyles.legendVal}>
                {Number(d.value).toLocaleString("en-IN")} ({(((Number(d.value) || 0) / total) * 100).toFixed(1)}%)
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function LineChart({ data, title, color }) {
  const maxVal = Math.max(...data.map(d => Number(d.value) || 0), 1);
  const minVal = Math.min(...data.map(d => Number(d.value) || 0), 0);
  const range = maxVal - minVal || 1;
  const chartH = 100;
  const chartW = 280;
  const stepX = data.length > 1 ? chartW / (data.length - 1) : chartW;
  const lineColor = color || theme.primary;

  // Build points for the line
  const points = data.map((d, i) => {
    const x = i * stepX;
    const y = chartH - ((Number(d.value) - minVal) / range) * (chartH - 10) - 5;
    return { x, y, val: d.value, label: d.label };
  });

  // Build SVG path string (works on web via SVG, on native we use dots + lines)
  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

  return (
    <View style={vizStyles.chartCard}>
      {title && <Text style={vizStyles.chartTitle}>{title}</Text>}
      <View style={vizStyles.lineChartWrap}>
        {/* Y-axis labels */}
        <View style={vizStyles.lineYAxis}>
          <Text style={vizStyles.lineAxisText}>{maxVal.toLocaleString("en-IN")}</Text>
          <View style={{ flex: 1 }} />
          <Text style={vizStyles.lineAxisText}>{minVal.toLocaleString("en-IN")}</Text>
        </View>
        {/* Chart area */}
        <View style={vizStyles.lineChartArea}>
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map(f => (
            <View key={f} style={[vizStyles.lineGrid, { top: f * chartH }]} />
          ))}
          {/* Data points with connecting line segments */}
          {points.map((p, i) => (
            <View key={i} style={[vizStyles.lineDot, { left: p.x - 4, top: p.y - 4, backgroundColor: lineColor }]}>
              <Text style={vizStyles.lineDotVal}>{Number(p.val).toLocaleString("en-IN")}</Text>
            </View>
          ))}
          {/* Line segments between dots */}
          {points.slice(1).map((p, i) => {
            const prev = points[i];
            const dx = p.x - prev.x;
            const dy = p.y - prev.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
            return (
              <View
                key={`line-${i}`}
                style={[
                  vizStyles.lineSeg,
                  {
                    left: prev.x,
                    top: prev.y,
                    width: len,
                    transform: [{ rotate: `${angle}deg` }],
                    backgroundColor: lineColor,
                  },
                ]}
              />
            );
          })}
        </View>
      </View>
      {/* X-axis labels */}
      <View style={vizStyles.lineXAxis}>
        {data.map((d, i) => (
          <Text key={i} style={vizStyles.lineAxisText}>{d.label}</Text>
        ))}
      </View>
    </View>
  );
}

function ChartRenderer({ data }) {
  if (!data || !data.type) return null;
  if (data.type === "bar") return <BarChart data={data.data || []} title={data.title} />;
  if (data.type === "pie") return <PieChart data={data.data || []} title={data.title} />;
  if (data.type === "line") return <LineChart data={data.data || []} title={data.title} color={data.color} />;
  return (
    <View style={vizStyles.chartCard}>
      <Text style={vizStyles.errorText}>Unknown chart type: {data.type}</Text>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MERMAID DIAGRAM
// ═══════════════════════════════════════════════════════════════════════════════

function MermaidDiagram({ content }) {
  // Encode mermaid source as base64 URL-safe for mermaid.ink
  const b64 = useMemo(() => {
    try {
      const b64str = btoa(content);
      return b64str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    } catch (e) {
      return null;
    }
  }, [content]);

  const url = b64 ? `https://mermaid.ink/img/${b64}?type=png&bgColor=white` : null;

  if (!url) return <Text style={vizStyles.errorText}>Mermaid diagram error</Text>;

  return (
    <View style={vizStyles.mermaidCard}>
      <View style={vizStyles.mermaidHeader}>
        <Ionicons name="git-branch" size={12} color={theme.primary} />
        <Text style={vizStyles.mermaidLabel}>Diagram</Text>
      </View>
      <Image source={{ uri: url }} style={vizStyles.mermaidImg} resizeMode="contain" />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TABLE
// ═══════════════════════════════════════════════════════════════════════════════

function DataTable({ data }) {
  const headers = data.headers || [];
  const rows = data.rows || [];
  return (
    <View style={vizStyles.tableCard}>
      {data.title && <Text style={vizStyles.tableTitle}>{data.title}</Text>}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          {/* Header row */}
          <View style={vizStyles.tableHeaderRow}>
            {headers.map((h, i) => (
              <View key={i} style={[vizStyles.tableCell, vizStyles.tableHeaderCell]}>
                <Text style={vizStyles.tableHeaderText}>{h}</Text>
              </View>
            ))}
          </View>
          {/* Data rows */}
          {rows.map((row, ri) => (
            <View key={ri} style={[vizStyles.tableDataRow, ri % 2 === 0 && vizStyles.tableRowAlt]}>
              {row.map((cell, ci) => (
                <View key={ci} style={vizStyles.tableCell}>
                  <Text style={vizStyles.tableCellText}>{String(cell)}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STAT CARD
// ═══════════════════════════════════════════════════════════════════════════════

const IONICON_MAP = {
  wallet: "wallet", money: "cash", tax: "calculator", health: "heart",
  investment: "trending-up", insurance: "shield-checkmark", home: "home",
  education: "school", retirement: "briefcase", goal: "flag",
  warning: "warning", info: "information-circle", success: "checkmark-circle",
  danger: "alert-circle", chart: "bar-chart", calendar: "calendar",
  time: "time", user: "person", family: "people", document: "document-text",
};

function StatCard({ data }) {
  const iconName = IONICON_MAP[data.icon] || "stats-chart";
  const color = data.color || theme.primary;
  return (
    <View style={[vizStyles.statCard, { borderLeftColor: color }]}>
      <View style={[vizStyles.statIconBox, { backgroundColor: color + "15" }]}>
        <Ionicons name={iconName} size={18} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={vizStyles.statLabel}>{data.label}</Text>
        <Text style={[vizStyles.statValue, { color }]}>{data.value}</Text>
        {data.subtitle && <Text style={vizStyles.statSubtitle}>{data.subtitle}</Text>}
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROGRESS BAR
// ═══════════════════════════════════════════════════════════════════════════════

function ProgressBar({ data }) {
  const pct = Math.min(100, Math.max(0, Number(data.percent) || 0));
  const color = data.color || (pct >= 75 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#ef4444");
  return (
    <View style={vizStyles.progressCard}>
      <View style={vizStyles.progressHeader}>
        <Text style={vizStyles.progressLabel}>{data.label}</Text>
        <Text style={[vizStyles.progressPct, { color }]}>{pct}%</Text>
      </View>
      <View style={vizStyles.progressTrack}>
        <View style={[vizStyles.progressFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      {data.target && <Text style={vizStyles.progressTarget}>Target: {data.target}</Text>}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPARISON CARD
// ═══════════════════════════════════════════════════════════════════════════════

function CompareCard({ data }) {
  const betterLeft = data.better === "left";
  const betterRight = data.better === "right";
  return (
    <View style={vizStyles.compareCard}>
      {data.title && <Text style={vizStyles.compareTitle}>{data.title}</Text>}
      <View style={vizStyles.compareRow}>
        <View style={[vizStyles.compareSide, betterLeft && vizStyles.compareBest]}>
          {betterLeft && <Text style={vizStyles.bestBadge}>BEST</Text>}
          <Text style={vizStyles.compareLabel}>{data.leftLabel}</Text>
          <Text style={[vizStyles.compareVal, betterLeft && { color: theme.accent }]}>{data.leftValue}</Text>
        </View>
        <View style={vizStyles.compareDivider}>
          <Text style={vizStyles.compareVs}>vs</Text>
        </View>
        <View style={[vizStyles.compareSide, betterRight && vizStyles.compareBest]}>
          {betterRight && <Text style={vizStyles.bestBadge}>BEST</Text>}
          <Text style={vizStyles.compareLabel}>{data.rightLabel}</Text>
          <Text style={[vizStyles.compareVal, betterRight && { color: theme.accent }]}>{data.rightValue}</Text>
        </View>
      </View>
      {data.note && <Text style={vizStyles.compareNote}>{data.note}</Text>}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TIMELINE
// ═══════════════════════════════════════════════════════════════════════════════

function Timeline({ data }) {
  const events = data.events || [];
  return (
    <View style={vizStyles.timelineCard}>
      {data.title && <Text style={vizStyles.timelineTitle}>{data.title}</Text>}
      {events.map((ev, i) => (
        <View key={i} style={vizStyles.timelineItem}>
          <View style={vizStyles.timelineDot} />
          {i < events.length - 1 && <View style={vizStyles.timelineLine} />}
          <View style={{ flex: 1, marginLeft: 8, paddingBottom: i < events.length - 1 ? 12 : 0 }}>
            <Text style={vizStyles.timelineDate}>{ev.date}</Text>
            <Text style={vizStyles.timelineTitle2}>{ev.title}</Text>
            {ev.desc && <Text style={vizStyles.timelineDesc}>{ev.desc}</Text>}
          </View>
        </View>
      ))}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CALLOUT
// ═══════════════════════════════════════════════════════════════════════════════

const CALLOUT_STYLES = {
  info: { bg: theme.primary + "10", border: theme.primary, icon: "information-circle", iconColor: theme.primary },
  warning: { bg: "#f59e0b" + "10", border: "#f59e0b", icon: "warning", iconColor: "#f59e0b" },
  success: { bg: "#10b981" + "10", border: "#10b981", icon: "checkmark-circle", iconColor: "#10b981" },
  danger: { bg: "#ef4444" + "10", border: "#ef4444", icon: "alert-circle", iconColor: "#ef4444" },
};

function Callout({ data }) {
  const cs = CALLOUT_STYLES[data.type] || CALLOUT_STYLES.info;
  return (
    <View style={[vizStyles.calloutCard, { backgroundColor: cs.bg, borderColor: cs.border }]}>
      <View style={vizStyles.calloutHeader}>
        <Ionicons name={cs.icon} size={16} color={cs.iconColor} />
        {data.title && <Text style={[vizStyles.calloutTitle, { color: cs.iconColor }]}>{data.title}</Text>}
      </View>
      {data.text && <Text style={vizStyles.calloutText}>{data.text}</Text>}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN RENDERER — renders parsed blocks
// ═══════════════════════════════════════════════════════════════════════════════

export function renderVizBlock(block, key) {
  switch (block.type) {
    case "text":
      return <Text key={key} style={vizStyles.messageText}>{block.content}</Text>;
    case "chart":
      return <ChartRenderer key={key} data={block.data} />;
    case "mermaid":
      return <MermaidDiagram key={key} content={block.content} />;
    case "table":
      return <DataTable key={key} data={block.data} />;
    case "stat":
      return <StatCard key={key} data={block.data} />;
    case "progress":
      return <ProgressBar key={key} data={block.data} />;
    case "compare":
      return <CompareCard key={key} data={block.data} />;
    case "timeline":
      return <Timeline key={key} data={block.data} />;
    case "callout":
      return <Callout key={key} data={block.data} />;
    default:
      return <Text key={key} style={vizStyles.messageText}>{JSON.stringify(block)}</Text>;
  }
}

// ── Convenience: render full message with viz blocks ──
export function ChatVizMessage({ content, textStyle }) {
  const blocks = useMemo(() => parseVizBlocks(content), [content]);
  return (
    <View>
      {blocks.map((block, i) => renderVizBlock(block, `viz_${i}`))}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════════

const vizStyles = StyleSheet.create({
  messageText: { fontSize: 14, color: theme.text, lineHeight: 20 },

  // Chart card
  chartCard: { backgroundColor: theme.card, borderRadius: 12, borderWidth: 1, borderColor: theme.border, padding: 12, marginVertical: 6 },
  chartTitle: { fontSize: 13, fontWeight: "700", color: theme.text, marginBottom: 10 },

  // Bar chart
  barChartRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-around", height: 160, gap: 4 },
  barCol: { flex: 1, alignItems: "center", justifyContent: "flex-end" },
  barVal: { fontSize: 9, color: theme.muted, marginBottom: 2 },
  bar: { width: 24, borderRadius: 4, minHeight: 4 },
  barLabel: { fontSize: 9, color: theme.muted, marginTop: 4, textAlign: "center" },

  // Pie chart
  pieRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  donutOuter: { width: 100, height: 100, borderRadius: 50, overflow: "hidden", position: "relative", justifyContent: "flex-end" },
  donutSeg: { width: "100%" },
  donutInner: { position: "absolute", top: 20, left: 20, width: 60, height: 60, borderRadius: 30, backgroundColor: theme.card, justifyContent: "center", alignItems: "center" },
  donutCenter: { fontSize: 11, fontWeight: "700", color: theme.text },
  legendCol: { flex: 1, gap: 4 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 2 },
  legendLabel: { fontSize: 11, color: theme.text, flex: 1 },
  legendVal: { fontSize: 10, color: theme.muted },

  // Line chart
  lineChartWrap: { flexDirection: "row", height: 120 },
  lineYAxis: { width: 40, justifyContent: "space-between", paddingVertical: 5 },
  lineAxisText: { fontSize: 8, color: theme.muted, textAlign: "right" },
  lineChartArea: { flex: 1, position: "relative", height: 100, marginLeft: 4 },
  lineGrid: { position: "absolute", left: 0, right: 0, height: 1, backgroundColor: theme.border },
  lineDot: { position: "absolute", width: 8, height: 8, borderRadius: 4 },
  lineDotVal: { position: "absolute", top: -14, left: -12, fontSize: 8, color: theme.muted, width: 40, textAlign: "center" },
  lineSeg: { position: "absolute", height: 2, transformOrigin: "left" },
  lineXAxis: { flexDirection: "row", justifyContent: "space-around", marginTop: 4, marginLeft: 44 },

  // Mermaid
  mermaidCard: { backgroundColor: theme.card, borderRadius: 12, borderWidth: 1, borderColor: theme.border, padding: 8, marginVertical: 6 },
  mermaidHeader: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 6 },
  mermaidLabel: { fontSize: 11, fontWeight: "600", color: theme.primary },
  mermaidImg: { width: "100%", height: 200, borderRadius: 8 },

  // Table
  tableCard: { backgroundColor: theme.card, borderRadius: 12, borderWidth: 1, borderColor: theme.border, padding: 8, marginVertical: 6 },
  tableTitle: { fontSize: 13, fontWeight: "700", color: theme.text, marginBottom: 8 },
  tableHeaderRow: { flexDirection: "row", borderBottomWidth: 2, borderBottomColor: theme.primary },
  tableHeaderCell: { backgroundColor: theme.primary + "08" },
  tableHeaderText: { fontSize: 11, fontWeight: "700", color: theme.primary, textAlign: "center" },
  tableDataRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: theme.border },
  tableRowAlt: { backgroundColor: theme.background },
  tableCell: { paddingHorizontal: 10, paddingVertical: 6, minWidth: 80 },
  tableCellText: { fontSize: 11, color: theme.text },

  // Stat card
  statCard: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: theme.card, borderRadius: 12, borderWidth: 1, borderColor: theme.border, borderLeftWidth: 3, padding: 10, marginVertical: 4 },
  statIconBox: { width: 36, height: 36, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  statLabel: { fontSize: 11, color: theme.muted },
  statValue: { fontSize: 16, fontWeight: "800" },
  statSubtitle: { fontSize: 10, color: theme.muted, marginTop: 2 },

  // Progress bar
  progressCard: { backgroundColor: theme.card, borderRadius: 12, borderWidth: 1, borderColor: theme.border, padding: 10, marginVertical: 4 },
  progressHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  progressLabel: { fontSize: 12, fontWeight: "600", color: theme.text },
  progressPct: { fontSize: 14, fontWeight: "800" },
  progressTrack: { height: 10, borderRadius: 5, backgroundColor: theme.border + "40", overflow: "hidden" },
  progressFill: { height: 10, borderRadius: 5 },
  progressTarget: { fontSize: 10, color: theme.muted, marginTop: 4 },

  // Compare card
  compareCard: { backgroundColor: theme.card, borderRadius: 12, borderWidth: 1, borderColor: theme.border, padding: 12, marginVertical: 6 },
  compareTitle: { fontSize: 13, fontWeight: "700", color: theme.text, marginBottom: 8, textAlign: "center" },
  compareRow: { flexDirection: "row", alignItems: "stretch" },
  compareSide: { flex: 1, borderRadius: 10, borderWidth: 1, borderColor: theme.border, padding: 10, alignItems: "center", position: "relative" },
  compareBest: { borderColor: theme.accent, borderWidth: 2, backgroundColor: theme.accent + "08" },
  bestBadge: { position: "absolute", top: -8, backgroundColor: theme.accent, color: "#fff", fontSize: 8, fontWeight: "800", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  compareLabel: { fontSize: 12, fontWeight: "600", color: theme.muted, marginBottom: 4 },
  compareVal: { fontSize: 18, fontWeight: "800", color: theme.text },
  compareDivider: { justifyContent: "center", alignItems: "center", paddingHorizontal: 8 },
  compareVs: { fontSize: 10, color: theme.muted, fontWeight: "600" },
  compareNote: { fontSize: 11, color: theme.primary, textAlign: "center", marginTop: 8 },

  // Timeline
  timelineCard: { backgroundColor: theme.card, borderRadius: 12, borderWidth: 1, borderColor: theme.border, padding: 12, marginVertical: 6 },
  timelineTitle: { fontSize: 13, fontWeight: "700", color: theme.text, marginBottom: 8 },
  timelineItem: { flexDirection: "row", alignItems: "flex-start" },
  timelineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.primary, marginTop: 4 },
  timelineLine: { position: "absolute", left: 4, top: 14, width: 2, bottom: 0, backgroundColor: theme.border },
  timelineDate: { fontSize: 10, color: theme.primary, fontWeight: "600" },
  timelineTitle2: { fontSize: 12, fontWeight: "600", color: theme.text, marginTop: 2 },
  timelineDesc: { fontSize: 10, color: theme.muted, marginTop: 2 },

  // Callout
  calloutCard: { borderRadius: 10, borderWidth: 1, padding: 10, marginVertical: 4 },
  calloutHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  calloutTitle: { fontSize: 12, fontWeight: "700" },
  calloutText: { fontSize: 12, color: theme.text, lineHeight: 17 },

  errorText: { fontSize: 11, color: theme.destructive },
});