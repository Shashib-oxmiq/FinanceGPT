# Everkin Feature Registry — Golden Database

> **Rules**: Feature IDs are permanent and never reused. A feature is never deleted —
> it is marked `deprecated` with a `superseded_by` pointer to the new feature ID.
> New features get the next sequential ID. This file is the single source of truth.
>
> **Statuses**: `active` · `deprecated` · `missing` (planned but not built) · `partial`
>
> **Platforms**: `desktop` = Electron/web app · `mobile` = React Native iOS app
>
> Last updated: 2026-08-27
> Total features registered: 219

---

## F-CHAT · AI Chat (Primary Interface)

| ID | Feature | Desktop | Mobile | Status | Notes |
|----|---------|---------|--------|--------|-------|
| F-001 | Full-screen AI chat with streaming responses | active | active | active | Yolo-Auto qwen3.8-27b, SSE streaming |
| F-002 | Multi-conversation support (create/switch/delete) | active | active | active | Mobile: header dropdown switcher |
| F-003 | Conversation sidebar with list + tools nav | active | active | active | Mobile: drawer sidebar |
| F-004 | Example prompts on empty state | active | active | active | 6 prompts on mobile, 4 on desktop |
| F-005 | File attachments in chat messages | active | active | active | Fixed 2026-08-27 — attach button in input bar |
| F-006 | Attachment preview (image/PDF/text) | active | missing | missing | |
| F-007 | Document download from chat preview | active | missing | missing | |
| F-008 | Text-to-speech (TTS) for AI messages | active | active | active | Fixed 2026-08-27 — Web Speech API on web, expo-speech on native |
| F-009 | AI model selector (Yolo/Claude/Gemini) | active | missing | missing | Mobile: hardcoded to Yolo |
| F-010 | Save conversation to profile (extract) | active | missing | missing | Extract profile from chat |
| F-011 | Dark/light theme toggle | active | missing | missing | Mobile: dark-only |
| F-012 | Cloud sync status indicator | active | missing | missing | Sync engine status in sidebar |
| F-013 | Manual cloud sync trigger | active | missing | missing | |
| F-014 | Reminder badge count in sidebar | active | missing | missing | |

## F-MARK · AI Action Markers (Chat-Driven CRUD)

| ID | Feature | Desktop | Mobile | Status | Notes |
|----|---------|---------|--------|--------|-------|
| F-015 | `[INV_ADD:{json}]` — add investment via chat | active | active | active | |
| F-016 | `[INV_EDIT:{json}]` — edit investment via chat | active | active | active | |
| F-017 | `[INV_DELETE:name]` — delete investment via chat | active | active | active | |
| F-018 | `[DOC_GEN:{json}]` — generate document via chat | active | active | active | Mobile: inline display, desktop: download |
| F-019 | `[LANG_CHANGE:xx]` — change app language via chat | active | active | active | |
| F-020 | `[FORM_REC:id]` — recommend form + check vault | missing | active | active | Mobile-only: checks vault for missing docs |
| F-021 | `[INS_ADD:{json}]` — add insurance via chat | missing | active | active | Mobile-only |
| F-022 | `[REM_ADD:{json}]` — create reminder via chat | missing | active | active | Mobile-only |
| F-023 | `[DOC_GEN]` inline display (no download) | missing | active | active | Mobile: shows in chat, desktop: auto-downloads |

## F-AI · AI System Intelligence

| ID | Feature | Desktop | Mobile | Status | Notes%| Notes |
|----|---------|---------|--------|--------|-------|
| F-024 | Smart system prompt with user profile | active | active | active | |
| F-025 | AI knows user's investment portfolio | active | active | active | Injected into system prompt |
| F-026 | AI knows user's insurance policies | active | active | active | |
| F-027 | AI knows user's vault documents | active | active | active | Filenames + categories |
| F-028 | AI knows pending reminders | missing | active | active | Mobile-only |
| F-029 | AI knows 100 forms database | active | active | active | Categories, not all listed |
| F-030 | AI knows 8 document templates | active | active | active | |
| F-031 | AI behavioral rules (proactive, concise) | active | active | active | |
| F-032 | AI response in user's language | active | active | active | 40 languages |
| F-033 | Conversation history context (last 12 msgs) | active | active | active | |

## F-AUTH · Authentication

