const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use IPC
contextBridge.exposeInMainWorld('electron', {
  // Authentication
  getAuthToken: () => ipcRenderer.invoke('get-auth-token'),
  setAuthToken: (token) => ipcRenderer.invoke('set-auth-token', token),
  clearAuthToken: () => ipcRenderer.invoke('clear-auth-token'),
  
  // Slack integration
  getSlackTokens: () => ipcRenderer.invoke('get-slack-tokens'),
  setSlackTokens: (tokens) => ipcRenderer.invoke('set-slack-tokens', tokens),
  clearSlackTokens: () => ipcRenderer.invoke('clear-slack-tokens'),
});
