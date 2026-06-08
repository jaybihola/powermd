'use strict';

/*
 * powermd ide — Electron main process.
 *
 * Owns the window, the native menu, and all filesystem access. The renderer
 * (app.html/app.js) talks to it over a small IPC bridge exposed in preload.js.
 * Markdown rendering happens in the renderer using the shared powermd engine.
 */

const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const EDITABLE = /\.(md|markdown|mdown|txt)$/i;
let win = null;
let roots = []; // absolute paths of attached folders (multi-root workspace)

/* ---- workspace helpers (all client paths are ABSOLUTE) ---- */
function underRoot(abs) {
  return roots.some(function (r) { return abs === r || abs.indexOf(r + path.sep) === 0; });
}
function safe(abs) {
  if (!abs) return null;
  const resolved = path.resolve(abs);
  return underRoot(resolved) ? resolved : null;
}

function walk(dir) {
  let out = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (const e of entries) {
    if (e.name.charAt(0) === '.' || e.name === 'node_modules') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push({ type: 'dir', name: e.name, path: full, children: walk(full) });
    else if (EDITABLE.test(e.name)) out.push({ type: 'file', name: e.name, path: full });
  }
  out.sort((a, b) => (a.type !== b.type ? (a.type === 'dir' ? -1 : 1) : a.name.localeCompare(b.name)));
  return out;
}
function rootsPayload() {
  return roots.map(function (r) { return { root: r, name: path.basename(r) || r, tree: walk(r) }; });
}

async function attachFolders() {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'multiSelections', 'createDirectory'] });
  if (r.canceled) return rootsPayload();
  r.filePaths.forEach(function (p) { const abs = path.resolve(p); if (roots.indexOf(abs) === -1) roots.push(abs); });
  return rootsPayload();
}

/* ---- IPC ---- */
ipcMain.handle('ws:get', () => rootsPayload());
ipcMain.handle('ws:attach', () => attachFolders());
ipcMain.handle('ws:detach', (e, root) => { roots = roots.filter(function (r) { return r !== root; }); return rootsPayload(); });
ipcMain.handle('fs:tree', () => rootsPayload());
ipcMain.handle('fs:read', (e, abs) => {
  const p = safe(abs);
  if (!p || !fs.existsSync(p)) return null;
  return { path: p, content: fs.readFileSync(p, 'utf8') };
});
ipcMain.handle('fs:save', (e, { path: abs, content }) => {
  const p = safe(abs);
  if (!p || !EDITABLE.test(p)) return { ok: false, error: 'Invalid path' };
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content == null ? '' : content);
    return { ok: true, path: p };
  } catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('fs:mkdir', (e, abs) => {
  const p = safe(abs);
  if (!p) return { ok: false, error: 'Path outside workspace' };
  if (fs.existsSync(p)) return { ok: false, error: 'Already exists' };
  try { fs.mkdirSync(p, { recursive: true }); return { ok: true, path: p }; }
  catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('fs:rename', (e, { from, to }) => {
  const a = safe(from), b = safe(to);
  if (!a || !b) return { ok: false, error: 'Invalid path' };
  if (fs.existsSync(b)) return { ok: false, error: 'A file or folder with that name already exists' };
  try {
    fs.mkdirSync(path.dirname(b), { recursive: true });
    fs.renameSync(a, b);
    return { ok: true, path: b };
  } catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('fs:delete', async (e, abs) => {
  const p = safe(abs);
  if (!p) return { ok: false, error: 'Invalid path' };
  try { await shell.trashItem(p); return { ok: true }; }   // moves to Trash, not permanent
  catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('shell:reveal', (e, abs) => { const p = safe(abs); if (p) shell.showItemInFolder(p); });

/* ---- menu ---- */
function buildMenu() {
  const send = (channel) => () => { if (win) win.webContents.send(channel); };
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Attach Folder…', accelerator: 'CmdOrCtrl+O', click: send('menu:open') },
        { label: 'New File…', accelerator: 'CmdOrCtrl+N', click: send('menu:new') },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: send('menu:save') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { label: 'Editor', accelerator: 'CmdOrCtrl+1', click: () => win && win.webContents.send('menu:view', 'editor') },
        { label: 'Split', accelerator: 'CmdOrCtrl+2', click: () => win && win.webContents.send('menu:view', 'split') },
        { label: 'Preview', accelerator: 'CmdOrCtrl+3', click: () => win && win.webContents.send('menu:view', 'preview') },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ---- window ---- */
function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 720,
    minHeight: 480,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  win.loadFile(path.join(__dirname, 'app.html'));
  win.on('closed', () => { win = null; });
}

app.whenReady().then(() => {
  // optional: attach folders passed on the command line
  process.argv.slice(2).filter((a) => a && a.charAt(0) !== '-').forEach((a) => {
    try { if (fs.statSync(a).isDirectory()) { const abs = path.resolve(a); if (roots.indexOf(abs) === -1) roots.push(abs); } } catch (e) {}
  });
  buildMenu();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
