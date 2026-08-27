// ── Property & Asset Registry Service (F-213) ────────────────────────────────
import { dbAll, dbRun, uuid } from "./db";

export async function getProperties(userId) {
  return await dbAll("SELECT * FROM properties WHERE user_id = ? ORDER BY purchase_date DESC", [userId]) || [];
}
export async function createProperty(userId, d) {
  const id = uuid();
  await dbRun("INSERT INTO properties (property_id, user_id, property_type, address, city, state, purchase_price, current_value, purchase_date, area_sqft, ownership, property_tax_due, property_tax_amount, mutation_status, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    [id, userId, d.property_type, d.address||"", d.city||"", d.state||"", d.purchase_price||0, d.current_value||d.purchase_price||0, d.purchase_date||"", d.area_sqft||0, d.ownership||"sole", d.property_tax_due||"", d.property_tax_amount||0, d.mutation_status||"pending", d.notes||""]);
  return { property_id: id, ...d };
}
export async function updateProperty(propId, updates) {
  const fields = [], vals = [];
  for (const [k,v] of Object.entries(updates)) { if (["current_value","property_tax_due","property_tax_amount","mutation_status","notes","ownership"].includes(k)) { fields.push(`${k}=?`); vals.push(v); } }
  if (fields.length) { vals.push(propId); await dbRun(`UPDATE properties SET ${fields.join(",")} WHERE property_id=?`, vals); }
}
export async function deleteProperty(propId) { await dbRun("DELETE FROM properties WHERE property_id=?", [propId]); }

export async function getPropertySummary(userId) {
  const props = await getProperties(userId);
  const totalValue = props.reduce((s,p) => s + (Number(p.current_value)||0), 0);
  const totalPurchase = props.reduce((s,p) => s + (Number(p.purchase_price)||0), 0);
  const totalAppreciation = totalValue - totalPurchase;
  const appreciationPct = totalPurchase > 0 ? Math.round((totalAppreciation / totalPurchase) * 100) : 0;
  const totalTaxDue = props.reduce((s,p) => s + (Number(p.property_tax_amount)||0), 0);
  const mutationPending = props.filter(p => p.mutation_status === "pending").length;
  return { props, totalValue, totalPurchase, totalAppreciation, appreciationPct, totalTaxDue, mutationPending, count: props.length };
}

export const PROPERTY_TYPES = [
  { key: "residential", label: "Residential (House/Flat)", icon: "home", color: "#10b981" },
  { key: "commercial", label: "Commercial (Shop/Office)", icon: "business", color: "#3b82f6" },
  { key: "land", label: "Plot/Land", icon: "landscape", color: "#f59e0b" },
  { key: "agricultural", label: "Agricultural Land", icon: "leaf", color: "#10b981" },
  { key: "vehicle", label: "Vehicle (Car/Bike)", icon: "car", color: "#ec4899" },
  { key: "gold", label: "Gold/Jewellery", icon: "diamond", color: "#eab308" },
  { key: "other", label: "Other Asset", icon: "cube", color: "#6b7280" },
];

// ── Property tax info by state ──
export const PROPERTY_TAX_INFO = {
  "Delhi": { authority: "MCD/NDMC", url: "mcdpropertytax.nic.in", frequency: "Annual", due: "April-March" },
  "Mumbai": { authority: "MCGM/BMC", url: "propertytax.mumbaicorporation.mcgov.in", frequency: "Half-yearly", due: "Apr & Oct" },
  "Bangalore": { authority: "BBMP", url: "bbmptax.karnataka.gov.in", frequency: "Annual", due: "April" },
  "Hyderabad": { authority: "GHMC", url: "ghmc.gov.in", frequency: "Annual", due: "July" },
  "Pune": { authority: "PMC", url: "propertytax.punecorporation.org", frequency: "Half-yearly", due: "Apr & Oct" },
  "Chennai": { authority: "GCC", url: "chennaicorporation.gov.in", frequency: "Half-yearly", due: "Apr & Oct" },
  "Kolkata": { authority: "KMC", url: "kmcgov.in", frequency: "Quarterly", due: "Apr, Jul, Oct, Jan" },
  "default": { authority: "Local Municipal Corporation", url: "Check local municipal website", frequency: "Annual", due: "Varies" },
};