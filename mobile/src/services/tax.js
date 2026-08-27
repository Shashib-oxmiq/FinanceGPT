/**
 * tax.js - Indian Income Tax Planning Engine (FY 2025-26 / AY 2026-27)
 *
 * Comprehensive tax planning service for the FinanceGPT mobile app.
 *
 * - FY 2025-26 new & old regime slabs with surcharge, cess and 87A rebate
 * - Standard deduction (Rs.75K new / Rs.50K old)
 * - Old-regime deduction sections (80C/80D/80CCD/80G/80E/24(b)/HRA/LTA...)
 * - Capital gains (STCG/LTCG for equity, debt & property)
 * - TDS tracking, advance tax schedule, ITR checklist, tax calendar
 * - Projected annual tax across both regimes
 * - SQLite-backed tables for income, investments, TDS & checklist items
 *
 * STAGING COPY - root must copy this verbatim to:
 *   /Users/shashib/Documents/finchat/mobile/src/services/tax.js
 * (this worker cannot write outside the workspace root)
 */

const { dbAll, dbRun, dbGet, uuid } = require('./db');

/* =========================================================================
 * Constants & lookup tables
 * ========================================================================= */

const FY = '2025-26';

// Slab helper: { from, to, rate } in rupees; `to: Infinity` for top slab.
const NEW_REGIME_SLABS = [
  { from: 0, to: 400000, rate: 0 },
  { from: 400000, to: 800000, rate: 0.05 },
  { from: 800000, to: 1200000, rate: 0.1 },
  { from: 1200000, to: 1600000, rate: 0.15 },
  { from: 1600000, to: 2000000, rate: 0.2 },
  { from: 2000000, to: 2400000, rate: 0.25 },
  { from: 2400000, to: Infinity, rate: 0.3 },
];

// Old regime basic exemption differs by age group (below60 / senior / superSenior).
const OLD_REGIME_BASE_EXEMPTION = {
  below60: 250000,
  senior: 300000,      // 60-80 years
  superSenior: 500000, // 80+ years
};

const OLD_REGIME_SLABS = [
  { from: 0, to: 250000, rate: 0 },
  { from: 250000, to: 500000, rate: 0.05 },
  { from: 500000, to: 1000000, rate: 0.2 },
  { from: 1000000, to: Infinity, rate: 0.3 },
];

// Surcharge slabs resolved by increasing taxable income thresholds.
const SURCHARGE_SLABS = [
  { above: 5000000, rate: 0.10 },  // 50L-1Cr => 10%
  { above: 10000000, rate: 0.15 }, // 1Cr-2Cr => 15%
  { above: 20000000, rate: 0.25 }, // 2Cr-5Cr => 25%
  { above: 50000000, rate: 0.37 }, // >5Cr => 37%
];

const CESS_RATE = 0.04;

const STANDARD_DEDUCTION = {
  new: 75000,
  old: 50000,
};

// 87A rebate limits: new regime zero tax up to Rs.12L taxable; old up to Rs.5L basic.
const REBATE = {
  new: { limit: 1200000, zeroIncome: 1200000 },
  old: { limit: 500000, zeroIncome: 500000 },
};

/* All deduction sections. Most apply to the OLD regime only; 80CCD(1B) is
 * available in BOTH regimes. */
