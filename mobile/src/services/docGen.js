// ── Document Generation Service (v2) ─────────────────────────────────────────
// AI-native: generates structured document objects for in-chat display.
// The old paradigm was "download a .txt file." The new paradigm is:
// the AI hands you a completed document as a rich card in the conversation.
//
// Documents are born in chat, previewed in chat, saved to vault from chat,
// and shared from chat. File download is a secondary fallback only.

import { Platform, Share, Alert } from "react-native";

const TEMPLATES = {
  rental_agreement: {
    title: "Rental Agreement",
    category: "Legal",
    fields: ["landlord_name", "tenant_name", "property_address", "rent_amount", "security_deposit", "lease_start_date", "lease_end_date"],
    body: (d) => `RENTAL AGREEMENT

This Rental Agreement is made on ${d.lease_start_date || "____"} between ${d.landlord_name || "____"} (Landlord) and ${d.tenant_name || "____"} (Tenant).

WHEREAS the Landlord owns the property at ${d.property_address || "____"}.

1. TENURE: ${d.lease_start_date || "____"} to ${d.lease_end_date || "____"}.
2. RENT: Rs. ${d.rent_amount || "____"} per month, payable by 5th.
3. SECURITY DEPOSIT: Rs. ${d.security_deposit || "____"}, refundable subject to damages.
4. USE: Residential purposes only.
5. TERMINATION: 30 days written notice.

Landlord: ${d.landlord_name || "____"}
Tenant: ${d.tenant_name || "____"}
Witness 1: ____________________
Witness 2: ____________________`,
  },
  nda: {
    title: "Non-Disclosure Agreement",
    category: "Legal",
    fields: ["disclosing_party", "receiving_party", "effective_date", "purpose", "duration_months"],
    body: (d) => `NON-DISCLOSURE AGREEMENT

Made on ${d.effective_date || "____"} between ${d.disclosing_party || "____"} (Disclosing Party) and ${d.receiving_party || "____"} (Receiving Party).

PURPOSE: ${d.purpose || "Business exploration"}

1. CONFIDENTIAL INFORMATION: Proprietary data, trade secrets, business plans.
2. OBLIGATIONS: Receiving Party shall keep secret, not disclose, use solely for purpose.
3. DURATION: ${d.duration_months || "24"} months.
4. EXCLUSIONS: Public info, independently developed, rightfully received.
5. REMEDIES: Injunctive relief and damages for breach.

Disclosing Party: ${d.disclosing_party || "____"}
Receiving Party: ${d.receiving_party || "____"}
Date: ${d.effective_date || "____"}`,
  },
  will: {
    title: "Last Will and Testament",
    category: "Legal",
    fields: ["testator_name", "testator_address", "beneficiary_name", "relationship", "asset_description", "witness_1", "witness_2"],
    body: (d) => `LAST WILL AND TESTAMENT OF ${(d.testator_name || "____").toUpperCase()}

I, ${d.testator_name || "____"}, residing at ${d.testator_address || "____"}, being of sound mind, declare this my Last Will.

1. REVOCATION: I revoke all prior wills.
2. BENEFICIARY: ${d.beneficiary_name || "____"}, my ${d.relationship || "____"}.
3. ASSETS: ${d.asset_description || "All my properties and possessions."}
4. EXECUTOR: ${d.beneficiary_name || "____"} shall execute this will.

Testator: ${d.testator_name || "____"}
Witness 1: ${d.witness_1 || "____"}
Witness 2: ${d.witness_2 || "____"}`,
  },
  employment_contract: {
    title: "Employment Contract",
    category: "Legal",
    fields: ["employer_name", "employee_name", "position", "salary", "start_date", "probation_months"],
    body: (d) => `EMPLOYMENT CONTRACT

Made on ${d.start_date || "____"} between ${d.employer_name || "____"} (Employer) and ${d.employee_name || "____"} (Employee).

1. POSITION: ${d.position || "____"}
2. START DATE: ${d.start_date || "____"}
3. PROBATION: ${d.probation_months || "3"} months
4. SALARY: Rs. ${d.salary || "____"} per month
5. HOURS: 9 AM to 6 PM, Mon-Fri
6. TERMINATION: 30 days notice

Employer: ${d.employer_name || "____"}
Employee: ${d.employee_name || "____"}`,
  },
  loan_agreement: {
    title: "Loan Agreement",
    category: "Legal",
    fields: ["lender_name", "borrower_name", "loan_amount", "interest_rate", "loan_date", "repayment_date"],
    body: (d) => `LOAN AGREEMENT

Made on ${d.loan_date || "____"} between ${d.lender_name || "____"} (Lender) and ${d.borrower_name || "____"} (Borrower).

1. AMOUNT: Rs. ${d.loan_amount || "____"}
2. INTEREST: ${d.interest_rate || "0"}% per annum
3. REPAYMENT: On or before ${d.repayment_date || "____"}
4. PREPAYMENT: Allowed without penalty
5. DEFAULT: Legal action may be taken

Lender: ${d.lender_name || "____"}
Borrower: ${d.borrower_name || "____"}`,
  },
  power_of_attorney: {
    title: "Power of Attorney",
    category: "Legal",
    fields: ["principal_name", "agent_name", "scope", "effective_date", "is_durable"],
    body: (d) => `POWER OF ATTORNEY

I, ${d.principal_name || "____"}, appoint ${d.agent_name || "____"} as my attorney-in-fact.

SCOPE: ${d.scope || "Manage all financial and property affairs."}
EFFECTIVE: ${d.effective_date || "____"}
DURABILITY: ${d.is_durable === "true" ? "Durable (survives incapacity)" : "Non-durable"}

The agent may sign documents, manage accounts, buy/sell property.

Principal: ${d.principal_name || "____"}
Agent: ${d.agent_name || "____"}`,
  },
  partnership_deed: {
    title: "Partnership Deed",
    category: "Legal",
    fields: ["partner_1", "partner_2", "business_name", "capital_1", "capital_2", "profit_ratio"],
    body: (d) => `PARTNERSHIP DEED

Between ${d.partner_1 || "____"} and ${d.partner_2 || "____"}.

1. FIRM: "${d.business_name || "____"}"
2. CAPITAL: ${d.partner_1 || "____"}: Rs. ${d.capital_1 || "____"}, ${d.partner_2 || "____"}: Rs. ${d.capital_2 || "____"}
3. PROFIT: ${d.profit_ratio || "50:50"}
4. BANKING: Joint operation
5. DISSOLUTION: 30 days mutual notice

Partner 1: ${d.partner_1 || "____"}
Partner 2: ${d.partner_2 || "____"}`,
  },
  sale_deed: {
    title: "Sale Deed",
    category: "Legal",
    fields: ["seller_name", "buyer_name", "property_description", "sale_amount", "sale_date", "registration_location"],
    body: (d) => `SALE DEED

Executed on ${d.sale_date || "____"} at ${d.registration_location || "____"}.

BETWEEN: ${d.seller_name || "____"} (Seller) AND ${d.buyer_name || "____"} (Buyer).

1. PROPERTY: ${d.property_description || "____"}
2. PRICE: Rs. ${d.sale_amount || "____"}, paid in full
3. POSSESSION: Handed over to Buyer
4. TITLE: Clear, free from encumbrances

Seller: ${d.seller_name || "____"}
Buyer: ${d.buyer_name || "____"}`,
  },
};