| ID | Feature | Desktop | Mobile | Status | Notes |
|----|---------|---------|--------|--------|-------|
| F-034 | Email/password login | active | active | active | |
| F-035 | User registration | active | active | active | |
| F-036 | Guest mode (no account) | missing | active | active | Mobile-only |
| F-037 | Google OAuth login | active | missing | missing | Desktop: OAuth callback |
| F-038 | Auto-login (session token) | active | missing | missing | |
| F-039 | Secure token storage | active | active | active | Mobile: SecureStore, desktop: cookie/localStorage |

## F-I18N · Internationalization

| ID | Feature | Desktop | Mobile | Status | Notes |
|----|---------|---------|--------|--------|-------|
| F-040 | 40-language support | active | active | active | |
| F-041 | English translations (399 keys) | active | active | active | |
| F-042 | Hindi translations | active | active | active | |
| F-043 | French translations | active | missing | missing | |
| F-044 | 9 manual languages (bn,ta,te,es,de,ar,zh,ja,ko) | partial | missing | partial | Desktop: ~20-40 keys each, not full 399 |
| F-045 | Pre-translation cache (27 languages) | partial | missing | partial | Desktop: 3 of 27 cached |
| F-046 | Language switcher dropdown | active | active | active | |
| F-047 | Backend translation endpoint | active | missing | missing | /api/i18n/translate |
| F-048 | Chunked batch translation (20 keys/batch) | active | missing | missing | |

## F-INV · Investments

| ID | Feature | Desktop | Mobile | Status | Notes |
|----|---------|---------|--------|--------|-------|
| F-049 | Investment CRUD (add/edit/delete) | active | active | active | |
| F-050 | Investment summary (total invested/current/gain) | active | active | active | |
| F-051 | 4 stat cards (Net Worth, Invested, Current, ROI) | active | active | active | |
| F-052 | Live price auto-fetch (Yahoo Finance) | active | active | active | |
| F-053 | Manual refresh live prices button | active | active | active | |
| F-054 | Live prices status bar ("N of M updated") | active | active | active | |
| F-055 | Live-adjusted summary recalculation | active | active | active | |
| F-056 | Currency symbols ($ ₹ € £ ¥) | active | active | active | |
| F-057 | Market state indicator (LIVE/CLOSED) | active | active | active | 🟢/🔴 |
| F-058 | Today's change % from live data | active | active | active | |
| F-059 | Click-to-edit investment | active | active | active | |
| F-060 | Asset type picker (stock/ETF/bond/crypto/gold/etc) | active | active | active | |
| F-061 | Pull-to-refresh | N/A | active | active | Mobile-only |
| F-062 | SmartAddBar (natural language add) | active | active | active | |
| F-063 | PanelChat (AI help on page) | active | active | active | |
| F-064 | Investment meta (types list from backend) | active | active | active | Fixed 2026-08-27 — hardcoded in picker chips |

## F-INS · Insurance

| ID | Feature | Desktop | Mobile | Status | Notes |
|----|---------|---------|--------|--------|-------|
| F-065 | Insurance policy CRUD | active | active | active | |
| F-066 | Policy fields (type, provider, sum assured, premium) | active | active | active | |
| F-067 | Premium frequency (annual/semi/quarterly/monthly) | active | active | active | |
| F-068 | Maturity date tracking | active | active | active | |
| F-069 | Nominee assignment | active | active | active | |
| F-070 | SmartAddBar | active | active | active | |
| F-071 | PanelChat | active | active | active | |

## F-VAULT · Document Vault

| ID | Feature | Desktop | Mobile | Status | Notes |
|----|---------|---------|--------|--------|-------|
| F-072 | Document upload | active | active | active | Mobile: DocumentPicker shim |
| F-073 | Document download | active | active | active | Fixed 2026-08-27 — Share button on vault cards |
| F-074 | Document preview | active | missing | missing | |
| F-075 | Category filter (9 categories) | active | active | active | |
| F-076 | Document delete | active | active | active | |
| F-077 | Smart duplicate detection (content hash) | active | active | active | |
| F-078 | Duplicate alert on upload | active | active | active | |
| F-079 | AI document classification | active | missing | missing | Backend classifies via AI |
| F-080 | Document metadata extraction | active | missing | missing | |
| F-081 | SmartAddBar | active | active | active | Fixed 2026-08-27 |
| F-082 | PanelChat | active | active | active | Fixed 2026-08-27 |