const DEDUCTION_SECTIONS = {
  '80C': {
    name: '80C',
    limit: 150000,
    regimes: ['old'],
    description: 'EPF, PPF, ELSS, LIC, NSC, home loan principal, tuition fees, SCSS, Sukanya Samriddhi',
    category: 'Investment',
  },
  '80D': {
    name: '80D',
    limit: 100000, // 25K self + 25K/50K parents (senior) + 5K preventive checkup
    regimes: ['old'],
    description: 'Health insurance premium: Rs.25K self/family + Rs.5K preventive checkup; Rs.25K parents (or Rs.50K if senior citizen). Max total Rs.1,00,000.',
    category: 'Health',
  },
  '80CCD(1)': {
    name: '80CCD(1)',
    limit: 150000,
    regimes: ['old'],
    description: 'NPS employer + employee contribution (within overall 80C limit of Rs.1.5L)',
    category: 'Pension',
  },
  '80CCD(1B)': {
    name: '80CCD(1B)',
    limit: 50000,
    regimes: ['new', 'old'],
    description: 'NPS additional contribution - available in BOTH regimes',
    category: 'Pension',
  },
  '80G': {
    name: '80G',
    limit: Infinity,
    regimes: ['old'],
    description: 'Donations to approved funds - 50% or 100% deduction (with/without qualifying limit)',
    category: 'Charity',
  },
  '80E': {
    name: '80E',
    limit: Infinity,
    regimes: ['old'],
    description: 'Interest on education loan - full amount, no limit, up to 8 years',
    category: 'Education',
  },
  '80EE': {
    name: '80EE',
    limit: 50000,
    regimes: ['old'],
    description: 'First-time home buyer - additional home loan interest Rs.50,000',
    category: 'Home',
  },
  '80EEA': {
    name: '80EEA',
    limit: 150000,
    regimes: ['old'],
    description: 'First-time home buyer (extended) - additional Rs.1,50,000 interest (loan sanctioned FY 2019-22)',
    category: 'Home',
  },
  '24(b)': {
    name: '24(b)',
    limit: 200000,
    regimes: ['old'],
    description: 'Home loan interest - Rs.2,00,000 max (self-occupied); unlimited for let-out property',
    category: 'Home',
  },
  '80TTA': {
    name: '80TTA',
    limit: 10000,
    regimes: ['old'],
    description: 'Savings account interest deduction',
    category: 'Savings',
  },
  '80TTB': {
    name: '80TTB',
    limit: 50000,
    regimes: ['old'],
    description: 'Senior citizen savings interest deduction',
    category: 'Savings',
  },
  '80DD': {
    name: '80DD',
    limit: 125000,
    regimes: ['old'],
    description: 'Disability of dependent - Rs.75,000 (40-80%) or Rs.1,25,000 (80%+)',
    category: 'Disability',
  },
  '80DDB': {
    name: '80DDB',
    limit: 100000,
    regimes: ['old'],
    description: 'Medical treatment - Rs.40,000 (below 60) or Rs.1,00,000 (60+)',
    category: 'Medical',
  },
  '80U': {
    name: '80U',
    limit: 125000,
    regimes: ['old'],
    description: 'Self disability - same limits as 80DD',
    category: 'Disability',
  },
  'HRA': {
    name: 'HRA',
    limit: Infinity,
    regimes: ['old'],
    description: 'House rent allowance - metro 50% / non-metro 40% of basic; least of (HRA, rent-10% of basic, 50/40% of basic)',
    category: 'Housing',
  },
  'LTA': {
    name: 'LTA',
    limit: Infinity,
    regimes: ['old'],
    description: 'Leave travel concession - twice in a block of 4 calendar years (block 2022-25)',
    category: 'Travel',
  },
  // ── Additional sections for comprehensive coverage ──
  '80CCC': {
    name: '80CCC',
    limit: 150000,
    regimes: ['old'],
    description: 'Pension fund contribution (LIC/insurer annuity plans) - shares overall 1.5L limit with 80C + 80CCD(1)',
    category: 'Pension',
  },
  '80CCD(2)': {
    name: '80CCD(2)',
    limit: Infinity, // 14% of (Basic + DA) for all employers FY 2025-26
    regimes: ['old', 'new'], // available in BOTH regimes
    description: 'Employer NPS contribution - 14% of (Basic + DA) for all employers, no overall cap. Available in both regimes.',
    category: 'Pension',
  },
  '80GG': {
    name: '80GG',
    limit: 60000, // Rs.5,000/month = Rs.60K/year
    regimes: ['old'],
    description: 'Rent paid without HRA - least of: Rs.5,000/month, 25% of adjusted total income, or rent minus 10% of adjusted total income. For salaried without HRA component or self-employed.',
    category: 'Housing',
  },
  '80GGA': {
    name: '80GGA',
    limit: Infinity,
    regimes: ['old'],
    description: 'Donations for scientific research or rural development - 100% deduction. Cash donations up to Rs.2,000 only. Not for business/profession income earners.',
    category: 'Charity',
  },
  '80GGC': {
    name: '80GGC',
    limit: Infinity,
    regimes: ['old'],
    description: 'Contribution to political parties or electoral trust - 100% deduction. No cash contributions allowed.',
    category: 'Political',
  },
  '80JJAA': {
    name: '80JJAA',
    limit: Infinity, // 30% of additional wages for 3 years per new employee
    regimes: ['old', 'new'], // available in BOTH regimes
    description: 'Additional employee cost deduction - 30% of additional wages for new employees earning up to Rs.25K/month, for 3 years. Available in both regimes.',
    category: 'Business',
  },
  '80QQB': {
    name: '80QQB',
    limit: 300000,
    regimes: ['old'],
    description: 'Royalty income from books - least of Rs.3,00,000 or royalty income. For Indian citizen authors.',
    category: 'Income',
  },
  '80RRB': {
    name: '80RRB',
    limit: 300000,
    regimes: ['old'],
    description: 'Royalty on patents - least of Rs.3,00,000 or royalty income. For Indian citizen patent holders.',
    category: 'Income',
  },
};

// TDS deduction thresholds & rates by source.
const TDS_SECTIONS = {
  Salary: { section: '192', threshold: 0, rate: 0.3, description: 'TDS on salary at average slab rate (10-30%)' },
  Interest: { section: '194A', threshold: 40000, rate: 0.1, seniorThreshold: 50000, description: 'Bank/post-office interest above Rs.40K (Rs.50K for senior)' },
  Dividend: { section: 194, threshold: 10000, rate: 0.1, description: 'Dividend above Rs.10,000 per annum' },
  'Rent (Property)': { section: '194I', threshold: 240000, rate: 0.1, description: 'Rent above Rs.2.4L p.a. - property' },
  'Rent (Plant & Machinery)': { section: '194I', threshold: 240000, rate: 0.02, description: 'Rent above Rs.2.4L p.a. - plant & machinery' },
  'Professional Fees': { section: '194J', threshold: 50000, rate: 0.1, description: 'Professional/technical fees above Rs.50K' },
  Commission: { section: '194H', threshold: 15000, rate: 0.05, description: 'Commission/brokerage above Rs.15K' },
  Crypto: { section: '194S', threshold: 10000, rate: 0.01, description: 'Virtual digital asset (crypto) above Rs.10K' },
};