// ── Generate a structured document object for in-chat display ─────────────────
// Returns { type, title, content, fields, template_id, generated_at }
// The ChatScreen passes this to <DocumentCard> for rich rendering.
export function generateDocumentObject(templateId, data) {
  const tpl = TEMPLATES[templateId];
  if (!tpl) {
    // If AI provides freeform content directly, use it as-is
    if (data && data.content) {
      return {
        type: templateId || "custom",
        title: data.title || "Document",
        content: data.content,
        fields: data.fields || {},
        template_id: null,
        generated_at: new Date().toISOString(),
      };
    }
    throw new Error("Unknown template: " + templateId);
  }
  return {
    type: templateId,
    title: tpl.title,
    content: tpl.body(data || {}),
    fields: data || {},
    template_id: templateId,
    generated_at: new Date().toISOString(),
  };
}

// ── Generate plain text (legacy compat) ─────────────────────────────────────
export function generateDocumentText(templateId, data) {
  const doc = generateDocumentObject(templateId, data);
  return doc.content;
}

// ── Template metadata for AI to know what fields to ask for ──────────────────
export function getTemplateList() {
  return Object.entries(TEMPLATES).map(([id, t]) => ({
    id,
    name: t.title,
    category: t.category,
    fields: t.fields,
  }));
}

