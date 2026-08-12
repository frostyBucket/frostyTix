import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import started from 'electron-squirrel-startup';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// Fixed on purpose - Google's Authorized JavaScript Origins needs an exact,
// unchanging value to register. A random/ephemeral port would produce a
// different origin on every launch and could never actually be authorized.
// Add http://127.0.0.1:43219 to the OAuth client's Authorized JavaScript
// Origins in Google Cloud Console to match this.
const RENDERER_SERVER_PORT = 43219;

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

// Serves the already-built renderer files over real HTTP instead of
// file:// - file:// pages get an opaque "null" origin that Google
// Identity Services has no way to be configured to trust. Bound to
// 127.0.0.1 only, so this never listens beyond the local machine.
function startRendererServer(rootDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let requestedPath = decodeURIComponent(req.url.split('?')[0]);
      if (requestedPath === '/') {
        requestedPath = '/index.html';
      }

      // Strip any leading ../ sequences before joining, so a request can't
      // escape rootDir.
      const safeSuffix = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, '');
      const filePath = path.join(rootDir, safeSuffix);

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }

        const ext = path.extname(filePath);
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
        res.end(data);
      });
    });

    server.on('error', reject);
    server.listen(RENDERER_SERVER_PORT, '127.0.0.1', () => resolve(server));
  });
}

let rendererServer;

const createWindow = async () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    const rootDir = path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}`);

    if (!rendererServer) {
      rendererServer = await startRendererServer(rootDir);
    }

    mainWindow.loadURL(`http://127.0.0.1:${RENDERER_SERVER_PORT}/index.html`);
  }

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  createWindow();

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (rendererServer) {
    rendererServer.close();
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
