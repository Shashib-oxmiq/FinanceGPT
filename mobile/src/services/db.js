// ── SQLite Data Layer ─────────────────────────────────────────────────────────
// Replaces MongoDB + FastAPI with embedded SQLite for offline-first iOS app.
// Schema mirrors MongoDB collections for future cloud sync compatibility.

import { CONFIG } from '../config';
import { openDB } from './platform';

let db = null;

// ── Database initialization ──────────────────────────────────────────────────

export async function initDB() {
  if (db) return db;

  db = await openDB();

  // Create all tables (mirror MongoDB collections)
  await db.execAsync(`
    -- Users
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT DEFAULT '',
      password_hash TEXT,
      profile TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Conversations
    CREATE TABLE IF NOT EXISTS conversations (
      conversation_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT DEFAULT 'New conversation',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Messages
    CREATE TABLE IF NOT EXISTS messages (
      message_id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      attachments TEXT DEFAULT '[]',
      sources TEXT DEFAULT '[]',
      model TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Investments
    CREATE TABLE IF NOT EXISTS investments (
      investment_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      asset_type TEXT DEFAULT 'stock',
      amount_invested REAL DEFAULT 0,
      current_value REAL DEFAULT 0,
      purchase_date TEXT DEFAULT '',
      ticker TEXT DEFAULT '',
      market TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Insurance policies
    CREATE TABLE IF NOT EXISTS insurance (
      insurance_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      policy_type TEXT DEFAULT '',
      provider TEXT DEFAULT '',
      policy_number TEXT DEFAULT '',
      sum_assured REAL DEFAULT 0,
      premium_amount REAL DEFAULT 0,
      premium_frequency TEXT DEFAULT 'annual',
      start_date TEXT DEFAULT '',
      maturity_date TEXT DEFAULT '',
      nominee TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Documents (vault)
    CREATE TABLE IF NOT EXISTS documents (
      document_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      category TEXT DEFAULT '',
      content_type TEXT DEFAULT '',
      size INTEGER DEFAULT 0,
      storage_path TEXT DEFAULT '',
      content_hash TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Reminders
    CREATE TABLE IF NOT EXISTS reminders (
      reminder_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      due_date TEXT NOT NULL,
      priority TEXT DEFAULT 'medium',
      completed INTEGER DEFAULT 0,
      category TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Contacts
    CREATE TABLE IF NOT EXISTS contacts (
      contact_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      relationship TEXT DEFAULT '',
      email TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      access_level TEXT DEFAULT 'view',
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Life events
    CREATE TABLE IF NOT EXISTS life_events (
      event_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      event_date TEXT,
      details TEXT DEFAULT '{}',
      checklist TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Gmail messages (cached)
    CREATE TABLE IF NOT EXISTS gmail_messages (
      message_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      subject TEXT,
      sender TEXT,
      date TEXT,
      snippet TEXT,
      body TEXT,
      attachments TEXT DEFAULT '[]',
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Shared bundles
    CREATE TABLE IF NOT EXISTS shares (
      share_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT,
      document_ids TEXT DEFAULT '[]',
      password TEXT,
      expiry TEXT,
      path TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- i18n translation cache
    CREATE TABLE IF NOT EXISTS translations (
      lang TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (lang, key)
    );

    -- Form copies (saved form-filler sessions)
    CREATE TABLE IF NOT EXISTS form_copies (
      copy_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      form_id TEXT,
      name TEXT,
      data TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Financial goals (goal-based planning)
    CREATE TABLE IF NOT EXISTS goals (
      goal_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      target_amount REAL NOT NULL,
      current_amount REAL DEFAULT 0,
      target_date TEXT,
      monthly_contribution REAL DEFAULT 0,
      category TEXT DEFAULT 'savings',
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Expenses (receipt scanner)
    CREATE TABLE IF NOT EXISTS expenses (
      expense_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      amount REAL NOT NULL,
      category TEXT,
      merchant TEXT,
      date TEXT,
      notes TEXT,
      receipt_uri TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Family members (scoped access)
    CREATE TABLE IF NOT EXISTS family_members (
      member_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      relationship TEXT,
      access_scope TEXT DEFAULT 'view',
      invited_at TEXT DEFAULT (datetime('now'))
    );

    -- Emergency access config (dead-man switch)
    CREATE TABLE IF NOT EXISTS emergency_config (
      config_id TEXT PRIMARY KEY DEFAULT 'default',
      user_id TEXT NOT NULL,
      enabled INTEGER DEFAULT 0,
      inactive_days INTEGER DEFAULT 30,
      trusted_contact_ids TEXT DEFAULT '[]',
      last_active TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Medical records (prescriptions, lab reports, vaccinations)
    CREATE TABLE IF NOT EXISTS medical_records (
      record_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT,
      doctor TEXT,
      hospital TEXT,
      date TEXT,
      diagnosis TEXT,
      prescription TEXT,
      notes TEXT,
      attachments TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- AI memory (persistent across sessions)
    CREATE TABLE IF NOT EXISTS ai_memory (
      memory_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      category TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      confidence REAL DEFAULT 1.0,
      source TEXT DEFAULT 'conversation',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Loans & EMIs (F-208)
    CREATE TABLE IF NOT EXISTS loans (
      loan_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      loan_type TEXT NOT NULL,
      lender TEXT,
      principal REAL NOT NULL,
      interest_rate REAL,
      tenure_months INTEGER,
      emi_amount REAL,
      remaining_amount REAL,
      start_date TEXT,
      end_date TEXT,
      next_emi_date TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Bills & Utilities (F-209)
    CREATE TABLE IF NOT EXISTS bills (
      bill_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      bill_type TEXT NOT NULL,
      provider TEXT,
      amount REAL NOT NULL,
      due_date TEXT,
      paid INTEGER DEFAULT 0,
      paid_date TEXT,
      recurring INTEGER DEFAULT 1,
      recurrence TEXT DEFAULT 'monthly',
      account_number TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Education plans (F-210)
    CREATE TABLE IF NOT EXISTS education_plans (
      plan_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      child_name TEXT,
      child_age INTEGER,
      current_class TEXT,
      target_education TEXT,
      target_year TEXT,
      estimated_cost REAL,
      current_savings REAL DEFAULT 0,
      monthly_contribution REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Retirement corpus (F-211)
    CREATE TABLE IF NOT EXISTS retirement_corpus (
      corpus_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      source TEXT NOT NULL,
      current_value REAL DEFAULT 0,
      monthly_contribution REAL DEFAULT 0,
      employer_contribution REAL DEFAULT 0,
      expected_return REAL DEFAULT 8,
      vesting_age INTEGER,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Tax records (F-212)
    CREATE TABLE IF NOT EXISTS tax_records (
      tax_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      financial_year TEXT NOT NULL,
      gross_income REAL,
      total_deductions REAL DEFAULT 0,
      tax_paid REAL DEFAULT 0,
      regime TEXT DEFAULT 'new',
      itr_form TEXT,
      itr_status TEXT DEFAULT 'not_filed',
      filing_date TEXT,
      refund_amount REAL DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Properties (F-213)
    CREATE TABLE IF NOT EXISTS properties (
      property_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      property_type TEXT NOT NULL,
      address TEXT,
      city TEXT,
      state TEXT,
      purchase_price REAL,
      current_value REAL,
      purchase_date TEXT,
      area_sqft REAL,
      ownership TEXT DEFAULT 'sole',
      property_tax_due TEXT,
      property_tax_amount REAL DEFAULT 0,
      mutation_status TEXT DEFAULT 'pending',
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Health score history (F-217)
    CREATE TABLE IF NOT EXISTS health_score_history (
      snapshot_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      score INTEGER NOT NULL,
      breakdown TEXT DEFAULT '{}',
      recorded_at TEXT DEFAULT (datetime('now'))
    );

    -- Coach messages (F-224)
    CREATE TABLE IF NOT EXISTS coach_messages (
      coach_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      priority INTEGER DEFAULT 3,
      title TEXT,
      message TEXT,
      actions TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Cached insights (F-221)
    CREATE TABLE IF NOT EXISTS insights_cache (
      insight_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      severity TEXT,
      category TEXT,
      title TEXT,
      detail TEXT,
      action TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  return db;
}

// ── Helper: generate UUID ────────────────────────────────────────────────────
export function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ── Helper: JSON parse with fallback ─────────────────────────────────────────
function safeParse(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

// ── Generic CRUD factory ─────────────────────────────────────────────────────
// Each function mirrors the FastAPI endpoint signature for seamless swap.

export const dbGet = async (table, idField, id, userId) => {
  const d = await initDB();
  const row = await d.getFirstAsync(
    `SELECT * FROM ${table} WHERE ${idField} = ? AND user_id = ?`,
    [id, userId]
  );
  return row;
};

export const dbList = async (table, userId, orderBy = 'created_at', order = 'DESC', limit = 100) => {
  const d = await initDB();
  const rows = await d.getAllAsync(
    `SELECT * FROM ${table} WHERE user_id = ? ORDER BY ${orderBy} ${order} LIMIT ?`,
    [userId, limit]
  );
  return rows;
};

export const dbInsert = async (table, data) => {
  const d = await initDB();
  const keys = Object.keys(data);
  const values = keys.map((k) => data[k]);
  const placeholders = keys.map(() => '?').join(', ');
  await d.runAsync(
    `INSERT OR REPLACE INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`,
    values
  );
  return data;
};

export const dbUpdate = async (table, idField, id, userId, updates) => {
  const d = await initDB();
  const keys = Object.keys(updates);
  const values = keys.map((k) => updates[k]);
  values.push(id, userId);
  const setClause = keys.map((k) => `${k} = ?`).join(', ');
  await d.runAsync(
    `UPDATE ${table} SET ${setClause} WHERE ${idField} = ? AND user_id = ?`,
    values
  );
  return await dbGet(table, idField, id, userId);
};

export const dbDelete = async (table, idField, id, userId) => {
  const d = await initDB();
  const res = await d.runAsync(
    `DELETE FROM ${table} WHERE ${idField} = ? AND user_id = ?`,
    [id, userId]
  );
  return res.changes > 0;
};

// ── Investment-specific queries ───────────────────────────────────────────────

export const getInvestmentSummary = async (userId) => {
  const d = await initDB();
  const rows = await d.getAllAsync(
    `SELECT asset_type, amount_invested, current_value FROM investments WHERE user_id = ?`,
    [userId]
  );
  let totalInvested = 0, totalCurrent = 0;
  const byType = {};
  for (const r of rows) {
    const inv = Number(r.amount_invested) || 0;
    const cur = Number(r.current_value) || 0;
    totalInvested += inv;
    totalCurrent += cur;
    if (!byType[r.asset_type]) byType[r.asset_type] = { invested: 0, current: 0 };
    byType[r.asset_type].invested += inv;
    byType[r.asset_type].current += cur;
  }
  const gain = totalCurrent - totalInvested;
  const roi = totalInvested ? (gain / totalInvested) * 100 : 0;
  return {
    total_invested: Math.round(totalInvested * 100) / 100,
    total_current: Math.round(totalCurrent * 100) / 100,
    total_gain: Math.round(gain * 100) / 100,
    roi_pct: Math.round(roi * 10) / 10,
    by_type: byType,
    net_worth: Math.round(totalCurrent * 100) / 100,
  };
};

// ── Investment by name (for chat actions) ─────────────────────────────────────

export const findInvestmentByName = async (userId, name) => {
  const d = await initDB();
  return await d.getFirstAsync(
    `SELECT * FROM investments WHERE user_id = ? AND name LIKE ? COLLATE NOCASE`,
    [userId, name]
  );
};

// ── Translation cache ────────────────────────────────────────────────────────

export const getCachedTranslation = async (lang, key) => {
  const d = await initDB();
  const row = await d.getFirstAsync(
    `SELECT value FROM translations WHERE lang = ? AND key = ?`,
    [lang, key]
  );
  return row?.value;
};

export const setCachedTranslation = async (lang, key, value) => {
  const d = await initDB();
  await d.runAsync(
    `INSERT OR REPLACE INTO translations (lang, key, value) VALUES (?, ?, ?)`,
    [lang, key, value]
  );
};

export const getAllCachedTranslations = async (lang) => {
  const d = await initDB();
  const rows = await d.getAllAsync(
    `SELECT key, value FROM translations WHERE lang = ?`,
    [lang]
  );
  const map = {};
  for (const r of rows) map[r.key] = r.value;
  return map;
};