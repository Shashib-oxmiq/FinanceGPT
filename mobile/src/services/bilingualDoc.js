// ── Bilingual Document Generation Service (F-216) ───────────────────────────
// Extends docGen to produce Hindi + English (and regional) legal documents.
// Key insight: many legal documents in India need to be in English for courts
// but users want to understand them in their native language.

import { generateDocumentObject } from "./docGen";

const BILINGUAL_TEMPLATES = {
  rental_agreement: {
    en: {
      title: "Residential Rental Agreement",
      sections: [
        { heading: "Parties", body: "This Rental Agreement is made between {landlord_name} (Landlord) and {tenant_name} (Tenant)." },
        { heading: "Property", body: "The Landlord agrees to rent the property at {property_address} to the Tenant." },
        { heading: "Term", body: "The agreement is valid for {tenure} months starting from {start_date}." },
        { heading: "Rent", body: "Monthly rent is ₹{rent_amount}, payable by {rent_due_day} of each month." },
        { heading: "Deposit", body: "Security deposit of ₹{deposit_amount} is paid by the Tenant, refundable at the time of vacating." },
        { heading: "Notice", body: "Either party may terminate with {notice_period} days written notice." },
        { heading: "Jurisdiction", body: "This agreement is governed by Indian law. Disputes shall be in {city} courts." },
      ],
    },
    hi: {
      title: "आवासीय किरायानामा",
      sections: [
        { heading: "पक्षकार", body: "यह किरायानामा {landlord_name} (मकान मालिक) और {tenant_name} (किरायेदार) के बीच बनाया गया है।" },
        { heading: "संपत्ति", body: "मकान मालिक {property_address} पर स्थित संपत्ति किराये पर देने के लिए सहमत हैं।" },
        { heading: "अवधि", body: "यह समझौता {start_date} से {tenure} महीने के लिए वैध है।" },
        { heading: "किराया", body: "मासिक किराया ₹{rent_amount} है, हर महीने की {rent_due_day} तक देय है।" },
        { heading: "जमा राशि", body: "₹{deposit_amount} की सुरक्षा जमा राशि किरायेदार द्वारा दी गई है, खाली करते समय वापस की जाएगी।" },
        { heading: "नोटिस", body: "कोई भी पक्ष {notice_period} दिन के लिखित नोटिस पर समझौता समाप्त कर सकता है।" },
        { heading: "क्षेत्राधिकार", body: "यह समझौता भारतीय कानून के अंतर्गत है। विवाद {city} न्यायालय में होंगे।" },
      ],
    },
  },
  affidavit: {
    en: {
      title: "General Affidavit",
      sections: [
        { heading: "Declaration", body: "I, {deponent_name}, son/daughter of {father_name}, aged {age} years, residing at {address}, do hereby solemnly affirm and declare as follows:" },
        { heading: "Statement", body: "{statement}" },
        { heading: "Verification", body: "I verify that the contents of this affidavit are true and correct to the best of my knowledge." },
      ],
    },
    hi: {
      title: "शपथ पत्र",
      sections: [
        { heading: "घोषणा", body: "मैं, {deponent_name}, {father_name} का पुत्र/पुत्री, आयु {age} वर्ष, निवासी {address}, द्वारा यह शपथपूर्वक घोषणा करता/करती हूं:" },
        { heading: "कथन", body: "{statement}" },
        { heading: "सत्यापन", body: "मैं सत्यापित करता/करती हूं कि इस शपथ पत्र की सामग्री मेरी जानकारी के अनुसार सत्य और सही है।" },
      ],
    },
  },
};

const LANG_NAMES = {
  en: "English", hi: "हिन्दी", mr: "मराठी", gu: "ગુજરાતી", bn: "বাংলা",
  ta: "தமிழ்", te: "తెలుగు", kn: "ಕನ್ನಡ", ml: "മലയാളം", pa: "ਪੰਜਾਬੀ",
};

export function getBilingualLanguages() {
  return Object.entries(LANG_NAMES).map(([code, name]) => ({ code, name }));
}

export function generateBilingualDocument(templateId, data, languages = ["en", "hi"]) {
  const template = BILINGUAL_TEMPLATES[templateId];
  if (!template) return null;

  const versions = {};
  for (const lang of languages) {
    if (!template[lang]) continue;
    const t = template[lang];
    const sections = t.sections.map(s => ({
      heading: s.heading,
      body: replacePlaceholders(s.body, data),
    }));
    versions[lang] = { title: t.title, sections };
  }

  // Build combined content (English first, then translation)
  let content = "";
  if (versions.en) {
    content += `=== ${versions.en.title} ===\n\n`;
    for (const s of versions.en.sections) {
      content += `${s.heading}:\n${s.body}\n\n`;
    }
  }
  for (const [lang, ver] of Object.entries(versions)) {
    if (lang === "en") continue;
    content += `\n=== ${LANG_NAMES[lang]} / ${ver.title} ===\n\n`;
    for (const s of ver.sections) {
      content += `${s.heading}:\n${s.body}\n\n`;
    }
  }

  return {
    type: "bilingual_document",
    title: versions.en?.title || "Document",
    template_id: templateId,
    languages,
    content,
    versions,
    data,
    generated_at: new Date().toISOString(),
  };
}

function replacePlaceholders(text, data) {
  return text.replace(/\{(\w+)\}/g, (match, key) => data[key] || match);
}

export function getBilingualTemplateIds() {
  return Object.keys(BILINGUAL_TEMPLATES);
}