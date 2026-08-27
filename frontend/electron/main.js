const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const http = require('http');
const net = require('net');
const SidecarManager = require('./sidecar');

// ── Guard: kill ELECTRON_RUN_AS_NODE if inherited from shell ──────────────
delete process.env.ELECTRON_RUN_AS_NODE;

const isDev = !app.isPackaged;
const sidecar = new SidecarManager();
let mainWindow = null;
let isQuitting = false;
let oauthServer = null;
let oauthPort = 0;
let crashCount = 0;
const MAX_CRASH_RESTARTS = 5;

// ── Local OAuth callback server ────────────────────────────────────────────
function startOAuthServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://127.0.0.1:${oauthPort}`);

      if (url.pathname === '/callback') {
        if (url.searchParams.get('session_id')) {
          relaySessionId(url.searchParams.get('session_id'));
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(OAUTH_SUCCESS_HTML);
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(OAUTH_RELAY_HTML);
        return;
      }

      if (url.pathname === '/relay') {
        const sessionId = url.searchParams.get('session_id');
        if (sessionId) relaySessionId(sessionId);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(OAUTH_SUCCESS_HTML);
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });

    const tmp = net.createServer();
    tmp.listen(0, '127.0.0.1', () => {
      oauthPort = tmp.address().port;
      tmp.close(() => {
        server.listen(oauthPort, '127.0.0.1', () => {
          oauthServer = server;
          console.log(`OAuth callback server on port ${oauthPort}`);
          resolve(oauthPort);
        });
      });
    });
  });
}

function relaySessionId(sessionId) {
  console.log(`Relaying Google session_id to renderer`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('google-session-id', sessionId);
  }
}

const OAUTH_RELAY_HTML = `<!doctype html>
<html><head><title>Completing sign-in…</title></head>
<body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0a0a0a;color:#ccc">
<div style="text-align:center">
<p style="font-size:1.2em;margin-bottom:1em">Completing sign-in…</p>
<p style="color:#888">You can close this tab and return to the app.</p>
</div>
<script>
const hash = window.location.hash || "";
const match = hash.match(/session_id=([^&]+)/);
if (match) {
  const sid = decodeURIComponent(match[1]);
  fetch("/relay?session_id=" + encodeURIComponent(sid)).catch(()=>{});
}
</script>
</body></html>`;

const OAUTH_SUCCESS_HTML = `<!doctype html>
<html><head><title>Sign-in complete</title></head>
<body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0a0a0a;color:#ccc">
<div style="text-align:center">
<p style="font-size:1.4em;margin-bottom:0.5em">✅ Sign-in complete</p>
<p style="color:#888">You can close this tab and return to the Everkin app.</p>
</div>
</body></html>`;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const useDevServer = isDev && process.env.ELECTRON_DEV_SERVER !== '0';
  if (useDevServer) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // ── Renderer crash detection and logging ───────────────────────────────
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error(`Renderer process gone! reason=${details.reason}, exitCode=${details.exitCode}`);
    // Only auto-restart on actual crashes, not on user-initiated close
    if (isQuitting) return;
    crashCount++;
    if (crashCount <= MAX_CRASH_RESTARTS && details.reason !== 'cleanly') {
      console.log(`Auto-restarting window (attempt ${crashCount}/${MAX_CRASH_RESTARTS})…`);
      setTimeout(() => {
        if (!isQuitting && mainWindow === null) createWindow();
      }, 1000);
    } else if (crashCount > MAX_CRASH_RESTARTS) {
      console.error(`Max crash restarts (${MAX_CRASH_RESTARTS}) exceeded — not restarting`);
    }
  });

  mainWindow.webContents.on('unresponsive', () => {
    console.error('Renderer became unresponsive');
  });

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    // Log renderer console errors to the main process stdout for debugging
    if (level >= 2) { // 0=verbose, 1=info, 2=warning, 3=error
      console.error(`[renderer] ${message} (${sourceId}:${line})`);
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  // Open external links in system browser (not inside Electron)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
}

// IPC handlers
ipcMain.handle('get-backend-url', () => sidecar.backendUrl || 'http://localhost:8000');

ipcMain.handle('google-login', async () => {
  const callbackUrl = `http://127.0.0.1:${oauthPort}/callback`;
  const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(callbackUrl)}`;
  console.log(`Opening Google OAuth in system browser: ${authUrl}`);
  await shell.openExternal(authUrl);
  return true;
});

// Open any external URL in the system browser (used for Gmail OAuth etc.)
ipcMain.handle('open-external', async (_event, url) => {
  console.log(`Opening external URL: ${url}`);
  await shell.openExternal(url);
  return true;
});

app.whenReady().then(async () => {
  try {
    await startOAuthServer();
    const backendUrl = await sidecar.start();
    console.log(`Sidecar started. Backend URL: ${backendUrl}`);
  } catch (err) {
    console.error('Failed to start sidecar:', err);
  }
  createWindow();
});

// macOS: re-create window when dock icon clicked
app.on('activate', () => {
  if (mainWindow === null) createWindow();
});

// When all windows are closed
app.on('window-all-closed', () => {
  if (isQuitting) return;
  if (process.platform === 'darwin') {
    // On macOS, quit the app when window is closed (standard behavior for utility apps)
    app.quit();
  } else {
    app.quit();
  }
});

app.on('before-quit', (event) => {
  if (isQuitting) return;
  isQuitting = true;
  event.preventDefault();

  if (oauthServer) {
    try { oauthServer.close(); } catch {}
    oauthServer = null;
  }

  sidecar.stop().then(() => app.exit(0)).catch(() => app.exit(0));

  setTimeout(() => {
    console.error('Sidecar stop timed out — forcing exit');
    app.exit(1);
  }, 5000);
});