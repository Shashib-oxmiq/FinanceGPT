// ── Offline AI Service ────────────────────────────────────────────────────────
// Framework for offline AI mode using on-device models.
// Currently provides offline mode detection, cached response fallback,
// and a framework for on-device model integration (Phi-3-mini, Gemma-2B via ONNX).
//
// FUTURE: When on-device models are available on React Native (via expo-ml or
// onnxruntime-react-native), this service will load a small quantized model
// for basic queries offline.

import { Platform } from "react-native";

const CACHE_KEY = "everkin_offline_cache";
const MODE_KEY = "everkin_offline_mode";

function getStorage() {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return {
      get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
      set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* */ } },
    };
  }
  return { get: () => null, set: () => {} };
}

// ── Online/offline detection ──
export function isOnline() {
  if (Platform.OS === "web" && typeof navigator !== "undefined") {
    return navigator.onLine;
  }
  return true; // Assume online on native
}

// ── Subscribe to connectivity changes ──
export function subscribeToConnectivity(callback) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const onOnline = () => callback(true);
    const onOffline = () => callback(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }
  return () => {};
}

// ── Cache AI responses for offline fallback ──
export async function cacheResponse(query, response) {
  const storage = getStorage();
  const raw = await storage.get(CACHE_KEY);
  let cache = {};
  try { cache = JSON.parse(raw || "{}"); } catch { /* */ }

  // Keep max 50 cached responses
  const keys = Object.keys(cache);
  if (keys.length >= 50) {
    delete cache[keys[0]];
  }

  // Simple key: first 100 chars of query
  const key = query.substring(0, 100).toLowerCase().trim();
  cache[key] = { response, timestamp: Date.now() };
  await storage.set(CACHE_KEY, JSON.stringify(cache));
}

// ── Get cached response ──
export async function getCachedResponse(query) {
  const storage = getStorage();
  const raw = await storage.get(CACHE_KEY);
  if (!raw) return null;
  try {
    const cache = JSON.parse(raw);
    const key = query.substring(0, 100).toLowerCase().trim();
    const entry = cache[key];
    if (entry) return entry.response;
  } catch { /* */ }
  return null;
}

// ── Offline-capable queries (static knowledge base) ──
const OFFLINE_KB = {
  "pan card": "To apply for a PAN card:\n1. Visit https://www.protean-tinpan.com or UTIITSL\n2. Fill Form 49A (individuals)\n3. Submit ID proof (Aadhaar), address proof, and date of birth proof\n4. Pay ₹107 fee\n5. PAN is delivered in 15-20 days\n\nYou can also apply through Aadhaar e-KYC for faster processing.",
  "aadhaar": "To get an Aadhaar card:\n1. Visit any Aadhaar enrollment center\n2. Bring ID proof, address proof, and DOB proof\n3. Biometric data (fingerprints, iris scan) collected\n4. Free of cost\n5. Delivered in 90 days\n\nDownload e-Aadhaar from https://uidai.gov.in",
  "insurance": "Essential insurance for every Indian:\n1. Term Life Insurance: At least 10x your annual income. Cheapest form of life cover.\n2. Health Insurance: At least ₹5 lakh family floater. Consider ₹10L+ for metro cities.\n3. Accident Insurance: Personal accident cover of ₹10-20L.\n\nAvoid: ULIPs, endowment plans, money-back policies — they mix insurance with investment and give poor returns on both.",
  "tax slab": "New Tax Regime (FY 2024-25):\n• Up to ₹3L: 0%\n• ₹3-7L: 5%\n• ₹7-10L: 10%\n• ₹10-12L: 15%\n• ₹12-15L: 20%\n• Above ₹15L: 30%\n\nStandard deduction: ₹50,000\nNo exemptions/deductions except NPS 80CCD(2) for employers.\n\nOld regime allows 80C (₹1.5L), 80D (health insurance), HRA, etc.",
  "sip": "SIP (Systematic Investment Plan) is the best way to invest in mutual funds:\n• Start with as little as ₹500/month\n• Rupee cost averaging: buy more units when markets are down\n• Power of compounding over long term\n• ₹5,000/month for 20 years at 12% = ₹50L invested → ₹1.9 crore\n\nChoose: Index funds (lowest cost), Flexi-cap funds (diversified), or ELSS (tax-saving under 80C).",
  "will": "Making a Will in India:\n1. Write clearly on paper (no stamp paper needed)\n2. State: 'This is my last Will and testament'\n3. List all assets and who gets what\n4. Appoint an executor\n5. Sign in presence of 2 witnesses (they must also sign)\n6. Register with sub-registrar (optional but recommended)\n\nA Will made on plain paper is valid if properly witnessed. No lawyer required but recommended for complex assets.",
  "rental agreement": "Rental Agreement (Rent/Lease Deed):\n1. Draft on stamp paper (₹100-₹500 depending on state)\n2. Include: parties, property address, rent, deposit, tenure, notice period\n3. Standard: 11-month agreement (no registration needed)\n4. Both parties sign + 2 witnesses\n5. Register if tenure > 12 months\n\nKey clauses: rent escalation, maintenance, pets, sub-letting, termination.",
  "affidavit": "Common affidavit types:\n• ID Affidavit: Declare name/address variations\n• Income Affidavit: For scholarship/fee waiver\n• Residence Proof: When no utility bill available\n• HEIRSHIP: For inheritance claims\n\nFormat: Stamp paper → Title → Deponent details → Declaration → Verification → Notary stamp.\nNotary fee: ₹30-₹200 depending on affidavit type.",
};

// ── Try to answer offline using static KB or cached responses ──
export async function getOfflineResponse(query) {
  const lowerQuery = query.toLowerCase();

  // Check static knowledge base
  for (const [key, response] of Object.entries(OFFLINE_KB)) {
    if (lowerQuery.includes(key)) {
      return { response, source: "offline_kb" };
    }
  }

  // Check cached AI responses
  const cached = await getCachedResponse(query);
  if (cached) {
    return { response: cached, source: "cache" };
  }

  // Generic offline response
  return {
    response: "I'm currently in offline mode and can't reach the AI server. " +
      "I can help with basic questions about PAN cards, Aadhaar, insurance, tax slabs, SIPs, wills, rental agreements, and affidavits. " +
      "For anything else, please connect to the internet and try again. " +
      "Your saved data (investments, documents, reminders) is still accessible.",
    source: "offline_fallback",
  };
}

// ── Set/get offline mode preference ──
export async function setOfflineMode(enabled) {
  const storage = getStorage();
  await storage.set(MODE_KEY, String(enabled));
}

export async function getOfflineMode() {
  const storage = getStorage();
  const val = await storage.get(MODE_KEY);
  return val === "true";
}