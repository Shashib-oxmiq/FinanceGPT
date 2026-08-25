# Everkin Auto-Fill — Chrome Extension

Intelligently fills website and government forms using your secure Everkin profile.

## Install (Developer mode)
1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and select this `extension/` folder.
4. Pin the VaultKin icon to your toolbar.

## Connect
1. Open the Everkin web app and sign in.
2. Get your access token: DevTools → Application → Local Storage → copy `vault_token`.
3. Click the extension icon, paste your **Backend URL** (the web app URL) and **token**, then **Connect**.

## Use
1. Navigate to any page with a form (login, application, government form).
2. Click the extension icon → **Auto-fill this page**.
3. Matched fields are filled from your profile and highlighted in green.

The extension only reads your profile via your token and fills fields locally in your browser. No data is sent anywhere else.