## F-FORM · Forms & Document Preparation

| ID | Feature | Desktop | Mobile | Status | Notes |
|----|---------|---------|--------|--------|-------|
| F-083 | 100 Indian government forms database | active | active | active | 10 categories |
| F-084 | Form search (name/authority/description) | active | deprecated | deprecated | Mobile: superseded_by F-183. Desktop still uses search. |
| F-085 | Category filter | active | deprecated | deprecated | Mobile: superseded_by F-183. Desktop still uses categories. |
| F-086 | Form detail (authority, fees, processing time) | active | active | active | |
| F-087 | Required documents checklist | active | active | active | |
| F-088 | Vault matching (have vs missing docs) | active | active | active | Checks user's vault |
| F-089 | PDF/text checklist download | active | deprecated | deprecated | Superseded_by F-187 (in-chat checklist) |
| F-090 | Example prompts (3) instead of full grid | missing | active | active | Mobile: chat-driven approach |
| F-091 | Browse all forms link | missing | active | active | Mobile: available but not primary |
| F-092 | SmartAddBar | active | active | active | |
| F-093 | PanelChat | active | active | active | |
| F-094 | Secure share (password-protected link) | active | missing | missing | |
| F-095 | Copy share link to clipboard | active | missing | missing | |

## F-DOC · Document Generation

| ID | Feature | Desktop | Mobile | Status | Notes |
|----|---------|---------|--------|--------|-------|
| F-096 | 8 legal templates (rental, NDA, will, etc) | active | active | active | |
| F-097 | Template field auto-fill from profile | active | active | active | |
| F-098 | PDF generation | active | missing | missing | Mobile: text only |
| F-099 | DOCX generation | active | missing | missing | Mobile: text only |
| F-100 | Text generation | missing | deprecated | deprecated | Superseded_by F-186 (structured doc objects) |
| F-101 | Document download (web: Blob, native: Sharing) | active | deprecated | deprecated | Superseded_by F-185 (share as primary action) |
| F-102 | Inline document display in chat | missing | active | active | Mobile: now uses DocumentCard |
| F-103 | MCP document generation server | active | missing | missing | backend/mcp_docgen.py |
| F-104 | Chat-driven document generation | active | active | active | [DOC_GEN] marker |

## F-MARKET · Market Data

| ID | Feature | Desktop | Mobile | Status | Notes |
|----|---------|---------|--------|--------|-------|
| F-105 | Yahoo Finance quote fetch | active | active | active | |
| F-106 | Smart symbol resolution (US/NSE/BSE/crypto) | active | active | active | |
| F-107 | Portfolio quotes (batch) | active | active | active | |
| F-108 | Market news | active | missing | missing | /market/news endpoint |
| F-109 | Portfolio news | active | missing | missing | /market/portfolio-news |
| F-110 | Market search | active | missing | missing | /market/search |

## F-DASH · Dashboard

| ID | Feature | Desktop | Mobile | Status | Notes |
|----|---------|---------|--------|--------|-------|
| F-111 | Financial overview stats | active | active | active | |
| F-112 | Quick access grid | active | active | active | |
| F-113 | Net worth display | active | active | active | |
| F-114 | Recent activity | active | active | active | Fixed 2026-08-27 — recent investments + reminders on dashboard |
| F-115 | SmartAddBar | active | active | active | |
| F-116 | PanelChat | active | active | active | Fixed 2026-08-27 (was already rendered) |

## F-REM · Reminders

| ID | Feature | Desktop | Mobile | Status | Notes |
|----|---------|---------|--------|--------|-------|
| F-117 | Reminder CRUD | active | active | active | |
| F-118 | Priority levels (high/medium/low) | active | active | active | |
| F-119 | Due date tracking | active | active | active | |
| F-120 | Completion toggle | active | active | active | |
| F-121 | Category tagging | active | active | active | Fixed 2026-08-27 — 10 category picker chips |
| F-122 | SmartAddBar | active | active | active | |
| F-123 | PanelChat | active | active | active | Fixed 2026-08-27 |

## F-INSIGHT · Insights

| ID | Feature | Desktop | Mobile | Status | Notes |
|----|---------|---------|--------|--------|-------|
| F-124 | Portfolio ROI | active | active | active | |
| F-125 | Allocation breakdown | active | active | active | |
| F-126 | Statement analysis | active | missing | missing | /insights/statement |
| F-127 | SmartAddBar | active | active | active | Fixed 2026-08-27 |
| F-128 | PanelChat | active | active | active | Fixed 2026-08-27 |

