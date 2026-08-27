// ── Big Purchase Advisor Service ──────────────────────────────────────────────
// Helps young people make responsible borrowing decisions. When a user asks
// "Can I afford to buy X?", the advisor:
// 1. Asks for price, EMI/interest rate, loan tenure
// 2. Classifies the asset (appreciating vs depreciating)
// 3. Analyzes affordability against their income, existing EMIs, and savings
// 4. Flags debt burden ratio and previous debt patterns
// 5. Ranks the decision (Excellent/Good/Caution/Risky/Avoid)
// 6. Returns visualization markers for chat rendering
//
// This is NOT just a calculator — it's an emotional + financial decision helper.

import { api } from "./api";
import { getLoans } from "./loans";
import { getExpenses } from "./expenses";
import { getGoals } from "./goals";
import { computeHealthScore } from "./healthScore";

// ── Asset classification ──
const ASSET_TYPES = {
  // Appreciating assets (build wealth over time)
  real_estate: { type: "appreciating", label: "Real Estate / Property", avgAppreciation: 0.08, liquidity: "medium", sellDifficulty: "medium", notes: "Property generally appreciates but is illiquid. Selling takes 3-12 months." },
  land: { type: "appreciating", label: "Land / Plot", avgAppreciation: 0.10, liquidity: "low", sellDifficulty: "high", notes: "Land appreciates well but is very hard to sell quickly." },
  gold: { type: "appreciating", label: "Gold / Jewelry", avgAppreciation: 0.07, liquidity: "high", sellDifficulty: "low", notes: "Gold holds value and is easy to sell." },
  education: { type: "appreciating", label: "Education / Skills", avgAppreciation: 0.15, liquidity: "n/a", sellDifficulty: "n/a", notes: "Education is the best investment — highest ROI long term." },
  business: { type: "appreciating", label: "Business / Equipment", avgAppreciation: 0.12, liquidity: "low", sellDifficulty: "high", notes: "Business equipment can generate income but is hard to sell." },
  mutual_funds: { type: "appreciating", label: "Mutual Funds / Stocks", avgAppreciation: 0.12, liquidity: "high", sellDifficulty: "low", notes: "Liquid investments, easy to sell." },

  // Depreciating assets (lose value over time)
  car: { type: "depreciating", label: "Car / Vehicle", avgAppreciation: -0.15, liquidity: "medium", sellDifficulty: "medium", notes: "Cars lose 15-20% per year. A 10L car is worth 6L in 3 years." },
  bike: { type: "depreciating", label: "Bike / Scooter", avgAppreciation: -0.20, liquidity: "medium", sellDifficulty: "low", notes: "Two-wheelers depreciate fast — 20% per year." },
  phone: { type: "depreciating", label: "Smartphone / Electronics", avgAppreciation: -0.40, liquidity: "low", sellDifficulty: "high", notes: "Phones lose 40-50% value in year one. A 1L phone is worth 40K in 12 months." },
  laptop: { type: "depreciating", label: "Laptop / Computer", avgAppreciation: -0.35, liquidity: "low", sellDifficulty: "high", notes: "Electronics lose 35%+ per year." },
  furniture: { type: "depreciating", label: "Furniture / Appliances", avgAppreciation: -0.25, liquidity: "low", sellDifficulty: "high", notes: "Furniture and appliances lose 25%+ value per year." },
  travel: { type: "depreciating", label: "Travel / Vacation", avgAppreciation: -1.0, liquidity: "n/a", sellDifficulty: "n/a", notes: "Travel has zero resale value. Only emotional/mental value." },
  wedding: { type: "depreciating", label: "Wedding / Event", avgAppreciation: -1.0, liquidity: "n/a", sellDifficulty: "n/a", notes: "Events have zero financial resale value. Emotional value only." },
  fashion: { type: "depreciating", label: "Fashion / Luxury", avgAppreciation: -0.50, liquidity: "low", sellDifficulty: "high", notes: "Fashion items lose 50%+ value immediately." },
};

