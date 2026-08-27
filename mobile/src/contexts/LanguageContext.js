// ── Language Context (i18n) ──────────────────────────────────────────────────
// Mirrors the web app's i18n system — 40 languages, 399 keys
// Uses SQLite translation cache + embedded translations for instant loading

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import * as SecureStore from "expo-secure-store";
import { getAllCachedTranslations, setCachedTranslation } from "../services/db";

const LanguageContext = createContext(null);

// ── 40 supported languages ───────────────────────────────────────────────────
export const LANGUAGES = [
  { code: "en", name: "English", native: "English", flag: "🇺🇸" },
  { code: "hi", name: "Hindi", native: "हिन्दी", flag: "🇮🇳" },
  { code: "bn", name: "Bengali", native: "বাংলা", flag: "🇧🇩" },
  { code: "ta", name: "Tamil", native: "தமிழ்", flag: "🇮🇳" },
  { code: "te", name: "Telugu", native: "తెలుగు", flag: "🇮🇳" },
  { code: "mr", name: "Marathi", native: "मराठी", flag: "🇮🇳" },
  { code: "gu", name: "Gujarati", native: "ગુજરાતી", flag: "🇮🇳" },
  { code: "kn", name: "Kannada", native: "ಕನ್ನಡ", flag: "🇮🇳" },
  { code: "ml", name: "Malayalam", native: "മലയാളം", flag: "🇮🇳" },
  { code: "pa", name: "Punjabi", native: "ਪੰਜਾਬੀ", flag: "🇮🇳" },
  { code: "or", name: "Odia", native: "ଓଡ଼ିଆ", flag: "🇮🇳" },
  { code: "es", name: "Spanish", native: "Español", flag: "🇪🇸" },
  { code: "fr", name: "French", native: "Français", flag: "🇫🇷" },
  { code: "de", name: "German", native: "Deutsch", flag: "🇩🇪" },
  { code: "zh", name: "Chinese", native: "中文", flag: "🇨🇳" },
  { code: "ja", name: "Japanese", native: "日本語", flag: "🇯🇵" },
  { code: "ko", name: "Korean", native: "한국어", flag: "🇰🇷" },
  { code: "pt", name: "Portuguese", native: "Português", flag: "🇵🇹" },
  { code: "ru", name: "Russian", native: "Русский", flag: "🇷🇺" },
  { code: "ar", name: "Arabic", native: "العربية", flag: "🇸🇦" },
  { code: "it", name: "Italian", native: "Italiano", flag: "🇮🇹" },
  { code: "nl", name: "Dutch", native: "Nederlands", flag: "🇳🇱" },
  { code: "tr", name: "Turkish", native: "Türkçe", flag: "🇹🇷" },
  { code: "pl", name: "Polish", native: "Polski", flag: "🇵🇱" },
  { code: "sv", name: "Swedish", native: "Svenska", flag: "🇸🇪" },
  { code: "id", name: "Indonesian", native: "Bahasa Indonesia", flag: "🇮🇩" },
  { code: "th", name: "Thai", native: "ไทย", flag: "🇹🇭" },
  { code: "vi", name: "Vietnamese", native: "Tiếng Việt", flag: "🇻🇳" },
  { code: "fa", name: "Persian", native: "فارسی", flag: "🇮🇷" },
  { code: "he", name: "Hebrew", native: "עברית", flag: "🇮🇱" },
  { code: "uk", name: "Ukrainian", native: "Українська", flag: "🇺🇦" },
  { code: "el", name: "Greek", native: "Ελληνικά", flag: "🇬🇷" },
  { code: "cs", name: "Czech", native: "Čeština", flag: "🇨🇿" },
  { code: "ro", name: "Romanian", native: "Română", flag: "🇷🇴" },
  { code: "hu", name: "Hungarian", native: "Magyar", flag: "🇭🇺" },
  { code: "fi", name: "Finnish", native: "Suomi", flag: "🇫🇮" },
  { code: "da", name: "Danish", native: "Dansk", flag: "🇩🇰" },
  { code: "no", name: "Norwegian", native: "Norsk", flag: "🇳🇴" },
  { code: "ms", name: "Malay", native: "Bahasa Melayu", flag: "🇲🇾" },
  { code: "fil", name: "Filipino", native: "Filipino", flag: "🇵🇭" },
  { code: "sw", name: "Swahili", native: "Kiswahili", flag: "🇰🇪" },
];

