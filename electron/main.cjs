// Aplikasi desktop: menyalakan core (Tor + server lokal) lalu membuka jendela
// yang hanya boleh memuat antarmuka lokal.
const { app, BrowserWindow, session } = require('electron');
const path = require('node:path');

let running = null;

async function createWindow() {
  const { startApp } = await import(path.join(__dirname, '..', 'server', 'index.js'));
  running = await startApp({
    dataDir: path.join(app.getPath('userData'), 'data'),
    direct: process.argv.includes('--no-tor'),
  });
  const origin = new URL(running.url).origin;

  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(permission === 'notifications' || permission === 'clipboard-sanitized-write'));

  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 360,
    minHeight: 560,
    backgroundColor: '#F3F4EF',
    title: 'Chat Lokal',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });

  // Jangan pernah membuka halaman luar di dalam aplikasi: itu bisa membocorkan IP di luar Tor.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(origin)) e.preventDefault();
  });

  win.loadURL(running.url);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => running?.close());