// Advance tax instalment schedule: cumulative % of annual tax due by each date.
const ADVANCE_TAX_DATES = [
  { month: 6, day: 15, percentage: 15, label: 'Q1 (15%) by June 15' },
  { month: 9, day: 15, percentage: 45, label: 'Q2 (45%) by Sept 15' },
  { month: 12, day: 15, percentage: 75, label: 'Q3 (75%) by Dec 15' },
  { month: 3, day: 15, percentage: 100, label: 'Q4 (100%) by Mar 15' },
];
const ADVANCE_TAX_MIN_LIABILITY = 10000;

// Year-round tax calendar for the financial year (April - March).
const TAX_CALENDAR = [
  { month: 4, day: 1, title: 'FY starts', description: 'Start 80C investment planning early; review last year earnings' },
  { month: 4, day: 15, title: 'Verify advance tax', description: 'Q4 advance tax was due Mar 15 - verify payment done' },
  { month: 6, day: 15, title: 'Q1 advance tax due (15%)', description: 'First instalment of advance tax' },
  { month: 7, day: 15, title: 'Form 16 expected', description: 'Employer should issue Form 16 for the previous FY' },
  { month: 7, day: 31, title: 'ITR deadline (individuals)', description: 'File income tax return (no audit cases)' },
  { month: 9, day: 15, title: 'Q2 advance tax due (45%)', description: 'Second instalment of advance tax' },
  { month: 10, day: 31, title: 'Audit cases deadline', description: 'ITR filing deadline for audit cases (if applicable)' },
  { month: 11, day: 1, title: 'Year-end tax review', description: 'Start year-end tax planning; estimate full-year income' },
  { month: 12, day: 15, title: 'Q3 advance tax due (75%)', description: 'Third instalment of advance tax' },
  { month: 1, day: 15, title: 'Finalise 80C investments', description: 'Last quarter - finalize 80C investments for the FY' },
  { month: 3, day: 15, title: 'Q4 advance tax due (100%)', description: 'Final advance tax instalment' },
  { month: 3, day: 31, title: 'Last day 80C investments', description: 'PPF, ELSS, NSC, LIC premium - lock in before March 31' },
  { month: 3, day: 31, title: 'Last day health insurance (80D)', description: 'Pay premium before March 31 for 80D deduction' },
];

// ITR filing checklist items (persisted per-user state lives in tax_checklist_items).
const ITR_CHECKLIST = [
  { key: 'pan', label: 'PAN available & valid' },
  { key: 'aadhaar_linked', label: 'Aadhaar linked to PAN (Aadhaar-PAN linkage done)' },
  { key: 'form16', label: 'Form 16 / Form 16A collected' },
  { key: 'bank_interest', label: 'Bank interest certificates (Form 16A / interest statements)' },
  { key: 'investment_proofs', label: 'Investment proofs (80C: ELSS, PPF, LIC receipts)' },
  { key: 'health_proofs', label: 'Health insurance premium receipts (80D)' },
  { key: 'home_loan', label: 'Home loan interest certificate (Section 24)' },
  { key: 'rent_hra', label: 'Rent receipts + HRA calculation' },
  { key: 'capital_gains', label: 'Capital gains statements (brokerage / mutual fund)' },
  { key: 'nps', label: 'NPS contribution receipt (80CCD(1B))' },
  { key: 'prev_itr', label: "Previous year's ITR acknowledgment" },
  { key: 'bank_refund', label: 'Bank account details for refund' },
];

/* =========================================================================
 * Helpers
 * ========================================================================= */

function inr(v) {
  return Number(v || 0).toLocaleString('en-IN');
}

// Resolve surcharge rate for a taxable income given a regime (new regime caps at 25%).
function surchargeRate(taxableIncome, regime) {
  let rate = 0;
  for (const s of SURCHARGE_SLABS) {
    if (taxableIncome > s.above) rate = s.rate;
  }
  if (regime === 'new') rate = Math.min(rate, 0.25);
  return rate;
}

// Compute tax on a slab schedule for a given taxable income.
function taxFromSlabs(taxableIncome, slabSchedule) {
  const slabs = slabSchedule || NEW_REGIME_SLABS;
  let income = Math.max(0, taxableIncome);
  let tax = 0;
  const slabBreakdown = [];
  let prev = 0;
  for (const { from, to, rate } of slabs) {
    if (income <= from) break;
    const upper = to === Infinity ? income : Math.min(to, income);
    const amount = upper - prev;
    tax += Math.round(amount * rate);
    slabBreakdown.push({ from: prev, to: upper, rate: rate * 100, amount });
    prev = upper;
    if (to === Infinity) break;
  }
  return { tax, slabBreakdown };
}

/* =========================================================================
 * calculateTax - core tax computation (both regimes)
 *
 * @param gross        Total gross income (Rs.) before deductions
 * @param deductions   Object of section -> amount (e.g. { '80C': 150000 })
 * @param regime       'new' (default) | 'old'
 * @param opts         { ageGroup: 'below60'|'senior'|'superSenior', salaried: bool }
 * ========================================================================= */