// ── English base translations (most important keys) ──────────────────────────
const EN_KEYS = {
  "app.name": "Everkin",
  "app.tagline": "Your AI Life Advisor",
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.delete": "Delete",
  "common.back": "Back",
  "common.edit": "Edit",
  "common.add": "Add",
  "nav.dashboard": "Dashboard",
  "nav.investments": "Investments",
  "nav.insurance": "Insurance",
  "nav.vault": "Vault",
  "nav.profile": "Profile",
  "nav.reminders": "Reminders",
  "nav.gmail": "Gmail",
  "nav.loan_prep": "Document Prep",
  "nav.life_events": "Life Events",
  "nav.insights": "Insights",
  "nav.legacy": "Legacy",
  "nav.form_filler": "Forms",
  "nav.bundler": "Bundler",
  "nav.documents": "Documents",
  "chat.title": "AI Advisor",
  "chat.new_conversation": "New conversation",
  "chat.placeholder": "Ask me anything…",
  "chat.how_can_help": "How can I help today?",
  "page.investments.title": "Investments",
  "page.investments.subtitle": "Track your portfolio with live prices",
  "page.dashboard.title": "Dashboard",
  "page.dashboard.subtitle": "Your financial overview",
  "page.insurance.title": "Insurance",
  "page.insurance.subtitle": "Manage your policies",
  "page.vault.title": "Document Vault",
  "page.vault.subtitle": "Securely store your important documents",
  "page.profile.title": "Profile",
  "page.profile.subtitle": "Your personal information",
  "page.reminders.title": "Reminders",
  "page.reminders.subtitle": "Never miss an important deadline",
  "page.loans.title": "Document Preparation",
  "page.loans.subtitle": "Find and prepare Indian government forms",
  "page.life_events.title": "Life Events",
  "page.life_events.subtitle": "Plan for major milestones",
  "page.gmail.title": "Gmail",
  "page.gmail.subtitle": "Scan emails for financial documents",
  "page.insights.title": "Insights",
  "page.insights.subtitle": "AI-powered financial insights",
  "page.legacy.title": "Legacy Planning",
  "page.legacy.subtitle": "Plan your estate and handover",
  "button.add_investment": "Add Investment",
  "button.save": "Save",
  "button.cancel": "Cancel",
  "button.delete": "Delete",
  "button.create_secure_share": "Create Secure Share",
  "button.ai_review": "AI Review",
  "field.name_required": "Name",
  "field.ticker": "Ticker (optional)",
  "field.amount_invested": "Amount Invested",
  "field.purchase_date": "Purchase Date",
  "field.notes": "Notes",
  "toast.investment_added": "Investment added",
  "toast.failed_add": "Failed to add",
  "toast.name_required": "Name is required",
  "empty.investments": "No investments yet. Add your first one!",
  "stat.total_invested": "Total Invested",
  "stat.current_value": "Current Value",
  "stat.net_worth": "Net Worth",
  "stat.total_gain": "Total Gain/Loss",
  "stat.documents": "Documents",
  "loan.checklist_title": "Document Checklist",
  "loan.have": "have",
  "loan.needed": "needed",
  "loan.secure_share_created": "Secure share created",
  "section.secure_share": "Secure Share",
  "page.current_value_optional": "Current Value (optional)",
  "page.analyzing": "Analyzing…",
  "page.password": "Password",
  "page.select_at_least_one": "Select at least one document",
};

