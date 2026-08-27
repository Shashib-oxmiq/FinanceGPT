// ── App Config ─────────────────────────────────────────────────────────────────
// Central config — backend URL, AI keys, API endpoints
// On iOS, the backend runs as embedded SQLite (no remote server needed).
// When ATLAS_URL is set, cloud sync activates.

export const CONFIG = {
  // Backend mode: 'local' = embedded SQLite, 'remote' = FastAPI server
  BACKEND_MODE: 'local',

  // Remote backend URL (used when BACKEND_MODE === 'remote' or for cloud sync)
  BACKEND_URL: __DEV__ ? 'http://localhost:8000' : 'https://api.everkin.com',

  // Yolo-Auto AI
  AI_BASE_URL: 'https://yolo-auto.com/v1',
  AI_MODEL: 'qwen3.8-27b',
  AI_API_KEY: '', // Set via expo-secure-store at runtime

  // Market data (Yahoo Finance — no API key needed)
  MARKET_BASE_URL: 'https://query1.finance.yahoo.com/v8/finance',

  // Cloud sync (optional)
  ATLAS_URL: '', // Set to enable cloud sync
  ATLAS_DB_NAME: 'everkin_mobile',

  // Storage
  DB_NAME: 'everkin.db',
  STORAGE_DIR: 'everkin_storage',

  // Sync interval (ms)
  SYNC_INTERVAL: 60000,
};

// API endpoint paths (mirror FastAPI routes for seamless swap)
export const ENDPOINTS = {
  AUTH: {
    ME: '/api/auth/me',
    LOGIN: '/api/auth/login',
    REGISTER: '/api/auth/register',
    GOOGLE: '/api/auth/google',
  },
  CHAT: {
    CONVERSATIONS: '/api/chat/conversations',
    MESSAGES: '/api/chat/conversations/{id}/messages',
    SEND: '/api/chat/conversations/{id}/message',
    PANEL: '/api/chat/panel',
    SMART_ADD: '/api/chat/smart-add',
  },
  INVESTMENTS: {
    LIST: '/api/investments',
    SUMMARY: '/api/investments/summary',
    ADD: '/api/investments',
    UPDATE: '/api/investments/{id}',
    DELETE: '/api/investments/{id}',
    CHAT_ACTION: '/api/investments/chat-action',
  },
  MARKET: {
    QUOTE: '/api/market/quote',
    SEARCH: '/api/market/search',
    PORTFOLIO_QUOTES: '/api/market/portfolio-quotes',
  },
  FORMS: {
    LIST: '/api/forms',
    DETAIL: '/api/forms/{id}',
    MATCH: '/api/forms/{id}/match',
  },
  DOCS: {
    TEMPLATES: '/api/documents/templates',
    GENERATE: '/api/documents/generate',
    FORM_CHECKLIST: '/api/documents/form-checklist',
  },
  GMAIL: {
    STATUS: '/api/gmail/status',
    SCAN: '/api/gmail/scan',
    CONNECT: '/api/gmail/connect',
  },
  I18N: {
    TRANSLATE: '/api/i18n/translate',
  },
};