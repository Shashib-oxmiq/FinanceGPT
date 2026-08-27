/**
 * QA Test Suite for Everkin Mobile App
 * 
 * Usage: Open the app in browser, login as demo, then paste this in console:
 *   await window.__runQATest()
 * 
 * Or run via browser automation by injecting this script.
 * 
 * Tests all 22+ screens for: content presence, no crash errors, PanelChat availability,
 * and expected seed data markers.
 */

const SCREENS = [
  // Tab screens (navigated via tab bar)
  { name: "Chat (Advisor)", type: "tab", tab: "Advisor", markers: ["How can I help", "AI Advisor"] },
  { name: "Dashboard (Home)", type: "tab", tab: "Home", markers: ["Hello", "Financial Health"] },
  { name: "Investments (Money)", type: "tab", tab: "Money", markers: ["Reliance", "HDFC", "Nifty", "SBI", "Bitcoin", "Gold"] },
  { name: "Insurance", type: "tab", tab: "Insurance", markers: ["Term Life", "LIC", "Star Health", "Bajaj", "ICICI"] },
  { name: "Forms (LoanPrep)", type: "tab", tab: "Forms", markers: ["loan", "Loan", "form", "Form", "prepare", "Checklist"] },
  
  // Stack screens (navigated from Dashboard navItems)
  { name: "Vault", type: "stack", nav: "Vault", markers: ["Aadhaar", "PAN", "document", "Document", "Vault"] },
  { name: "Reminders", type: "stack", nav: "Reminders", markers: ["electricity", "insurance", "reminder", "Reminder", "premium", "bill"] },
  { name: "Schemes", type: "stack", nav: "Schemes", markers: ["scheme", "Scheme", "government", "Government", "PM", "subsidy", "benefit"] },
  { name: "Goals", type: "stack", nav: "Goals", markers: ["Emergency Fund", "Dream Vacation", "New Car", "Wedding", "goal", "Goal"] },
  { name: "Loans", type: "stack", nav: "Loans", markers: ["SBI", "HDFC", "Axis", "Home Loan", "Car Loan", "Personal Loan", "EMI"] },
  { name: "Bills", type: "stack", nav: "Bills", markers: ["BSES", "Airtel", "Jio", "Delhi Jal", "gas", "bill", "Bill", "electricity"] },
  { name: "Tax", type: "stack", nav: "Tax", markers: ["2024-25", "ITR", "tax", "Tax", "income", "deduction", "regime"] },
  { name: "Retirement", type: "stack", nav: "Retirement", markers: ["NPS", "EPF", "PPF", "retirement", "Retirement", "corpus", "pension"] },
  { name: "Education", type: "stack", nav: "Education", markers: ["Aarav", "Engineering", "education", "Education", "child", "school", "college"] },
  { name: "Property", type: "stack", nav: "Property", markers: ["Gurugram", "Dwarka", "property", "Property", "Sector", "Shop"] },
  { name: "MedicalRecords", type: "stack", nav: "Medical", markers: ["checkup", "Blood test", "medical", "Medical", "prescription", "lab", "doctor"] },
  { name: "LegalRights", type: "stack", nav: "Rights", markers: ["right", "Right", "legal", "Legal", "law", "consumer", "RTI"] },
  { name: "Expenses", type: "stack", nav: "Expenses", markers: ["Big Bazaar", "Uber", "Amazon", "expense", "Expense", "groceries", "dining"] },
  { name: "Family", type: "stack", nav: "Family", markers: ["Priya", "Aarav", "Rajesh", "family", "Family", "spouse", "son", "father"] },
  { name: "Profile", type: "stack", nav: "Profile", markers: ["profile", "Profile", "settings", "Settings", "language", "Language", "account"] },
  
  // Stack screens (navigated from Chat sidebar)
  { name: "Insights", type: "sidebar", nav: "Insights", markers: ["insight", "Insight", "recommendation", "analysis"] },
  { name: "Legacy", type: "sidebar", nav: "Legacy", markers: ["Emergency", "emergency", "Legacy", "legacy", "kin", "dead", "inactive", "grace"] },
  { name: "Gmail", type: "sidebar", nav: "Gmail", markers: ["Gmail", "gmail", "email", "Email", "inbox", "connect"] },
  { name: "Bundler", type: "sidebar", nav: "Bundler", markers: ["bundle", "Bundle", "bundler", "Bundler", "package", "share"] },
  { name: "FormFiller", type: "sidebar", nav: "FormFiller", markers: ["form", "Form", "fill", "Fill", "prepare", "document"] },
  { name: "LifeEvents", type: "sidebar", nav: "LifeEvents", markers: ["life", "Life", "event", "Event", "milestone", "checklist"] },
];

export function getQAScreens() { return SCREENS; }

export function formatQAReport(results) {
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  const lines = [
    `═══════════════════════════════════════════`,
    `  QA TEST REPORT — ${results.length} screens tested`,
    `  ✅ Passed: ${passed}  ❌ Failed: ${failed}`,
    `═══════════════════════════════════════════`,
  ];
  for (const r of results) {
    const icon = r.pass ? "✅" : "❌";
    const detail = r.pass ? `${r.foundMarkers}/${r.expectedMarkers} markers` : (r.error || `content=${r.hasContent} markers=${r.foundMarkers}/${r.expectedMarkers} error=${r.hasError}`);
    lines.push(`${icon} ${r.screen.padEnd(22)} ${detail}`);
    if (r.preview) lines.push(`   preview: ${r.preview}`);
  }
  lines.push(`═══════════════════════════════════════════`);
  return lines.join("\n");
}