## F-LIFE · Life Events

| ID | Feature | Desktop | Mobile | Status | Notes |
|----|---------|---------|--------|--------|-------|
| F-129 | 8 life event types (icon grid) | active | deprecated | deprecated | Mobile: superseded_by F-184 (conversational life events) |
| F-130 | Event tracking | active | active | active | |
| F-131 | Event guide/checklist | active | active | active | Fixed 2026-08-27 — covered by F-182/F-184 conversational AI |
| F-132 | SmartAddBar | active | active | active | Fixed 2026-08-27 |
| F-133 | PanelChat | active | active | active | Fixed 2026-08-27 |

## F-LEGACY · Legacy & Estate

| ID | Feature | Desktop | Mobile | Status | Notes |
|----|---------|---------|--------|--------|-------|
| F-134 | Trusted contacts CRUD | active | active | active | |
| F-135 | Access levels (view/admin) | active | active | active | |
| F-136 | Secure shares management | active | active | active | |
| F-137 | SmartAddBar | active | active | active | Fixed 2026-08-27 |
| F-138 | PanelChat | active | active | active | Fixed 2026-08-27 |

## F-GMAIL · Gmail Integration

| ID | Feature | Desktop | Mobile | Status | Notes |
|7-----------|---------|---------|--------|--------|-------|
| F-139 | IMAP app password connection | active | partial | partial | Mobile: stub, needs remote backend |
| F-140 | Email scanning for financial docs | active | missing | missing | |
| F-141 | SmartAddBar | active | active | active | Fixed 2026-08-27 |
| F-142 | PanelChat | active | active | active | Fixed 2026-08-27 |

## F-SYNC · Cloud Sync

| ID | Feature | Desktop | Mobile | Status | Notes |
|----|---------|---------|--------|--------|-------|
| F-143 | Bidirectional sync (local ↔ Atlas) | active | active | active | Disabled: ATLAS_URL not set |
| F-144 | Sync status indicator | active | missing | missing | |
| F-145 | Manual sync trigger | active | missing | missing | |

## F-BUNDLE · Document Bundler

| ID | Feature | Desktop | Mobile | Status | Notes |
|----|---------|---------|--------|--------|-------|
| F-146 | Document bundling | active | active | active | |
| F-147 | Secure share creation | active | active | active | |
| F-148 | Bundle history | active | active | active | |
| F-149 | AI bundle suggestion | active | missing | missing | /bundle/suggest |
| F-150 | SmartAddBar | active | active | active | |
| F-151 | PanelChat | active | active | active | Fixed 2026-08-27 (moved outside FlatList) |

## F-FORMFILL · Form Filler

| ID | Feature | Desktop | Mobile | Status | Notes |
|----|---------|---------|--------|--------|-------|
| F-152 | Form selection from list | active | deprecated | deprecated | Mobile: superseded_by F-183 (conversational form ID) |
| F-153 | Form field filling | active | active | active | |
| F-154 | Saved form copies | active | active | active | |
| F-155 | Checklist download | active | active | active | |
| F-156 | SmartAddBar | active | active | active | |
| F-157 | PanelChat | active | active | active | Fixed 2026-08-27 (added to list view) |

## F-PROFILE · Profile

| ID | Feature | Desktop | Mobile | Status | Notes |
|----|---------|---------|--------|--------|-------|
| F-158 | Personal info (name/phone/DOB/address/income) | active | active | active | |
| F-159 | Profile completeness score | active | active | active | Fixed 2026-08-27 — progress bar + guidance text |
| F-160 | Language switcher (dropdown) | active | active | active | |
| F-161 | Logout | active | active | active | |
| F-162 | Avatar with user initial | missing | active | active | Mobile-only |

## F-NAV · Navigation

| ID | Feature | Desktop | Mobile | Status | Notes |
|----|---------|---------|--------|--------|-------|
| F-163 | Tab bar (5 tabs: Advisor/Home/Money/Insurance/Forms) | N/A | active | active | Mobile-only |
| F-164 | Stack navigation for 10 additional screens | N/A | active | active | Mobile-only |
| F-165 | Back button on all stack screens | N/A | active | active | Mobile-only |
| F-166 | Sidebar with tools nav | active | active | active | |
| F-167 | Router-based navigation (13 routes) | active | N/A | active | Desktop-only |

