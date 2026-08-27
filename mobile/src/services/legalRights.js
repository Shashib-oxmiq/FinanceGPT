// ── Legal Rights Service ──────────────────────────────────────────────────────
// Explains Indian citizen's legal rights in simple language.
// Consumer rights, tenant rights, employee rights, women's rights, traffic rights.
// Empowers citizens who get cheated because they don't know their rights.

export const LEGAL_RIGHTS = [
  {
    id: "consumer_defect",
    category: "Consumer Rights",
    title: "Defective Product? You can get refund + compensation",
    icon: "cart",
    summary: "If you buy a defective product, you're entitled to a refund, replacement, or compensation — even without a warranty.",
    rights: [
      "Right to seek redressal within 2 years of purchase",
      "File complaint at Consumer Forum — no lawyer needed for claims up to ₹50L",
      "District Forum: claims up to ₹50L. State Commission: ₹50L-₹2Cr. National: above ₹2Cr",
      "Filing fee: ₹100-₹5,000 based on claim amount",
      "Company must respond within 30 days. Decision within 3-6 months",
      "You can file online at edaaket.nic.in or consumercourts.gov.in",
    ],
    how_to: "1. Send written notice to seller/manufacturer\n2. Wait 30 days for response\n3. File complaint at consumer forum if no resolution\n4. No lawyer needed for claims < ₹50L — you can represent yourself",
    example: "Bought a ₹40,000 phone that stopped working in 2 months? The company says 'physical damage not covered'? You can file a consumer complaint. If the defect existed when you bought it, you're entitled to a free repair/replacement regardless of what the warranty says.",
  },
  {
    id: "consumer_service",
    category: "Consumer Rights",
    title: "Poor Service? You can claim refund + damages",
    icon: "construct",
    summary: "If a service provider (builder, mechanic, hotel, airline) provides deficient service, you can claim refund + compensation.",
    rights: [
      "Service deficiency covers: delay, poor quality, overcharging, false promises",
      "Builder delay? You're entitled to compensation for every month of delay",
      "Airline overbooked/delayed? Claim up to ₹25,000 compensation",
      "Bank charged unfair fees? File banking ombudsman complaint — free & online",
      "Telecom company overbilled? File at pgportal.gov.in",
    ],
    how_to: "1. Written complaint to service provider\n2. If unresolved in 30 days, file at Consumer Forum\n3. For banks: complaint at bankingombudsman.rbi.org.in\n4. For telecom: pgportal.gov.in",
    example: "Your builder promised possession in 2020, delivered in 2023? You can claim ₹5,000-₹15,000 per month of delay as compensation through RERA or Consumer Forum.",
  },
  {
    id: "tenant_rights",
    category: "Tenant Rights",
    title: "Tenant Rights — What your landlord can't do",
    icon: "home",
    summary: "As a tenant in India, you have legal protections. Your landlord cannot evict you without proper notice or increase rent arbitrarily.",
    rights: [
      "Landlord must give 15-30 days written notice before eviction (varies by state)",
      "Rent can only be increased as per the rent agreement — not arbitrarily",
      "Security deposit must be refunded within reasonable time after vacating",
      "Landlord cannot cut electricity/water to force eviction — it's illegal",
      "Landlord cannot enter your rented home without prior notice",
      "For 11-month agreements: no registration needed, but valid in court",
      "Eviction requires court order — landlord cannot forcibly evict you",
    ],
    how_to: "1. Always have a written rent agreement (even if 11 months)\n2. Keep proof of rent payments (bank transfer, receipts)\n3. If landlord harasses: file at Rent Controller / local police\n4. If deposit not returned: file consumer complaint or civil suit",
    example: "Your landlord keeps your ₹2L security deposit saying 'painting charges'? As per law, normal wear and tear cannot be deducted. Only actual damage beyond normal use can be deducted. File a consumer complaint.",
  },
  {
    id: "employee_salary",
    category: "Employee Rights",
    title: "Salary & Working Hours — Your rights as an employee",
    icon: "briefcase",
    summary: "Indian labor law protects your salary, working hours, leaves, and termination. Even private sector employees have rights.",
    rights: [
      "Maximum 9 hours/day, 48 hours/week. Overtime must be paid at 2x rate",
      "Salary must be paid by 7th of every month (Payment of Wages Act)",
      "Full & final settlement within 2 months of resignation",
      "Earned leave: minimum 15 days/year. Cannot be denied",
      "Maternity leave: 26 weeks paid (Maternity Benefit Act)",
      "Gratuity: After 5 years of service, you get 15 days salary per year worked",
      "Termination: 1-3 months notice or salary in lieu (varies by role)",
      "PF: Employer must contribute 12% of basic salary to your EPF",
    ],
    how_to: "1. Keep offer letter, salary slips, and appointment letter safe\n2. Salary delayed? File complaint at Labour Commissioner\n3. Illegal termination? File at Labour Court\n4. PF issues: epfigms.gov.in",
    example: "Your company fired you without notice and didn't pay last month's salary? You can file at the Labour Commissioner's office — they'll order the company to pay salary + notice period compensation.",
  },
  {
    id: "women_protection",
    category: "Women's Rights",
    title: "Women's Legal Protection — Laws every woman should know",
    icon: "woman",
    summary: "Indian law provides specific protections for women. These are enforceable rights, not suggestions.",
    rights: [
      "Right to file Zero FIR at ANY police station, regardless of where the crime happened",
      "Domestic violence: file under PWDVA — get protection order, residence right, maintenance",
      "Stalking/harassment: IPC Section 354D — up to 3 years imprisonment for stalker",
      "Workplace sexual harassment: file ICC complaint within 3 months (Posh Act)",
      "Dowry harassment: IPC Section 498A — cognizable, non-bailable offense",
      "Right to equal pay: Equal Remuneration Act — same pay for same work",
      "Free legal aid: Section 12 of Legal Services Authorities Act — women entitled regardless of income",
      "Helpline: 1091 (women's helpline), 181 (domestic violence)",
    ],
    how_to: "1. Call 1091 or 181 for immediate help\n2. File Zero FIR at any police station\n3. For domestic violence: file at Magistrate court under PWDVA\n4. For workplace harassment: file with Internal Complaints Committee\n5. Free legal aid: contact District Legal Services Authority",
    example: "Your husband takes your salary and hits you when you refuse? This is economic and physical abuse under the Domestic Violence Act. You can get a protection order, residence right (he can't throw you out), and monthly maintenance — all within 60 days.",
  },
  {
    id: "traffic_rights",
    category: "Traffic & Police",
    title: "Traffic Stop & Police Rights — What cops can and can't do",
    icon: "car",
    summary: "When stopped by police or traffic cops, you have rights. Knowing them prevents harassment and bribery.",
    rights: [
      "Traffic police MUST be in uniform and wearing name tag with badge number",
      "You can ask for the officer's name and badge number — it's your right",
      "For traffic challan: cop must issue written challan, not demand cash on spot",
      "You can refuse to pay cash fine — insist on court challan or online payment",
      "Police cannot search your phone without a warrant",
      "Police cannot arrest you without informing the reason for arrest",
      "You have the right to call a lawyer before answering questions",
      "Women cannot be arrested between 6 PM and 6 AM (except special circumstances)",
      "If detained, must be produced before magistrate within 24 hours",
    ],
    how_to: "1. Stay calm, ask for officer's name and badge number\n2. If challan: accept written challan, pay online later\n3. If arrested: ask for reason, demand lawyer, inform family\n4. If harassed: file complaint at police station or call 100",
    example: "A traffic cop stops you and says 'Give ₹500 or I'll seize your bike'? This is corruption. Ask for a written challan instead. You can pay the fine online or at court. If the cop insists on cash, note his badge number and call 100 or file at anti-corruption bureau.",
  },
  {
    id: "right_to_info",
    category: "Government Transparency",
    title: "Right to Information (RTI) — Make any govt department answer you",
    icon: "information-circle",
    summary: "RTI Act lets any citizen ask any government department for information. It costs just ₹10 and can expose corruption.",
    rights: [
      "File RTI with any government department for ₹10 (free for BPL)",
      "Response must come within 30 days (48 hours if life/liberty involved)",
      "No need to explain WHY you want the information",
      "If information denied: First Appeal within 30 days → Second Appeal to CIC",
      "Can file online at rtionline.gov.in (Central) or state RTI portals",
      "Penalty on officer who doesn't respond: ₹250/day up to ₹25,000",
    ],
    how_to: "1. Write application: 'Under RTI Act 2005, I seek following information...'\n2. Pay ₹10 (court fee stamp, IPO, or online payment)\n3. Submit to Public Information Officer of the department\n4. If no response in 30 days: First Appeal to First Appellate Authority\n5. If still unsatisfied: Second Appeal to Central/State Information Commission",
    example: "Your ration shop gives you less grain than entitled? File RTI asking 'How much grain was allocated to my ration card number XXX in the last 6 months?' The department must reply in 30 days. If the allocation was more than what you received, you have proof of corruption.",
  },
  {
    id: "property_rights",
    category: "Property Rights",
    title: "Property & Inheritance — Your rights as an owner/heir",
    icon: "business",
    summary: "Property disputes are the #1 type of litigation in India. Knowing your rights prevents fraud and family conflicts.",
    rights: [
      "Daughters have equal inheritance rights as sons (Hindu Succession Amendment 2005)",
      "A Will must be in writing, signed by testator + 2 witnesses — no stamp paper needed",
      "Without a Will: property distributed as per personal law (Hindu/Muslim/Christian)",
      "Property registration mandatory for sale deed, gift deed, lease > 12 months",
      "Encumbrance certificate proves property is free of loans/disputes — check before buying",
      "Mutation of property records after purchase is your right, not a favor",
      "Adverse possession: If someone occupies your land for 12+ years without objection, they can claim it",
    ],
    how_to: "1. Before buying property: check encumbrance certificate at sub-registrar office\n2. After purchase: apply for mutation within 3 months\n3. Inheritance dispute: file partition suit in civil court\n4. Illegal occupation: file eviction suit",
    example: "Your brother says 'Sisters don't get a share in ancestral property'? Wrong. After the 2005 amendment, daughters have equal coparcenary rights in ancestral property by birth — same as sons. You can file a partition suit claiming your share.",
  },
];

export function getLegalCategories() {
  return [...new Set(LEGAL_RIGHTS.map(r => r.category))].sort();
}

export function getRightsByCategory(category) {
  return LEGAL_RIGHTS.filter(r => r.category === category);
}

export function searchRights(query) {
  const q = query.toLowerCase();
  return LEGAL_RIGHTS.filter(r =>
    r.title.toLowerCase().includes(q) ||
    r.summary.toLowerCase().includes(q) ||
    r.category.toLowerCase().includes(q) ||
    r.rights.some(right => right.toLowerCase().includes(q))
  );
}