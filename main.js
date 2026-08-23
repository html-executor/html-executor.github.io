const { app, BrowserWindow } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ─── EMBED YOUR FULL index.html HERE ───
const embeddedHTML = `<!DOCTYPE html>
<html>
<head>...</head>
<body>...</body>
</html>`;
// ────────────────────────────────────────

let server;
let mainWindow;

function startServer() {
  server = http.createServer((req, res) => {
    const requestPath = decodeURIComponent(req.url.split('?')[0]);

    // Serve the embedded platform for the root
    if (requestPath === '/' || requestPath === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(embeddedHTML);
      return;
    }

    // Check if the request matches a file in the same folder as the exe (games, thumbnails, games.json)
    const externalPath = path.join(path.dirname(process.execPath), requestPath);
    if (fs.existsSync(externalPath) && fs.statSync(externalPath).isFile()) {
      const ext = path.extname(externalPath);
      let contentType = 'text/html';
      switch (ext) {
        case '.js': contentType = 'text/javascript'; break;
        case '.css': contentType = 'text/css'; break;
        case '.json': contentType = 'application/json'; break;
        case '.png': contentType = 'image/png'; break;
        case '.jpg': case '.jpeg': contentType = 'image/jpeg'; break;
        case '.svg': contentType = 'image/svg+xml'; break;
      }
      fs.readFile(externalPath, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
      });
      return;
    }

    // Otherwise return 404
    res.writeHead(404);
    res.end('Not found');
  });

  const port = 0; // random free port
  server.listen(port, '127.0.0.1', () => {
    const actualPort = server.address().port;
    console.log(`Server running at http://127.0.0.1:${actualPort}`);
    createWindow(actualPort);
  });
}

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });
  mainWindow.loadURL(`http://127.0.0.1:${port}`);
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  startServer();
});

app.on('window-all-closed', () => {
  if (server) server.close();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) startServer();
});