function calculateTax(gross, deductions = {}, regime = 'new', opts = {}) {
  const ageGroup = opts.ageGroup || 'below60';
  const salaried = opts.salaried !== false; // treat as salaried by default

  const base = OLD_REGIME_BASE_EXEMPTION[ageGroup] || OLD_REGIME_BASE_EXEMPTION.below60;
  const stdDeduction = salaried ? STANDARD_DEDUCTION[regime] : 0;

  // Deductions: respect per-section limits & regime availability.
  let totalDeductions = stdDeduction;
  for (const [section, amount] of Object.entries(deductions || {})) {
    const meta = DEDUCTION_SECTIONS[section];
    if (!meta) continue;
    if (!meta.regimes.includes(regime)) continue;
    const capped = meta.limit === Infinity ? amount : Math.min(amount || 0, meta.limit);
    totalDeductions += Math.max(0, Number(capped || 0));
  }

  let taxableIncome = Math.max(0, gross - totalDeductions);

  // Old regime senior/super-senior basic exemption bump.
  const ageExemption = regime === 'old' ? Math.max(0, base - OLD_REGIME_BASE_EXEMPTION.below60) : 0;

  const { tax, slabBreakdown } = taxFromSlabs(taxableIncome, regime === 'old' ? OLD_REGIME_SLABS : NEW_REGIME_SLABS);

  // Rebate (87A)
  const rebate = REBATE[regime];
  let rebateApplied = 0;
  let taxAfterRebate = tax;
  if (taxableIncome <= rebate.limit) {
    rebateApplied = tax;
    taxAfterRebate = 0;
  }

  // Surcharge + cess
  const sRate = surchargeRate(taxableIncome, regime);
  const surcharge = taxAfterRebate > 0 ? Math.round(taxAfterRebate * sRate) : 0;
  const cess = Math.round((taxAfterRebate + surcharge) * CESS_RATE);
  const totalTax = taxAfterRebate + surcharge + cess;

  const effectiveRate = gross > 0 ? (totalTax / gross) * 100 : 0;
  const takeHome = Math.max(0, gross - totalTax);

  return {
    regime,
    fy: FY,
    gross,
    stdDeduction,
    totalDeductions,
    taxableIncome,
    tax: Math.round(taxAfterRebate),
    rebateApplied,
    surcharge,
    cess,
    totalTax,
    effectiveRate: Math.round(effectiveRate * 100) / 100,
    takeHome,
    surchargeRate: sRate * 100,
    exemptLimit: regime === 'new' ? REBATE.new.limit : base,
    slabBreakdown,
    ageGroup,
    salaried,
    ageExemption,
  };
}

/* =========================================================================
 * compareRegimes - detailed side-by-side of both regimes with recommendation
 * ========================================================================= */
function compareRegimes(gross, deductions = {}, opts = {}) {
  const newR = calculateTax(gross, deductions, 'new', opts);
  const oldR = calculateTax(gross, deductions, 'old', opts);

  const saving = oldR.totalTax - newR.totalTax; // positive => new regime cheaper
  let recommendation;
  if (saving > 0) {
    recommendation = `New regime is better by Rs.${inr(saving)}.`;
  } else if (saving < 0) {
    recommendation = `Old regime is better by Rs.${inr(-saving)}. Your deductions (80C/80D/HRA...) outweigh the new regime's lower slabs.`;
  } else {
    recommendation = 'Both regimes yield the same tax. Choose based on simplicity & deduction needs.';
  }

  return {
    newRegime: newR,
    oldRegime: oldR,
    recommendedRegime: newR.totalTax <= oldR.totalTax ? 'new' : 'old',
    better: newR.totalTax <= oldR.totalTax ? 'new' : 'old', // backward compat
    old: oldR,  // backward compat
    new: newR,  // backward compat
    saving: Math.abs(saving),
    recommendation,
  };
}

/* =========================================================================
 * Capital gains - calculateCapitalGains
 *
 * @param type                'equity' | 'debt' | 'property'
 * @param amount              Sale consideration (Rs.)
 * @param holdingPeriodDays   Holding period in days
 * @param opts                { costBasis, indexedCostBasis, listed, ageGroup }
 * ========================================================================= */
function calculateCapitalGains(type, amount, holdingPeriodDays, opts = {}) {
  const costBasis = opts.costBasis || 0;
  const gain = Math.max(0, amount - costBasis);
  const yearsHeld = holdingPeriodDays / 365;
  const result = { type, amount, costBasis, gain, holdingPeriodDays, yearsHeld: +yearsHeld.toFixed(2) };

  if (type === 'equity') {
    if (yearsHeld < 1) {
      result.nature = 'STCG';
      result.rate = 0.20;
      result.tax = Math.round(gain * 0.20);
      result.note = 'STCG on equity: flat 20%';
    } else {
      result.nature = 'LTCG';
      result.rate = 0.125;
      result.exemption = 125000;
      const taxable = Math.max(0, gain - result.exemption);
      result.tax = Math.round(taxable * 0.125);
      result.note = 'LTCG on equity: 12.5% above Rs.1.25L exemption (FY 2025-26)';
    }
  } else if (type === 'property') {
    if (yearsHeld < 2) {
      result.nature = 'STCG';
      result.rate = 'slab';
      result.tax = slabRateTax(gain);
      result.note = 'STCG on property (held < 2 yrs) taxed at slab rates';
    } else {
      result.nature = 'LTCG';
      result.rate = 0.125;
      const withoutIndexation = Math.round(gain * 0.125);
      const indexedCost = opts.indexedCostBasis || costBasis;
      const indexedGain = Math.max(0, amount - indexedCost);
      const withIndexation = Math.round(indexedGain * 0.20);
      result.options = {
        withoutIndexation: { rate: 0.125, tax: withoutIndexation },
        withIndexation: { rate: 0.20, tax: withIndexation },
      };
      result.bestOption = withoutIndexation <= withIndexation ? 'withoutIndexation' : 'withIndexation';
      result.tax = Math.min(withoutIndexation, withIndexation);
      result.note = 'LTCG property FY 2025-26: 12.5% without indexation or 20% with indexation - choose lower';
    }
  } else {
    // Debt / non-equity
    const listed = !!(opts.listed);
    if (yearsHeld < 1) {
      result.nature = 'STCG';
      result.rate = 'slab';
      result.tax = slabRateTax(gain);
      result.note = 'STCG on debt taxed at slab rates';
    } else if (listed) {
      result.nature = 'LTCG';
      result.rate = 0.125;
      result.tax = Math.round(gain * 0.125);
      result.note = 'LTCG on listed debt securities: 12.5% without indexation';
    } else {
      const indexedCost = opts.indexedCostBasis || costBasis;
      const indexedGain = Math.max(0, amount - indexedCost);
      result.nature = 'LTCG';
      result.rate = 0.20;
      result.tax = Math.round(indexedGain * 0.20);
      result.note = 'LTCG on unlisted debt: 20% with indexation';
    }
  }

  return result;
}