export function getTemplate(id) {
  const tpl = TEMPLATES[id];
  if (!tpl) return null;
  return { id, ...tpl };
}

// ── Share document (primary action — replaces download) ─────────────────────
// On native: uses Share API (WhatsApp, Email, AirDrop, etc.)
// On web: copies to clipboard
export async function shareDocument(doc) {
  const text = typeof doc === "string" ? doc : (doc.content || doc);
  const title = typeof doc === "string" ? "Document" : (doc.title || "Document");

  if (Platform.OS === "web") {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return { ok: true, method: "clipboard" };
    }
    return { ok: false, error: "Clipboard not available" };
  }

  try {
    await Share.share({ title, message: text });
    return { ok: true, method: "share" };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── Download document (secondary fallback — legacy compat) ──────────────────
export async function downloadDocument(templateId, data, format) {
  const text = generateDocumentText(templateId, data);
  const tpl = TEMPLATES[templateId] || { title: "Document" };
  const filename = (tpl.title.replace(/[^a-zA-Z0-9]/g, "_") + "." + (format || "txt")).toLowerCase();

  if (Platform.OS === "web") {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return { ok: true, filename };
  }

  try {
    const Sharing = require("expo-sharing");
    const FileSystem = require("expo-file-system");
    const path = FileSystem.documentDirectory + filename;
    await FileSystem.writeAsStringAsync(path, text);
    await Sharing.shareAsync(path, { mimeType: "text/plain", dialogTitle: tpl.title });
    return { ok: true, filename, path };
  } catch (e) {
    return { ok: false, error: e.message, text };
  }
}

// ── Form checklist as in-chat message (not file download) ───────────────────
// Returns a structured checklist object that ChatScreen renders as a rich card.
export function generateChecklistObject(form, userDocs) {
  const requiredDocs = (form.documents || "").split(",").map((d) => d.trim()).filter(Boolean);
  const have = userDocs || [];
  const matched = requiredDocs.filter((d) =>
    have.some((u) => u.original_filename?.toLowerCase().includes(d.toLowerCase()) || u.category?.toLowerCase().includes(d.toLowerCase()))
  );
  const missing = requiredDocs.filter((d) => !matched.includes(d));

  return {
    type: "checklist",
    title: `Checklist: ${form.name}`,
    form_id: form.id,
    authority: form.authority,
    fees: form.fees,
    processing_time: form.processing_time,
    required: requiredDocs,
    matched,
    missing,
    matched_count: matched.length,
    missing_count: missing.length,
    content: [
      `DOCUMENT CHECKLIST: ${form.name}`,
      `Authority: ${form.authority}`,
      `Fees: ${form.fees}`,
      `Processing: ${form.processing_time}`,
      "",
      "REQUIRED DOCUMENTS:",
      ...requiredDocs.map((d, i) => {
        const has = matched.includes(d);
        return `  ${i + 1}. [${has ? "✓" : " "}] ${d}${has ? " (in your vault)" : ""}`;
      }),
      "",
      matched.length === requiredDocs.length
        ? "✅ All documents are in your vault. You're ready to apply!"
        : `⚠ ${missing.length} document(s) missing. Ask me how to get them.`,
    ].join("\n"),
    generated_at: new Date().toISOString(),
  };
}

// ── Legacy checklist download (deprecated — kept for compat) ────────────────
export async function downloadFormChecklist(form, userDocs) {
  const checklist = generateChecklistObject(form, userDocs);
  const text = checklist.content;
  const filename = form.name.replace(/[^a-zA-Z0-9]/g, "_") + "_checklist.txt";

  if (Platform.OS === "web") {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return { ok: true, filename };
  }

  try {
    const Sharing = require("expo-sharing");
    const FileSystem = require("expo-file-system");
    const path = FileSystem.documentDirectory + filename;
    await FileSystem.writeAsStringAsync(path, text);
    await Sharing.shareAsync(path, { mimeType: "text/plain", dialogTitle: "Checklist: " + form.name });
    return { ok: true, filename, path };
  } catch (e) {
    return { ok: false, error: e.message, text };
  }
}