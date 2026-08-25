# Everkin — Native Mobile App (Expo / React Native)

The native iOS + Android app for Everkin. It talks to the **same backend** as the web app,
so accounts, chats, insurance, documents and next-of-kin are shared across web and mobile.

## Features
- Email / password sign in & registration (shared with web).
- AI Advisor chat (Claude + Gemini) with **file attachments** (attachments auto-use Gemini).
- Dashboard with profile readiness + counts (pull-to-refresh).
- Insurance portfolio: add/list/delete policies + AI portfolio review.
- Document Vault: pick & upload files by category, list, delete.
- Next-of-Kin / Legacy: handover summary + manage trusted contacts.

## 1. Configure the backend URL
Edit `src/config.js` and set `BACKEND_URL` to your deployed backend (same URL as the web app),
with **no trailing slash**:
```js
export const BACKEND_URL = "https://YOUR-APP.preview.emergentagent.com";
```

## 2. Install & run (on your machine)
Requires Node 18+ and a phone with **Expo Go** (or an iOS/Android simulator).
```bash
cd mobile
yarn install          # or: npm install
npx expo install      # aligns native deps to the Expo SDK
npx expo start        # scan the QR code with Expo Go
```
- iOS simulator: press `i`  •  Android emulator: press `a`.

## 3. Build installable apps (App Store / Play Store)
Use EAS Build:
```bash
npm install -g eas-cli
eas login
eas build -p ios       # produces an .ipa
eas build -p android   # produces an .aab / .apk
```
Then submit with `eas submit`. See https://docs.expo.dev/build/introduction/.

## Notes
- Auth uses a Bearer token (stored in AsyncStorage), so it works without browser cookies.
- Chat streams via XHR progress for a live typing feel.
- This project was authored in the Everkin cloud workspace but must be run/built on your
  machine or via EAS — a mobile simulator cannot run inside the web backend container.