// ── Classify purchase from natural language ──
export function classifyPurchase(itemText) {
  if (!itemText) return null;
  const lower = itemText.toLowerCase();
  
  const classifiers = [
    { keywords: ["home", "house", "flat", "apartment", "villa", "property", "2bhk", "3bhk"], type: "real_estate" },
    { keywords: ["land", "plot", "farm", "agricultural land"], type: "land" },
    { keywords: ["gold", "jewelry", "jewellery", "ornament"], type: "gold" },
    { keywords: ["education", "course", "degree", "mba", "certification", "training", "upskilling"], type: "education" },
    { keywords: ["business", "shop", "equipment", "machinery", "inventory"], type: "business" },
    { keywords: ["car", "vehicle", "auto", "sedan", "suv", "honda", "maruti", "hyundai", "tata car"], type: "car" },
    { keywords: ["bike", "scooter", "motorcycle", "activa", "pulsar", "royal enfield"], type: "bike" },
    { keywords: ["phone", "iphone", "samsung", "oneplus", "smartphone", "mobile"], type: "phone" },
    { keywords: ["laptop", "macbook", "computer", "desktop", "tablet", "ipad"], type: "laptop" },
    { keywords: ["furniture", "sofa", "bed", "fridge", "washing machine", "ac", "tv", "appliance"], type: "furniture" },
    { keywords: ["travel", "trip", "vacation", "holiday", "honeymoon", "tour"], type: "travel" },
    { keywords: ["wedding", "marriage", "reception", "engagement"], type: "wedding" },
    { keywords: ["watch", "bag", "shoes", "clothes", "luxury", "gucci", "rolex"], type: "fashion" },
    { keywords: ["mutual fund", "stocks", "sip", "investment", "etf"], type: "mutual_funds" },
  ];
  
  for (const c of classifiers) {
    if (c.keywords.some(kw => lower.includes(kw))) {
      return ASSET_TYPES[c.type] || null;
    }
  }
  return null; // Unknown — ask user to classify
}

// ── Calculate EMI ──
function calcEMI(principal, annualRate, tenureMonths) {
  if (!principal || !annualRate || !tenureMonths) return 0;
  const r = annualRate / 12 / 100;
  if (r === 0) return principal / tenureMonths;
  const emi = principal * r * Math.pow(1 + r, tenureMonths) / (Math.pow(1 + r, tenureMonths) - 1);
  return Math.round(emi);
}

