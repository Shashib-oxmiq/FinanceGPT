const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  getBackendUrl: () => ipcRenderer.invoke('get-backend-url'),
  // Opens Google OAuth in the system default browser; the session_id is
  // relayed back via the 'google-session-id' event.
  googleLogin: () => ipcRenderer.invoke('google-login'),
  // Open any external URL in the system browser (Gmail OAuth, etc.)
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  // Listen for the session_id relayed from the OAuth callback server
  onGoogleSessionId: (callback) => {
    const handler = (_event, sessionId) => callback(sessionId);
    ipcRenderer.on('google-session-id', handler);
    // Return a cleanup function
    return () => ipcRenderer.removeListener('google-session-id', handler);
  },
});