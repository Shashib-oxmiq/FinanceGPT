export const CATEGORY_LABELS = {
  financial: "Financial",
  tax: "Tax",
  bank_statement: "Bank Statement",
  credit_card_statement: "Credit Card",
  investment: "Investment",
  insurance: "Insurance",
  education: "Education",
  identity: "Identity",
  medical: "Medical & Health",
  property: "Property",
  vehicle: "Vehicle",
  legal_estate: "Legal / Estate",
  warranty: "Warranty",
  subscription: "Subscription",
  employment: "Employment",
  immigration: "Immigration",
  personal: "Personal",
  other: "Other",
};

export const catLabel = (c) => CATEGORY_LABELS[c] || c;