// ── Main analysis function ──
export async function analyzePurchase(userId, purchaseData) {
  const {
    item,           // "iPhone 15 Pro" or "2BHK flat in Pune"
    price,          // 150000
    downPayment,    // 0 (optional)
    interestRate,   // 14 (annual %)
    tenureMonths,   // 24
    monthlyIncome,  // optional, loaded from profile if not given
  } = purchaseData;

  if (!price || price <= 0) return null;

  // Load user financial data
  let loans = [], expenses = [], goals = [], healthScore = null;
  let userProfile = null;
  try { loans = await getLoans(userId) || []; } catch (e) { console.warn("Purchase advisor: loans load failed"); }
  try { expenses = await getExpenses(userId) || []; } catch (e) { console.warn("Purchase advisor: expenses load failed"); }
  try { goals = await getGoals(userId) || []; } catch (e) { console.warn("Purchase advisor: goals load failed"); }
  try { healthScore = await computeHealthScore(userId); } catch (e) { console.warn("Purchase advisor: health score failed"); }

  // Classify the asset
  const assetClass = classifyPurchase(item);
  const isAppreciating = assetClass ? assetClass.type === "appreciating" : null;
  
  // Calculate loan amount
  const loanAmount = price - (downPayment || 0);
  const emi = calcEMI(loanAmount, interestRate || 0, tenureMonths || 0);
  const totalPayment = emi * (tenureMonths || 0);
  const totalInterest = totalPayment - loanAmount;

  // Calculate existing EMI burden
  const existingEMIs = loans.reduce((sum, l) => sum + (l.emi_amount || l.monthly_emi || 0), 0);
  const existingLoanTotal = loans.reduce((sum, l) => sum + (l.principal_amount || l.outstanding || l.loan_amount || 0), 0);

  // Estimate monthly income (from health score or default)
  const income = monthlyIncome || healthScore?.monthlyIncome || 50000;
  const totalEMIBurden = existingEMIs + emi;
  const emiRatio = totalEMIBurden / income;
  
  // After EMI, what's left for living?
  const afterEMI = income - totalEMIBurden;
  const minLivingCost = 15000; // Minimum survival cost in India
  const safetyMargin = afterEMI - minLivingCost;

  // Future value of asset vs total cost
  let futureValue = price;
  let futureValueAfterTenure = price;
  if (assetClass && isAppreciating !== null) {
    const years = (tenureMonths || 0) / 12;
    futureValueAfterTenure = price * Math.pow(1 + (assetClass.avgAppreciation || 0), years);
  }

  const netCost = totalPayment - futureValueAfterTenure; // If positive, you lose money
  const isWealthBuilding = isAppreciating && futureValueAfterTenure > totalPayment;

  // ── Decision ranking algorithm ──
  let rank = "Good";
  let rankColor = "#10b981";
  let rankIcon = "checkmark-circle";
  let reasons = [];

  if (emiRatio > 0.5) {
    rank = "Avoid";
    rankColor = "#ef4444";
    rankIcon = "close-circle";
    reasons.push("Your total EMI burden would exceed 50% of income — this is dangerous.");
  } else if (emiRatio > 0.4) {
    rank = "Risky";
    rankColor = "#f97316";
    rankIcon = "warning";
    reasons.push("EMI burden would be 40-50% of income — leaves very little room for emergencies.");
  } else if (emiRatio > 0.3) {
    rank = "Caution";
    rankColor = "#f59e0b";
    rankIcon = "alert-circle";
    reasons.push("EMI burden would be 30-40% of income — manageable but tight.");
  } else if (emiRatio > 0.15) {
    rank = "Good";
    rankColor = "#10b981";
    rankIcon = "checkmark-circle";
    reasons.push("EMI burden is 15-30% of income — healthy range.");
  } else {
    rank = "Excellent";
    rankColor = "#10b981";
    rankIcon = "trophy";
    reasons.push("EMI burden is under 15% of income — very comfortable.");
  }

  // Adjust for asset type
  if (isAppreciating === false) {
    if (rank === "Excellent") { rank = "Good"; rankColor = "#10b981"; rankIcon = "checkmark-circle"; }
    if (rank === "Good") { rank = "Caution"; rankColor = "#f59e0b"; rankIcon = "alert-circle"; }
    reasons.push(`${assetClass?.label || "This item"} is a DEPRECIATING asset — it loses ${(Math.abs(assetClass?.avgAppreciation || 0) * 100).toFixed(0)}% value per year.`);
  } else if (isAppreciating === true) {
    reasons.push(`${assetClass?.label || "This item"} is an APPRECIATING asset — it can build wealth over time.`);
  }

  // Adjust for safety margin
  if (safetyMargin < 0) {
    rank = "Avoid";
    rankColor = "#ef4444";
    rankIcon = "close-circle";
    reasons.push(`After all EMIs, you'd have Rs. ${afterEMI} left — less than the Rs. 15K minimum living cost. This is financially dangerous.`);
  } else if (safetyMargin < 5000) {
    if (rank !== "Avoid") { rank = "Risky"; rankColor = "#f97316"; rankIcon = "warning"; }
    reasons.push(`After EMIs, you'd have only Rs. ${safetyMargin} buffer — one emergency could push you into debt spiral.`);
  }

  // Flag existing debt patterns
  let debtWarnings = [];
  if (loans.length > 3) {
    debtWarnings.push(`You already have ${loans.length} active loans — adding more debt increases your financial risk.`);
  }
  if (existingEMIs > income * 0.3) {
    debtWarnings.push(`Your existing EMI burden is already ${(existingEMIs / income * 100).toFixed(0)}% of income — near the danger zone before this purchase.`);
  }
  const creditCardLoans = loans.filter(l => (l.loan_type || "").toLowerCase().includes("credit") || (l.loan_type || "").toLowerCase().includes("personal"));
  if (creditCardLoans.length > 0) {
    const ccTotal = creditCardLoans.reduce((s, l) => s + (l.principal_amount || l.outstanding || 0), 0);
    debtWarnings.push(`You have ${creditCardLoans.length} high-interest loan(s) totaling Rs. ${(ccTotal / 100000).toFixed(1)}L — pay these off first before taking new debt.`);
  }

  // ── Build visualization markers for chat ──
  const vizBlocks = [];

  // 1. Decision rank stat card
  vizBlocks.push(`[STAT:{"label":"Decision","value":"${rank}","icon":"${rankIcon}","color":"${rankColor}"}]`);

  // 2. EMI burden gauge
  vizBlocks.push(`[PROGRESS:{"label":"EMI Burden (should be under 30%)","percent":${Math.min(100, Math.round(emiRatio * 100))},"color":"${emiRatio > 0.4 ? "#ef4444" : emiRatio > 0.3 ? "#f59e0b" : "#10b981"}"}]`);

  // 3. Key numbers table
  vizBlocks.push(`[TABLE:{"title":"Purchase Analysis","headers":["Metric","Value"],"rows":[["Item","${item || "Purchase"}"],["Price","Rs. ${(price / 100000).toFixed(2)}L"],["Loan Amount","Rs. ${((loanAmount) / 100000).toFixed(2)}L"],["Monthly EMI","Rs. ${emi.toLocaleString("en-IN")}"],["Total Interest","Rs. ${(totalInterest / 100000).toFixed(2)}L"],["Total Payment","Rs. ${(totalPayment / 100000).toFixed(2)}L"],["EMI / Income","${(emiRatio * 100).toFixed(0)}%"],["After EMI left","Rs. ${afterEMI.toLocaleString("en-IN")}"],["Asset Type","${isAppreciating === true ? "Appreciating" : isAppreciating === false ? "Depreciating" : "Unknown"}"]]}]`);

  // 4. Asset value comparison
  if (assetClass && isAppreciating !== null) {
    const futureText = isAppreciating 
      ? `In ${((tenureMonths || 0) / 12).toFixed(1)} years, this asset could be worth Rs. ${(futureValueAfterTenure / 100000).toFixed(2)}L`
      : `In ${((tenureMonths || 0) / 12).toFixed(1)} years, this asset will be worth only Rs. ${(futureValueAfterTenure / 100000).toFixed(2)}L`;
    vizBlocks.push(`[COMPARE:{"title":"Total Cost vs Future Value","leftLabel":"You Pay","leftValue":"Rs. ${(totalPayment / 100000).toFixed(2)}L","rightLabel":"Worth in ${((tenureMonths || 0) / 12).toFixed(0)}yr","rightValue":"Rs. ${(futureValueAfterTenure / 100000).toFixed(2)}L","better":"${isWealthBuilding ? "right" : "left"}"}]`);
  }

  // 5. Debt warnings callout
  if (debtWarnings.length > 0) {
    vizBlocks.push(`[CALLOUT:{"type":"warning","title":"Existing Debt Red Flags","text":"${debtWarnings.join(" ")}"}]`);
  }

  // 6. Recommendation callout
  let recommendation = "";
  if (rank === "Avoid") {
    recommendation = `This purchase is financially risky for you right now. Consider: (1) Save up and buy in 6-12 months, (2) Buy a cheaper alternative, (3) Clear existing high-interest loans first. Your financial wellbeing matters more than this purchase.`;
  } else if (rank === "Risky") {
    recommendation = `This is affordable but tight. If you proceed: (1) Build a 3-month emergency fund first, (2) Consider a larger down payment to reduce EMI, (3) Avoid any other new loans while this EMI is active.`;
  } else if (rank === "Caution") {
    recommendation = `This is manageable. Before proceeding: ensure you have a 3-month emergency fund, and this EMI won't block your monthly investment/SIP goals.`;
  } else {
    recommendation = `This purchase fits comfortably in your budget. You can proceed — just ensure your emergency fund and insurance coverage are in place.`;
  }
  vizBlocks.push(`[CALLOUT:{"type":"${rank === "Avoid" || rank === "Risky" ? "danger" : rank === "Caution" ? "warning" : "success"}","title":"My Advice","text":"${recommendation}"}]`);

  // ── Build text response ──
  const assetText = assetClass 
    ? `\n\n**Asset Type:** ${assetClass.label} — ${isAppreciating ? "this can build wealth" : "this loses value over time"}. ${assetClass.notes}\n`
    : "";
  
  const reasonsText = reasons.map(r => `• ${r}`).join("\n");
  const debtText = debtWarnings.length > 0 ? `\n\n**Your Debt Red Flags:**\n${debtWarnings.map(d => `• ${d}`).join("\n")}` : "";

  const fullText = `## Purchase Analysis: ${item || "Your Purchase"}\n\nHere's my honest assessment — not just numbers, but whether this is a wise decision for your financial wellbeing.\n\n${reasonsText}${assetText}${debtText}\n\n${vizBlocks.join("\n\n")}\n\nRemember: the goal isn't to stop you from enjoying life — it's to make sure this purchase doesn't become a burden that haunts you for years. Young people often underestimate how fast small EMIs add up.`;

  return {
    rank,
    rankColor,
    emi,
    emiRatio,
    totalInterest,
    totalPayment,
    futureValueAfterTenure,
    isAppreciating,
    assetClass,
    debtWarnings,
    reasons,
    recommendation,
    vizText: fullText,
  };
}