// Flat tax on STCG/slab income using the marginal slab approximation.
function slabRateTax(amount) {
  const income = amount;
  let tax = 0;
  let prev = 0;
  for (const { from, to, rate } of NEW_REGIME_SLABS) {
    if (income <= from) break;
    const upper = to === Infinity ? income : Math.min(to, income);
    if (upper > prev) tax += Math.round((upper - prev) * rate);
    prev = upper;
    if (to === Infinity) break;
  }
  return tax;
}

/* =========================================================================
 * TDS tracking - trackTDS
 *
 * @param tdsEntries [{ source, amount, tdsAmount, senior?, certificate_received? }]
 * ========================================================================= */
function trackTDS(tdsEntries = []) {
  let totalTdsDeducted = 0;
  let expectedTds = 0;
  const entriesSummary = [];

  for (const e of tdsEntries) {
    const meta = TDS_SECTIONS[e.source] || {};
    const threshold = meta.seniorThreshold && e.senior ? meta.seniorThreshold : meta.threshold || 0;
    const rate = meta.rate || 0;
    const amount = Number(e.amount || 0);
    const tdsAmount = Number(e.tdsAmount || 0);
    totalTdsDeducted += tdsAmount;

    let expected = 0;
    if (amount > threshold && rate) expected = Math.round((amount - threshold) * rate);
    expectedTds += expected;

    entriesSummary.push({
      source: e.source,
      section: meta.section || null,
      amount,
      threshold,
      rate: rate * 100,
      tdsDeducted: tdsAmount,
      expected,
      certificateReceived: !!e.certificate_received || !!e.certificateReceived,
    });
  }

  const shortfallOrExcess = expectedTds - totalTdsDeducted;
  let status = 'matched';
  if (shortfallOrExcess > 0) status = 'shortfall';
  else if (shortfallOrExcess < 0) status = 'excess';

  return { entriesSummary, totalTdsDeducted, expectedTds, shortfallOrExcess, status };
}

/* =========================================================================
 * Advance tax - getAdvanceTaxStatus
 * ========================================================================= */
function getAdvanceTaxStatus(estimatedTax, alreadyPaid = 0) {
  const now = new Date();
  const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;

  const payable = Math.max(0, Number(estimatedTax || 0) - Number(alreadyPaid || 0));

  if (payable < ADVANCE_TAX_MIN_LIABILITY) {
    return {
      exempt: true,
      reason: `Total tax liability under Rs.${inr(ADVANCE_TAX_MIN_LIABILITY)} - advance tax not required`,
      nextDueDate: null,
      nextDueAmount: 0,
      percentage: 100,
      isOverdue: false,
      daysUntil: 0,
      paidPercentage: estimatedTax > 0 ? Math.min(100, Math.round((alreadyPaid / estimatedTax) * 100)) : 100,
    };
  }

  let next = null;
  for (const inst of ADVANCE_TAX_DATES) {
    const target = Math.round(estimatedTax * (inst.percentage / 100));
    if (alreadyPaid < target) {
      next = inst;
      next.cumulative = target;
      break;
    }
  }

  if (!next) {
    return {
      paidInFull: true,
      nextDueDate: null,
      nextDueAmount: 0,
      percentage: 100,
      isOverdue: false,
      daysUntil: 0,
      paidPercentage: 100,
    };
  }

  let dueDate = new Date(fyStartYear, next.month - 1, next.day);
  if (dueDate < now) dueDate = new Date(fyStartYear + 1, next.month - 1, next.day);
  const daysUntil = Math.round((dueDate - now) / 86400000);

  return {
    fy: FY,
    nextDueDate: dueDate.toISOString().slice(0, 10),
    label: next.label,
    nextDueAmount: next.cumulative - alreadyPaid,
    cumulativeDue: next.cumulative,
    percentage: next.percentage,
    isOverdue: daysUntil < 0,
    daysUntil,
    paidPercentage: Math.min(100, Math.round((alreadyPaid / estimatedTax) * 100)),
  };
}

/* =========================================================================
 * Tax calendar - getUpcomingTaxEvents
 * ========================================================================= */