## F-BACKEND · Backend Services

| ID | Feature | Desktop | Mobile | Status | Notes |
|----|---------|---------|--------|--------|-------|
| F-168 | FastAPI server | active | N/A | active | Desktop: port 8000 |
| F-169 | MongoDB | active | N/A | active | Desktop: embedded |
| F-170 | Embedded SQLite | N/A | active | active | Mobile: offline-first |
| F-171 | Local file storage | active | N/A | active | backend/storage.py |
| F-172 | AI proxy endpoint (CORS bypass) | active | active | active | /api/mobile/ai/chat |
| F-173 | PyInstaller packaging | missing | N/A | missing | Not yet built |
| F-174 | Electron-builder packaging | missing | N/A | missing | Not yet tested |

## F-PLATFORM · Platform Features

| ID | Feature | Desktop | Mobile | Status | Notes |
|----|---------|---------|--------|--------|-------|
| F-175 | macOS support | active | active | active | |
| F-176 | Windows support | missing | missing | missing | Not tested |
| F-177 | Linux support | missing | missing | missing | Not tested |
| F-178 | iOS native build | N/A | missing | missing | Needs Xcode |
| F-179 | Android native build | N/A | missing | missing | Not attempted |
| F-180 | Web mode (browser testing) | N/A | active | active | Expo web + CORS proxy |

## F-NATIVE · AI-Native Experience (v2 Redesign)

