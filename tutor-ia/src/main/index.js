const { app, BrowserWindow, session } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });

  win.loadFile(path.join(__dirname, '..', 'render', 'index.html'));
}

app.whenReady().then(() => {
  // Autoriza el acceso al micrófono sin que truene el permiso en Windows
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(true);
  });
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});