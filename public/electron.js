const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const Store = require('electron-store');

const store = new Store();

// Create the main application window
function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      enableRemoteModule: false,
    },
    icon: path.join(__dirname, isDev ? '../public/logo192.png' : 'logo192.png'),
    show: false,
  });

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
  return {
    accessToken: store.get('slack-access-token'),
    teamId: store.get('slack-team-id'),
  };
});

ipcMain.handle('set-slack-tokens', async (_, { accessToken, teamId }) => {
  store.set('slack-access-token', accessToken);
  store.set('slack-team-id', teamId);
  return true;
});

ipcMain.handle('clear-slack-tokens', async () => {
  store.delete('slack-access-token');
  store.delete('slack-team-id');
  return true;
});