| ID | Feature | Desktop | Mobile | Status | Notes |
|----|---------|---------|--------|--------|-------|
| F-181 | Adaptive AI intelligence (matches user's level) | missing | active | active | Simple for less-educated, precise for professionals |
| F-182 | Proactive life-event detection from conversation | missing | active | active | AI detects marriage/home/child/job from chat |
| F-183 | Conversational form identification (no catalog) | missing | active | active | AI finds form from user's description, not browsing |
| F-184 | Conversational life events (no icon grid) | missing | active | active | 4 life-situation prompts + chat, no 8-icon grid |
| F-185 | Document Share as primary action (replaces download) | missing | active | active | Share API (native) / clipboard (web) |
| F-186 | Structured document objects for in-chat display | missing | active | active | generateDocumentObject() → DocumentCard |
| F-187 | In-chat checklist (replaces file download) | missing | active | active | generateChecklistObject() with matched/missing docs |
| F-188 | DocumentCard component (rich in-chat document) | missing | active | active | Preview, Save to Vault, Share, Modify buttons |
| F-189 | Document modification in chat | missing | active | active | "Modify" button pre-fills input for AI re-generation |
| F-190 | Life-situation example prompts | missing | active | active | Marriage, home, child, job change, business |

---

## F-NEXT10 · Next-Generation Features (10 New Ways to Improve)

| ID | Feature | Desktop | Mobile | Status | Notes |
|----|---------|---------|--------|--------|-------|
| F-191 | Financial Health Score (0-100) | missing | active | active | Dashboard widget: emergency fund, insurance, diversification, documents, profile, debt |
| F-192 | AI Daily Briefing | missing | active | active | Morning portfolio/deadlines/suggestion briefing, 20h cache, in-chat card |
| F-193 | Voice Input (speech-to-text) | missing | active | active | Web Speech API on web, mic button in chat input bar |
| F-194 | Goal-Based Planning | missing | active | active | Goals table, create/track/contribute, progress bar, on-track calculation, dashboard widget |
| F-195 | Emergency Access (dead-man switch) | missing | active | active | Legacy screen: toggle + inactivity threshold (15/30/60/90 days) + trusted contacts |
| F-196 | Proactive AI Notifications | missing | active | active | AI scans user data every 6h, generates contextual alerts, browser Notification API |
| F-197 | Smart Receipt Scanner | missing | active | active | Camera capture → AI extracts amount/merchant/category → monthly expense summary |
| F-198 | Family Vault (scoped access) | missing | active | active | Family members with 5 access scopes: full, spouse, parent, advisor, view-only |
| F-199 | WhatsApp Integration framework | missing | partial | partial | Service + config ready, backend webhook endpoints documented, needs WhatsApp Business API |
| F-200 | Offline AI framework | missing | active | active | Connectivity detection, cached response fallback, static KB for common queries |

---

## F-LIFE2 · Life Dimension Expansion (Round 2)

| ID | Feature | Desktop | Mobile | Status | Notes |
|----|---------|---------|--------|--------|-------|
| F-201 | Government Scheme Discovery & Eligibility Checker | missing | active | active | 30+ schemes, profile-based eligibility, categories, detail modal |
| F-202 | Insurance Gap Analysis | missing | active | active | Protection score, shortfall calc, urgency-ranked gaps, covered list |
| F-203 | Document Expiry Tracking | missing | active | active | Passport, DL, RC, insurance, PUC, FSSAI expiries with urgency alerts |
| F-204 | Medical Records Timeline | missing | active | active | Prescriptions, labs, vaccinations, diagnoses, allergies, emergency info |
| F-205 | Legal Rights in Simple Language | missing | active | active | Consumer, tenant, employee, women, traffic, RTI, property rights |
| F-206 | AI Memory Across Sessions | missing | active | active | Persistent memory table, auto-extraction, memory context in AI prompt |
| F-207 | Smart Reminders Linked to Docs | missing | active | active | Context-aware: doc expiry, premiums, goal contributions, tax deadlines |

---

## F-LIFE3 · Life Dimension Expansion (Round 3)

| ID | Feature | Desktop | Mobile | Status | Notes |
|----|---------|---------|--------|--------|-------|
| F-208 | Credit & Loan Manager | missing | active | active | EMI tracker, debt-to-income ratio, refinance alerts, payoff timeline |
| F-209 | Bill & Utility Tracker | missing | active | active | Electricity, water, gas, phone, internet, rent — overdue alerts |
| F-210 | Children's Education Planner | missing | active | active | Cost calculator (10% inflation), admission checklists, scholarships, education loans |
| F-211 | Retirement Planning | missing | active | active | NPS/EPF/PPF tracker, corpus calculator (25x rule), projection, shortfall |
| F-212 | Tax Filing & ITR Prep | missing | active | active | Tax calculator (old vs new), regime comparison, ITR form selector, filing links |
| F-213 | Property & Asset Registry | missing | active | active | Property CRUD, valuation tracking, property tax, mutation status, tax links |
| F-214 | Premium Payment Calendar | missing | active | active | All insurance premiums in unified timeline, monthly grouping |
| F-215 | Tax Saving Suggestions | missing | active | active | 80C/80D/80CCD analyzer, save ₹X by investing ₹Y, ELSS/PPF/NPS |
| F-216 | Bilingual Document Generation | missing | active | active | Hindi+English legal documents, regional language templates |
| F-217 | Health Score Trend Over Time | missing | active | active | Weekly snapshots, trend direction (improving/declining/stable) |
| F-218 | OCR Text Search in Vault | missing | active | active | Search inside documents, filename/category/metadata/content matching |
| F-219 | Portfolio Rebalancing Suggestions | missing | active | active | Asset allocation analysis, risk profile, overweight/underweight alerts |

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| Total features registered | 219 |
| Active on both platforms | 115 |
| Desktop-only (active) | 38 |
| Mobile-only (active) | 51 |
| Missing on mobile | 25 |
| Missing on desktop | 39 |
| Partial | 5 |
| Deprecated | 7 |

## Top Missing Features on Mobile (Priority Order)

1. **F-005** File attachments in chat
2. **F-008** Text-to-speech for AI messages
3. **F-073** Document download from vault
4. **F-074** Document preview
5. **F-079** AI document classification
6. **F-094** Secure share (password-protected link)
7. **F-098** PDF generation
8. **F-099** DOCX generation
9. **F-108** Market news
10. **F-126** Statement analysis
11. **F-011** Dark/light theme toggle
12. **F-037** Google OAuth login
13. **F-043** French translations (and 8 other manual languages)
14. **F-064** Investment meta (types list from backend)
15. **F-079** AI document classification
16. **F-080** Document metadata extraction
17. **F-109** Portfolio news
18. **F-110** Market search
19. **F-114** Recent activity on dashboard
20. **F-121** Category tagging on reminders
21. **F-131** Life event guide/checklist
22. **F-149** AI bundle suggestion
23. **F-159** Profile completeness score

---

## Change Log

| Date | Change | By |
|------|--------|----|
| 2026-08-27 | Initial registry created with 180 features | LivAgent |
| 2026-08-27 | F-049 to F-064: InvestmentsScreen rebuilt to match desktop | LivAgent |
| 2026-08-27 | F-020 to F-022: New mobile-only markers (FORM_REC, INS_ADD, REM_ADD) | LivAgent |
| 2026-08-27 | F-090 to F-091: Mobile-only example prompts replacing form grid | LivAgent |
| 2026-08-27 | F-165: Back buttons added to all stack screens | LivAgent |
| 2026-08-27 | F-160: Profile language grid replaced with dropdown | LivAgent |
| 2026-08-27 | F-172: AI proxy endpoint added for CORS bypass | LivAgent |
| 2026-08-27 | F-081/F-082: SmartAddBar+PanelChat added to VaultScreen | LivAgent |
| 2026-08-27 | F-122/F-123: SmartAddBar+PanelChat added to RemindersScreen | LivAgent |
| 2026-08-27 | F-127/F-128: SmartAddBar+PanelChat added to InsightsScreen | LivAgent |
| 2026-08-27 | F-132/F-133: SmartAddBar+PanelChat added to LifeEventsScreen | LivAgent |
| 2026-08-27 | F-137/F-138: SmartAddBar+PanelChat added to LegacyScreen | LivAgent |
| 2026-08-27 | F-141/F-142: SmartAddBar+PanelChat added to GmailScreen | LivAgent |
| 2026-08-27 | F-151: PanelChat moved outside FlatList on BundlerScreen | LivAgent |
| 2026-08-27 | F-157: PanelChat added to FormFiller list view | LivAgent |
| 2026-08-27 | F-116: PanelChat confirmed already rendered on DashboardScreen | LivAgent |
| 2026-08-27 | F-084/F-085/F-089/F-100/F-101/F-129/F-152: Deprecated old paradigms (form catalog, text download, icon grid) | LivAgent |
| 2026-08-27 | F-181 to F-190: New AI-native features added (adaptive AI, proactive detection, DocumentCard, conversational forms/events, in-chat checklists) | LivAgent |
| 2026-08-27 | F-005: File attachments in chat (attach button in input bar) | LivAgent |
| 2026-08-27 | F-008: TTS for AI messages (Web Speech API, expo-speech on native) | LivAgent |
| 2026-08-27 | F-064: Investment meta types hardcoded in picker | LivAgent |
| 2026-08-27 | F-073: Document share from vault (Share button on cards) | LivAgent |
| 2026-08-27 | F-114: Recent activity on dashboard (investments + reminders) | LivAgent |
| 2026-08-27 | F-121: Category tagging on reminders (10 category picker) | LivAgent |
| 2026-08-27 | F-131: Life event guide (covered by conversational AI F-182/F-184) | LivAgent |
| 2026-08-27 | F-159: Profile completeness score (progress bar + guidance) | LivAgent |
| 2026-08-27 | F-191 to F-200: 10 next-generation features added (Health Score, Daily Briefing, Voice Input, Goal Planning, Emergency Access, Proactive Notifications, Receipt Scanner, Family Vault, WhatsApp framework, Offline AI framework) | LivAgent |
| 2026-08-27 | F-201 to F-207: 7 life-dimension expansion features (Govt Schemes, Insurance Gap Analysis, Document Expiry, Medical Records, Legal Rights, AI Memory, Smart Reminders) | LivAgent |
| 2026-08-27 | F-208 to F-219: 12 more life-dimension features (Credit/Loans, Bills, Education, Retirement, Tax Filing, Property, Premium Calendar, Tax Saving, Bilingual Docs, Health Score Trend, OCR Search, Portfolio Rebalancing) | LivAgent |

---

##6# Deprecation Rules

1. **Never delete a feature ID.** Mark it `deprecated` and add `superseded_by` with the new ID.
2. **Never reuse an ID.** New features get the next sequential number.
3. **Status transitions**: `missing` → `active` → `deprecated` (→ `active` as new ID)
4. **Platform changes**: Update the Desktop/Mobile column, never remove a row.
5. **When a feature is split**, the original is deprecated and superseded by multiple new IDs.
6. **When features merge**, all originals are deprecated and superseded by one new ID.
7. **The change log must be updated** on every change to this file.

### Example Deprecation

```markdown
| F-099 | DOCX generation | active | missing | deprecated | superseded_by: F-200 |
| F-200 | DOCX generation (v2, template-based) | missing | missing | active | Replaces F-099 |
```