// ── Detect if user message is about a purchase decision ──
export function isPurchaseQuestion(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  const triggers = [
    "can i afford", "should i buy", "is it worth buying",
    "want to buy", "thinking of buying", "planning to buy",
    "should i take loan for", "can i get", "worth it",
    "emi for", "how much will it cost", "is it advisable",
    "good idea to buy", "should i purchase",
  ];
  return triggers.some(t => lower.includes(t));
}

// ── Extract purchase details from user message ──
export function extractPurchaseInfo(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  
  // Extract price (Rs. 50000, 50000, 50k, 1.5L, 2 lakh)
  let price = 0;
  const lakhMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:l|lakh|lac)/);
  const croreMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:cr|crore)/);
  const kMatch = lower.match(/(\d+(?:\.\d+)?)\s*k\b/);
  const rsMatch = text.match(/[rs\.]?\s*(\d{4,})/i);
  
  if (croreMatch) price = parseFloat(croreMatch[1]) * 10000000;
  else if (lakhMatch) price = parseFloat(lakhMatch[1]) * 100000;
  else if (kMatch) price = parseFloat(kMatch[1]) * 1000;
  else if (rsMatch) price = parseFloat(rsMatch[1]);

  // Extract EMI (EMI of 5000, EMI 3000)
  let emi = 0;
  const emiMatch = lower.match(/emi\s*(?:of|is|:)?\s*(\d+)/);
  if (emiMatch) emi = parseInt(emiMatch[1]);

  // Extract interest rate (14%, 12 percent, rate of 14)
  let rate = 0;
  const rateMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:%|percent|p\.a|pa)\b/);
  if (rateMatch) rate = parseFloat(rateMatch[1]);

  // Extract tenure (24 months, 2 years, 36 months)
  let tenure = 0;
  const monthMatch = lower.match(/(\d+)\s*months?/);
  const yearMatch = lower.match(/(\d+)\s*years?/);
  if (monthMatch) tenure = parseInt(monthMatch[1]);
  else if (yearMatch) tenure = parseInt(yearMatch[1]) * 12;

  // Extract the item name (basic — remove trigger words)
  let item = text.replace(/can i afford|should i buy|is it worth|to buy|thinking of|planning to|want to|should i purchase|good idea to/gi, "").replace(/[rs\.]?\s*\d+\s*(?:l|lakh|lac|k|cr|crore|months?|years?|%|percent)?/gi, "").trim();
  if (item.length > 80) item = item.substring(0, 80);
  
  return { price, emi, rate, tenure, item };
}