function getUpcomingTaxEvents(userId, monthsAhead = 3) {
  const now = new Date();
  const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const horizon = monthsAhead || 3;

  const events = TAX_CALENDAR.map((ev, i) => {
    let date = new Date(fyStartYear, ev.month - 1, ev.day);
    if (date < now) date = new Date(fyStartYear + 1, ev.month - 1, ev.day);
    const daysUntil = Math.round((date - now) / 86400000);
    let urgency = 'upcoming';
    if (daysUntil < 0) urgency = 'overdue';
    else if (daysUntil <= 7) urgency = 'due-soon';
    return {
      id: i + 1,
      title: ev.title,
      description: ev.description,
      date: date.toISOString().slice(0, 10),
      month: ev.month,
      day: ev.day,
      daysUntil,
      urgency,
    };
  });

  return events
    .filter((e) => e.daysUntil >= 0 && e.daysUntil <= horizon * 30.44)
    .sort((a, b) => a.daysUntil - b.daysUntil);
}

/* =========================================================================
 * ITR checklist - getITRChecklist (reads persisted checklist from DB)
 * ========================================================================= */
async function getITRChecklist(userId) {
  try {
    await initTaxTables();
    const rows = await dbAll(
      'SELECT item_key, completed, completed_date FROM tax_checklist_items WHERE user_id = ? AND fy = ?',
      [userId, FY]
    );
    const completedMap = {};
    for (const r of rows || []) completedMap[r.item_key] = r;

    const items = ITR_CHECKLIST.map((item) => ({
      ...item,
      completed: !!(completedMap[item.key] && completedMap[item.key].completed),
      completedDate: completedMap[item.key] ? completedMap[item.key].completed_date : null,
    }));

    const completed = items.filter((i) => i.completed).length;
    return { items, completed, total: items.length, ready: completed === items.length, fy: FY };
  } catch (e) {
    return { items: ITR_CHECKLIST.map((i) => ({ ...i, completed: false })), completed: 0, total: ITR_CHECKLIST.length, ready: false, error: e.message };
  }
}

/* =========================================================================
 * Tax saving suggestions - getTaxSavingSuggestions (FY 2025-26)
 * ========================================================================= */
