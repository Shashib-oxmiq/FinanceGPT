# Everkin — Product Requirements Document

## Original Problem Statement
Build a Chrome plugin + web app that chats with the user (AI: Claude/Gemini/etc.), securely
collects all their information, auto-fills website/government forms, shows a digital copy of forms,
and bundles relevant documents (financial, tax, education, bank & credit card, immigration) into a
.zip. Evolved through the conversation into **Everkin — "the assistant that matters most"**: a
whole-life AI assistant that keeps ALL important documents in one place, advises on insurance
(life/health), money/ROI, credit & expense management, reviews bank/credit statements, and enables
a spouse/next-of-kin to access everything so benefits pass on correctly. Delivered as **web app +
Chrome extension + native mobile app (Expo)**.

## Architecture
- **Backend**: FastAPI (modular: deps.py, auth.py, ai.py, storage.py, routes.py, routes_legacy.py), MongoDB (motor), all routes /api-prefixed.
- **Web frontend**: React + Tailwind + shadcn + Phosphor icons, dark-first "Everkin" theme (Chivo/IBM Plex fonts).
- **Native app**: Expo/React Native in /app/mobile (shares the same backend via Bearer token).
- **Chrome extension**: MV3 in /app/extension (packaged to /app/frontend/public/extension.zip).
- **AI**: Emergent Universal LLM key — Claude Sonnet 4.6 + Gemini 3.1 Pro with smart routing (attachments/extraction/statements → Gemini; chat/advice → Claude).
- **Storage**: Emergent Object Storage for all document/attachment files.
- **Auth**: Email/password (bcrypt) + Emergent Google OAuth, unified session_token (cookie + Bearer), 15-min lockout after 5 failed logins.

## User Personas
- Individuals/families organizing their whole financial & life admin.
- A spouse/next-of-kin who must access records and file claims if the owner is unavailable.

## Core Requirements (static)
- Secure auth (email + Google), session-based.
- AI advisor chat with attachments; collects & structures profile data.
- Whole-life document vault (18 categories) with encrypted cloud storage.
- Insurance portfolio with corner-case handling + AI review.
- Money Insights: AI review of bank/credit statements (spend breakdown, subscriptions, advice).
- Smart form filler (digital pre-filled copy) + document bundler (.zip).
- Next-of-kin/legacy handover pack (summary + full zip export).
- Chrome extension form auto-fill; native mobile app.

## Implemented (with dates)
- 2026-08-25: Auth (email+Google, lockout), AI chat (Claude+Gemini) with streaming + file attachments, Profile + AI extraction, Insurance CRUD + AI review, Document Vault (upload/list/download/delete), Form Filler, Document Bundler (zip), Next-of-Kin + legacy handover export, Dashboard.
- 2026-08-25: Security fixes (expired-token download block, brute-force lockout), async storage (run_in_threadpool), mobile-responsive chat + portal modals, rebrand VaultKin → Everkin.
- 2026-08-25: Native mobile app (Expo) — Login/Register, Advisor chat w/ attachments, Dashboard, Insurance, Vault, Legacy, Money Insights.
- 2026-08-25: Money Insights (statement review), expanded to 18 life document categories, broadened whole-life advisor prompt, shared category labels.

## Test Status
- Web frontend: 100% pass (iterations 3 & 4). Backend endpoints curl-verified incl. insights.
- Native app: code-complete, must be run/built on user's machine via Expo/EAS (cannot run a simulator in this cloud container).

## Backlog / Remaining
- P1: Insurance date fields → proper date picker; money Intl.NumberFormat polish (partly done); focus-trap in Modal.
- P2: Life-milestone guided checklists (home purchase, new baby, retirement); statement analysis client-side timeout/abort; PWA install for web; investment/ROI tracker; native app document open/preview.
- P2: Emergent Google login on native app (currently email/password on mobile).

## Next Tasks
- Add guided life-event checklists that generate a tailored document bundle.
- Add an investment/ROI tracker feeding Money Insights.
- Wire real email invites for next-of-kin access.
