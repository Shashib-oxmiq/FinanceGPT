// Everkin content script — intelligently fills form fields from the user's profile.
function flattenProfile(profile) {
  const flat = {};
  for (const section of Object.values(profile || {})) {
    if (section && typeof section === "object") {
      for (const [k, v] of Object.entries(section)) {
        if (v) flat[k] = String(v);
      }
    }
  }
  return flat;
}

// Map profile keys to common field-name aliases found on the web.
const ALIASES = {
  full_name: ["name", "fullname", "full-name", "your name"],
  email: ["email", "e-mail", "mail"],
  phone: ["phone", "mobile", "tel", "telephone", "contact"],
  date_of_birth: ["dob", "birth", "birthdate", "date of birth"],
  address_line: ["address", "street", "addr", "address1", "address line"],
  city: ["city", "town"],
  state: ["state", "province", "region"],
  postal_code: ["zip", "postal", "postcode", "pincode", "pin"],
  country: ["country", "nation"],
  passport_number: ["passport"],
  national_id: ["national id", "nid", "aadhaar", "aadhar"],
  ssn: ["ssn", "social security"],
  occupation: ["occupation", "job", "profession"],
  employer: ["employer", "company", "organization"],
  nationality: ["nationality", "citizenship"],
  gender: ["gender", "sex"],
  spouse_name: ["spouse", "partner"],
};

function labelTextFor(el) {
  let text = `${el.name || ""} ${el.id || ""} ${el.placeholder || ""} ${el.getAttribute("aria-label") || ""}`;
  if (el.id) {
    const lbl = document.querySelector(`label[for="${el.id}"]`);
    if (lbl) text += " " + lbl.textContent;
  }
  const wrapLabel = el.closest("label");
  if (wrapLabel) text += " " + wrapLabel.textContent;
  return text.toLowerCase();
}

function matchKey(text, flat) {
  for (const [key, val] of Object.entries(flat)) {
    const aliases = ALIASES[key] || [];
    const needles = [key.replace(/_/g, " "), ...aliases];
    if (needles.some((n) => text.includes(n))) return val;
  }
  return null;
}

function fillForms(profile) {
  const flat = flattenProfile(profile);
  const fields = document.querySelectorAll("input, textarea, select");
  let filled = 0;
  fields.forEach((el) => {
    const type = (el.type || "").toLowerCase();
    if (["hidden", "submit", "button", "file", "password", "checkbox", "radio"].includes(type)) return;
    if (el.value) return;
    const text = labelTextFor(el);
    const value = matchKey(text, flat);
    if (value) {
      el.focus();
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.style.outline = "2px solid #10b981";
      filled++;
    }
  });
  return filled;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "VAULTKIN_FILL") {
    const filled = fillForms(msg.profile);
    sendResponse({ filled });
  }
  return true;
});