function getTaxSavingSuggestions(gross = 0, deductions = {}, opts = {}) {
  const r = calculateTax(gross, deductions, 'new', opts);
  const rOld = calculateTax(gross, deductions, 'old', opts);
  const suggestions = [];

  suggestions.push({
    title: 'New regime default',
    detail: 'New regime is the default. Most people with taxable income under Rs.12L pay zero tax (87A rebate), rising to Rs.12.75L for salaried with std deduction.',
    savings: null,
  });

  if (r.totalTax > 0) {
    suggestions.push({
      title: 'Max out 80CCD(1B) - NPS',
      detail: 'Rs.50,000 NPS contribution is deductible in BOTH regimes (on top of 80C).',
      section: '80CCD(1B)',
      limit: 50000,
      savings: Math.round(50000 * (r.effectiveRate / 100)),
    });
  }

  suggestions.push({
    title: 'Section 24 - home loan interest',
    detail: 'Up to Rs.2,00,000 home loan interest deductible (self-occupied) in old regime; unlimited for let-out property.',
    section: '24(b)',
    limit: 200000,
    regimes: ['old'],
    savings: null,
  });

  suggestions.push({
    title: 'Section 80E - education loan interest',
    detail: 'Full interest on education loan deductible with no upper limit, up to 8 years.',
    section: '80E',
    regimes: ['old'],
    savings: null,
  });

  suggestions.push({
    title: '80EE / 80EEA - first time home buyer',
    detail: 'Additional Rs.50,000 (80EE) or Rs.1,50,000 (80EEA, loan sanctioned FY 2019-22) home loan interest.',
    section: '80EE/80EEA',
    regimes: ['old'],
    savings: null,
  });

  suggestions.push({
    title: 'Section 80C',
    detail: 'Invest up to Rs.1,50,000 across ELSS, PPF, EPF, LIC, NSC, SCSS, Sukanya Samriddhi, tuition fees.',
    section: '80C',
    limit: 150000,
    regimes: ['old'],
    savings: Math.round(150000 * (rOld.effectiveRate / 100)),
  });

  suggestions.push({
    title: 'Section 80D - health insurance',
    detail: 'Up to Rs.25,000 for self/family + Rs.5,000 preventive checkup; additional Rs.25K for parents (Rs.50K if senior citizen). Max total Rs.1,00,000.',
    section: '80D',
    limit: 100000,
    regimes: ['old'],
    savings: null,
  });

  suggestions.push({
    title: 'HRA & LTA',
    detail: 'Claim HRA (metro 50% / non-metro 40% of basic) and LTA twice per 4-year block.',
    section: 'HRA/LTA',
    regimes: ['old'],
    savings: null,
  });

  // ── Comprehensive additional sections ──
  suggestions.push({
    title: 'Section 80GG - rent without HRA',
    detail: 'If you pay rent but do NOT receive HRA from employer: least of Rs.5,000/month, 25% of adjusted total income, or rent minus 10% of adjusted total income. Max Rs.60K/year.',
    section: '80GG',
    limit: 60000,
    regimes: ['old'],
    savings: null,
  });

  suggestions.push({
    title: 'Section 80CCC - pension fund',
    detail: 'Contribution to pension/annuity plans from insurers (LIC etc). Shares overall Rs.1.5L limit with 80C + 80CCD(1).',
    section: '80CCC',
    limit: 150000,
    regimes: ['old'],
    savings: null,
  });

  suggestions.push({
    title: 'Section 80CCD(2) - employer NPS',
    detail: 'Employer NPS contribution up to 14% of (Basic + DA) is deductible in BOTH regimes. This is ON TOP of 80C and 80CCD(1B). Ask your employer to contribute to NPS instead of adding to PF.',
    section: '80CCD(2)',
    regimes: ['old', 'new'],
    savings: null,
  });

  suggestions.push({
    title: 'Section 80TTA / 80TTB - savings interest',
    detail: '80TTA: Rs.10,000 savings account interest (non-senior). 80TTB: Rs.50,000 for senior citizens (includes FD interest).',
    section: '80TTA/80TTB',
    regimes: ['old'],
    savings: null,
  });

  suggestions.push({
    title: 'Section 80G - donations',
    detail: 'Donations to approved charities: 50% or 100% deduction. PM Relief Fund = 100%. Cash donations limited to Rs.2,000.',
    section: '80G',
    regimes: ['old'],
    savings: null,
  });

  suggestions.push({
    title: 'Section 80GGA - scientific research donations',
    detail: '100% deduction for donations to scientific research or rural development. Not for business/profession income earners.',
    section: '80GGA',
    regimes: ['old'],
    savings: null,
  });

  suggestions.push({
    title: 'Section 80GGC - political party contribution',
    detail: '100% deduction for contributions to registered political parties or electoral trust. No cash contributions allowed.',
    section: '80GGC',
    regimes: ['old'],
    savings: null,
  });

  suggestions.push({
    title: 'Section 80DD - dependent disability',
    detail: 'Rs.75,000 for dependent with 40-80% disability, Rs.1,25,000 for 80%+ severe disability. Includes cost of maintenance, nursing, rehabilitation.',
    section: '80DD',
    limit: 125000,
    regimes: ['old'],
    savings: null,
  });

  suggestions.push({
    title: 'Section 80DDB - medical treatment',
    detail: 'Rs.40,000 (below 60) or Rs.1,00,000 (60+) for treatment of specified diseases (cancer, AIDS, neurological disorders). For self or dependent.',
    section: '80DDB',
    limit: 100000,
    regimes: ['old'],
    savings: null,
  });

  suggestions.push({
    title: 'Section 80U - self disability',
    detail: 'Rs.75,000 (40-80% disability) or Rs.1,25,000 (80%+ severe). Flat deduction, no proof needed beyond disability certificate.',
    section: '80U',
    limit: 125000,
    regimes: ['old'],
    savings: null,
  });

  suggestions.push({
    title: 'Section 80E - education loan interest',
    detail: 'Full interest on education loan deductible with NO upper limit, up to 8 years. For self, spouse, or children. Principal not deductible.',
    section: '80E',
    regimes: ['old'],
    savings: null,
  });

  suggestions.push({
    title: 'Section 80QQB - author royalty',
    detail: 'Royalty income from publishing books: least of Rs.3,00,000 or actual royalty income. For Indian citizen authors.',
    section: '80QQB',
    limit: 300000,
    regimes: ['old'],
    savings: null,
  });

  suggestions.push({
    title: 'Section 80RRB - patent royalty',
    detail: 'Royalty on patents registered in India: least of Rs.3,00,000 or royalty income. For Indian citizen patent holders.',
    section: '80RRB',
    limit: 300000,
    regimes: ['old'],
    savings: null,
  });

  suggestions.push({
    title: 'Section 80JJAA - new employees',
    detail: 'If you run a business and hire new employees earning up to Rs.25K/month: 30% of their additional wages deductible for 3 years. Available in BOTH regimes.',
    section: '80JJAA',
    regimes: ['old', 'new'],
    savings: null,
  });

  return {
    suggestions,
    bestRegime: r.totalTax <= rOld.totalTax ? 'new' : 'old',
    currentNewRegimeTax: r.totalTax,
    currentOldRegimeTax: rOld.totalTax,
  };
}

/* =========================================================================
 * Projected annual tax - getProjectedTax (reads DB-backed profile)
 * ========================================================================= */