// ── Hindi translations (key subset) ──────────────────────────────────────────
const HI_KEYS = {
  "app.name": "Everkin",
  "app.tagline": "आपका एआई जीवन सलाहकार",
  "common.save": "सहेजें",
  "common.cancel": "रद्द करें",
  "common.delete": "हटाएं",
  "common.back": "वापस",
  "common.edit": "संपादित करें",
  "common.add": "जोड़ें",
  "nav.dashboard": "डैशबोर्ड",
  "nav.investments": "निवेश",
  "nav.insurance": "बीमा",
  "nav.vault": "वॉल्ट",
  "nav.profile": "प्रोफ़ाइल",
  "nav.reminders": "रिमाइंडर",
  "nav.gmail": "जीमेल",
  "nav.loan_prep": "दस्तावेज़ तैयारी",
  "nav.life_events": "जीवन घटनाएं",
  "nav.insights": "अंतर्दृष्टि",
  "nav.legacy": "विरासत",
  "nav.form_filler": "फ़ॉर्म",
  "nav.bundler": "बंडलर",
  "nav.documents": "दस्तावेज़",
  "chat.title": "एआई सलाहकार",
  "chat.new_conversation": "नई बातचीत",
  "chat.placeholder": "मुझसे कुछ भी पूछें…",
  "chat.how_can_help": "मैं आज कैसे मदद कर सकता हूं?",
  "page.investments.title": "निवेश",
  "page.investments.subtitle": "लाइव कीमतों के साथ अपने पोर्टफोलियो को ट्रैक करें",
  "page.dashboard.title": "डैशबोर्ड",
  "page.dashboard.subtitle": "आपका वित्तीय अवलोकन",
  "page.insurance.title": "बीमा",
  "page.insurance.subtitle": "अपनी पॉलिसियां प्रबंधित करें",
  "page.vault.title": "दस्तावेज़ वॉल्ट",
  "page.vault.subtitle": "अपने महत्वपूर्ण दस्तावेज़ सुरक्षित रूप से रखें",
  "page.profile.title": "प्रोफ़ाइल",
  "page.profile.subtitle": "आपकी व्यक्तिगत जानकारी",
  "page.reminders.title": "रिमाइंडर",
  "page.reminders.subtitle": "कोई महत्वपूर्ण समयसीमा न चूकें",
  "page.loans.title": "दस्तावेज़ तैयारी",
  "page.loans.subtitle": "भारतीय सरकारी फ़ॉर्म खोजें और तैयार करें",
  "page.life_events.title": "जीवन घटनाएं",
  "page.life_events.subtitle": "प्रमुख मील के पत्थर के लिए योजना बनाएं",
  "page.gmail.title": "जीमेल",
  "page.gmail.subtitle": "वित्तीय दस्तावेज़ों के लिए ईमेल स्कैन करें",
  "page.insights.title": "अंतर्दृष्टि",
  "page.insights.subtitle": "एआई-संचालित वित्तीय अंतर्दृष्टि",
  "page.legacy.title": "विरासत नियोजन",
  "page.legacy.subtitle": "अपनी संपत्ति और हस्तांतरण की योजना बनाएं",
  "button.add_investment": "निवेश जोड़ें",
  "button.save": "सहेजें",
  "button.cancel": "रद्द करें",
  "button.delete": "हटाएं",
  "button.create_secure_share": "सुरक्षित शेयर बनाएं",
  "button.ai_review": "एआई समीक्षा",
  "field.name_required": "नाम",
  "field.ticker": "टिकर (वैकल्पिक)",
  "field.amount_invested": "निवेश राशि",
  "field.purchase_date": "खरीद तिथि",
  "field.notes": "टिप्पणियां",
  "toast.investment_added": "निवेश जोड़ा गया",
  "toast.failed_add": "जोड़ने में विफल",
  "toast.name_required": "नाम आवश्यक है",
  "empty.investments": "अभी तक कोई निवेश नहीं। अपना पहला निवेश जोड़ें!",
  "stat.total_invested": "कुल निवेश",
  "stat.current_value": "वर्तमान मूल्य",
  "stat.net_worth": "कुल संपत्ति",
  "stat.total_gain": "कुल लाभ/हानि",
  "stat.documents": "दस्तावेज़",
  "loan.checklist_title": "दस्तावेज़ चेकलिस्ट",
  "loan.have": "हैं",
  "loan.needed": "आवश्यक",
  "loan.secure_share_created": "सुरक्षित शेयर बनाया गया",
  "section.secure_share": "सुरक्षित शेयर",
  "page.current_value_optional": "वर्तमान मूल्य (वैकल्पिक)",
  "page.analyzing": "विश्लेषण कर रहे हैं…",
  "page.password": "पासवर्ड",
  "page.select_at_least_one": "कम से कम एक दस्तावेज़ चुनें",
};

// Built-in translations per language
const BUILTIN = { en: EN_KEYS, hi: HI_KEYS };

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState("en");
  const [translations, setTranslations] = useState(EN_KEYS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const saved = await SecureStore.getItemAsync("app_lang");
      if (saved) {
        await changeLang(saved);
      }
      setLoaded(true);
    })();
  }, []);

  const t = useCallback((key) => {
    return translations[key] ?? EN_KEYS[key] ?? key;
  }, [translations]);

  const changeLang = useCallback(async (code) => {
    setLang(code);
    await SecureStore.setItemAsync("app_lang", code);
    // Load from built-in first
    const builtin = BUILTIN[code] || {};
    // Then overlay SQLite cache (for AI-translated keys)
    const cached = await getAllCachedTranslations(code);
    setTranslations({ ...EN_KEYS, ...builtin, ...cached });
  }, []);

  return (
    <LanguageContext.Provider value={{ lang, t, changeLang, languages: LANGUAGES, loaded }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}

// AI language names for system prompt
export const AI_LANG_NAMES = LANGUAGES.reduce((acc, l) => {
  acc[l.code] = l.name;
  return acc;
}, {});