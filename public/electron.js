const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const Store = require('electron-store');

const store = new Store();
let mainWindow; // Keep reference to main window

// Register custom protocol
app.setAsDefaultProtocolClient('synth');

// Create the main application window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      enableRemoteModule: false,
      webSecurity: !isDev // Disable webSecurity in development mode only
    },
    icon: path.join(__dirname, isDev ? '../public/logo192.png' : 'logo192.png'),
    show: false,
  });

  // WebSocket proxy to fix WebSocket connection issues in development
  if (isDev) {
    mainWindow.webContents.session.webRequest.onBeforeSendHeaders(
      { urls: ['ws://localhost:3000/*'] },
      (details, callback) => {
        callback({ requestHeaders: { ...details.requestHeaders, Origin: 'http://localhost:3000' } });
      }
    );
  }

  // Load the app
  mainWindow.loadURL(
    isDev
      ? 'http://localhost:3000'
      : `file://${path.join(__dirname, '../build/index.html')}`
  );

  // Show window when ready to avoid flickering
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }
}

// Process protocol URLs on macOS
app.on('open-url', (event, url) => {
  event.preventDefault();
  
  if (url.startsWith('synth://slack/oauth/callback')) {
    const urlObj = new URL(url);
    const code = urlObj.searchParams.get('code');
    const state = urlObj.searchParams.get('state');
    
    if (code && mainWindow) {
      // Send the code and state to the renderer process
      mainWindow.webContents.send('slack-oauth-callback', { 
        code,
        state
      });
    }
  }
});

// Create window when Electron is ready
app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// IPC handlers for communication between renderer and main process
ipcMain.handle('get-auth-token', async () => {
  return store.get('auth-token');
});

ipcMain.handle('set-auth-token', async (_, token) => {
  store.set('auth-token', token);
  return true;
});

ipcMain.handle('clear-auth-token', async () => {
  store.delete('auth-token');
  return true;
});

ipcMain.handle('get-slack-tokens', async () => {
  const tokens = {
    accessToken: store.get('slack-access-token'),
    teamId: store.get('slack-team-id'),
    userId: store.get('slack-user-id')
  };
  console.log('Retrieved Slack tokens from Electron store:', {
    hasAccessToken: !!tokens.accessToken,
    hasTeamId: !!tokens.teamId,
    hasUserId: !!tokens.userId,
    userId: tokens.userId
  });
  return tokens;
});

ipcMain.handle('set-slack-tokens', async (_, { accessToken, teamId, userId }) => {
  console.log('Setting Slack tokens in Electron store:', {
    hasAccessToken: !!accessToken,
    hasTeamId: !!teamId,
    hasUserId: !!userId,
    userId: userId
  });
  
  store.set('slack-access-token', accessToken);
  store.set('slack-team-id', teamId);
  if (userId) {
    store.set('slack-user-id', userId);
  }
  
  // Verify the tokens were stored
  const storedAccessToken = store.get('slack-access-token');
  const storedTeamId = store.get('slack-team-id');
  const storedUserId = store.get('slack-user-id');
  
  console.log('Verified Slack tokens in Electron store:', {
    hasAccessToken: !!storedAccessToken,
    hasTeamId: !!storedTeamId,
    hasUserId: !!storedUserId,
    userId: storedUserId
  });
  
  return true;
});

ipcMain.handle('clear-slack-tokens', async () => {
  store.delete('slack-access-token');
  store.delete('slack-team-id');
  store.delete('slack-user-id');
  return true;
});