async function getProjectedTax(userId) {
  try {
    await initTaxTables();
    let income = 0;
    let tdsAlreadyPaid = 0;
    let deduction80c = 0;
    let deduction80d = 0;
    let deductionHomeLoan = 0;

    try {
      const sources = await dbAll('SELECT source_type, amount, tds_deducted FROM tax_income_sources WHERE user_id = ? AND fy = ?', [userId, FY]);
      for (const s of sources || []) {
        income += Number(s.amount || 0);
        tdsAlreadyPaid += Number(s.tds_deducted || 0);
      }
    } catch (e) { /* no income rows */ }

    try {
      const invs = await dbAll('SELECT amount FROM tax_investments_80c WHERE user_id = ? AND fy = ?', [userId, FY]);
      for (const i of invs || []) deduction80c += Number(i.amount || 0);
    } catch (e) { /* no investments */ }
    deduction80c = Math.min(deduction80c, DEDUCTION_SECTIONS['80C'].limit);

    try {
      const ins = await dbAll("SELECT amount FROM financial_profile WHERE user_id = ? AND type = 'insurance'", [userId]);
      for (const i of ins || []) deduction80d += Number(i.amount || 0);
    } catch (e) { /* no insurance */ }
    deduction80d = Math.min(deduction80d, DEDUCTION_SECTIONS['80D'].limit);

    try {
      const loans = await dbAll("SELECT annual_interest FROM financial_profile WHERE user_id = ? AND type = 'home_loan'", [userId]);
      for (const l of loans || []) deductionHomeLoan += Number(l.annual_interest || 0);
    } catch (e) { /* no loans */ }
    deductionHomeLoan = Math.min(deductionHomeLoan, DEDUCTION_SECTIONS['24(b)'].limit);

    const deductions = { '80C': deduction80c, '80D': deduction80d, '24(b)': deductionHomeLoan };

    const newR = calculateTax(income, {}, 'new', {});
    const oldR = calculateTax(income, deductions, 'old', {});

    const bestRegime = newR.totalTax <= oldR.totalTax ? 'new' : 'old';
    const projectedTax = Math.min(newR.totalTax, oldR.totalTax);
    const projectedRefund = Math.max(0, tdsAlreadyPaid - projectedTax);
    const advanceTaxRemaining = Math.max(0, projectedTax - tdsAlreadyPaid);

    const s = getTaxSavingSuggestions(income, deductions, {});
    return {
      bestRegime,
      grossIncome: income,
      newRegimeTax: newR.totalTax,
      oldRegimeTax: oldR.totalTax,
      projectedTax,
      projectedRefund,
      tdsAlreadyPaid,
      advanceTaxRemaining,
      deductionsUsed: deductions,
      suggestions: s.suggestions,
      fy: FY,
    };
  } catch (e) {
    return {
      bestRegime: 'new',
      grossIncome: 0,
      projectedTax: 0,
      projectedRefund: 0,
      tdsAlreadyPaid: 0,
      advanceTaxRemaining: 0,
      suggestions: [],
      error: e.message,
    };
  }
}

/* =========================================================================
 * DB table initialisation - initTaxTables
 * ========================================================================= */
async function initTaxTables() {
  const tables = [
    `CREATE TABLE IF NOT EXISTS tax_income_sources (
       income_id TEXT PRIMARY KEY,
       user_id TEXT,
       source_type TEXT,
       amount REAL,
       employer TEXT,
       tds_deducted REAL,
       form16_received INTEGER DEFAULT 0,
       fy TEXT
     )`,
    `CREATE TABLE IF NOT EXISTS tax_investments_80c (
       inv_id TEXT PRIMARY KEY,
       user_id TEXT,
       category TEXT,
       amount REAL,
       fy TEXT,
       receipt_uploaded INTEGER DEFAULT 0
     )`,
    `CREATE TABLE IF NOT EXISTS tax_tds_entries (
       tds_id TEXT PRIMARY KEY,
       user_id TEXT,
       source TEXT,
       amount REAL,
       tds_amount REAL,
       quarter TEXT,
       fy TEXT,
       certificate_received INTEGER DEFAULT 0
     )`,
    `CREATE TABLE IF NOT EXISTS tax_checklist_items (
       item_id TEXT PRIMARY KEY,
       user_id TEXT,
       fy TEXT,
       item_key TEXT,
       completed INTEGER DEFAULT 0,
       completed_date TEXT
     )`,
  ];
  for (const sql of tables) {
    await dbRun(sql);
  }
  return true;
}

/* =========================================================================
 * suggestITRForm - backward-compatible ITR form suggestion
 * ========================================================================= */
function suggestITRForm(gross, profile = {}) {
  if (profile && (profile.business || profile.isBusinessOwner)) {
    return { form: 'ITR-3', reason: 'Income from business or profession', applicable: gross >= 0 };
  }
  if (profile && profile.isHUFPerson) {
    return { form: 'ITR-2', reason: 'HUF individual', applicable: true };
  }
  if (profile && profile.capitalGains) {
    return { form: 'ITR-2', reason: 'Capital gains / multiple income heads', applicable: true };
  }
  if (gross > 500000) {
    return { form: 'ITR-1', reason: 'Salaried/other income above basic exemption (Sahaj)', applicable: true };
  }
  return {
    form: 'ITR-1',
    reason: 'Salaried or single-source income (Sahaj) - most individual taxpayers',
    applicable: gross >= 0,
  };
}

// Best-effort table initialisation on load (database may be unavailable during tests).
try {
  initTaxTables().catch(() => {});
} catch (e) { /* ignore */ }

/* =========================================================================
 * Public exports (backward compatible)
 * ========================================================================= */
module.exports = {
  // constants
  FY,
  NEW_REGIME_SLABS,
  OLD_REGIME_SLABS,
  DEDUCTION_SECTIONS,
  TDS_SECTIONS,
  ADVANCE_TAX_DATES,
  TAX_CALENDAR,
  ITR_CHECKLIST,
  // core
  calculateTax,
  calculateCapitalGains,
  compareRegimes,
  suggestITRForm,
  getTaxSavingSuggestions,
  // tracking / planning
  trackTDS,
  getAdvanceTaxStatus,
  getUpcomingTaxEvents,
  getITRChecklist,
  getProjectedTax,
  initTaxTables,
  // helpers
  surchargeRate,
};
