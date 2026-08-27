// ── Theme ────────────────────────────────────────────────────────────────────
// Mirrors the web app's dark theme

export const theme = {
  primary: "#6366f1",
  primaryLight: "#818cf8",
  accent: "#10b981",
  destructive: "#ef4444",
  background: "#0a0a0a",
  card: "#161618",
  cardElevated: "#1c1c1f",
  border: "#27272a",
  text: "#fafafa",
  textSecondary: "#a1a1aa",
  muted: "#71717a",
  input: "#1c1c1f",
  // Spacing
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  // Radius
  radius: 16,
  radiusLg: 24,
  // Font sizes
  caption: 11,
  body: 14,
  title: 18,
  heading: 24,
  // Shadows
  shadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

export const formatMoney = (v, currency) => {
  if (v == null || isNaN(Number(v))) return "—";
  const n = Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${currency} ${n}` : n;
};

export const formatDate = (dateStr) => {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return dateStr;
  }
};

export const typeLabel = (t) => (t || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());