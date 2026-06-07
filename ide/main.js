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
let workspace = null; // absolute path of the open folder

/* ---- workspace helpers ---- */
function safe(rel) {
  if (!workspace) return null;
  const abs = path.resolve(workspace, '.' + path.sep + (rel || ''));
  return (abs === workspace || abs.indexOf(workspace + path.sep) === 0) ? abs : null;
}

function walk(dir) {
  let out = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (const e of entries) {
    if (e.name.charAt(0) === '.' || e.name === 'node_modules') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      const children = walk(full);
      if (children.length) out.push({ type: 'dir', name: e.name, path: path.relative(workspace, full), children });
    } else if (EDITABLE.test(e.name)) {
      out.push({ type: 'file', name: e.name, path: path.relative(workspace, full) });
    }
  }
  out.sort((a, b) => (a.type !== b.type ? (a.type === 'dir' ? -1 : 1) : a.name.localeCompare(b.name)));
  return out;
}

function workspacePayload() {
  return workspace ? { root: workspace, name: path.basename(workspace), tree: walk(workspace) } : null;
}

async function chooseFolder() {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths[0]) return null;
  workspace = r.filePaths[0];
  return workspacePayload();
}

/* ---- IPC ---- */
ipcMain.handle('ws:get', () => workspacePayload());
ipcMain.handle('ws:open', () => chooseFolder());
ipcMain.handle('fs:tree', () => (workspace ? walk(workspace) : []));
ipcMain.handle('fs:read', (e, rel) => {
  const abs = safe(rel);
  if (!abs || !fs.existsSync(abs)) return null;
  return { path: rel, content: fs.readFileSync(abs, 'utf8') };
});
ipcMain.handle('fs:save', (e, { path: rel, content }) => {
  const abs = safe(rel);
  if (!abs || !EDITABLE.test(abs)) return { ok: false, error: 'Invalid path' };
  try {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content == null ? '' : content);
    return { ok: true, path: path.relative(workspace, abs) };
  } catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('fs:rename', (e, { from, to }) => {
  const a = safe(from), b = safe(to);
  if (!a || !b || !EDITABLE.test(b)) return { ok: false, error: 'Invalid path' };
  if (fs.existsSync(b)) return { ok: false, error: 'A file with that name already exists' };
  try {
    fs.mkdirSync(path.dirname(b), { recursive: true });
    fs.renameSync(a, b);
    return { ok: true, path: path.relative(workspace, b) };
  } catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('fs:delete', async (e, rel) => {
  const abs = safe(rel);
  if (!abs) return { ok: false, error: 'Invalid path' };
  try { await shell.trashItem(abs); return { ok: true }; }   // moves to Trash, not permanent
  catch (err) { return { ok: false, error: err.message }; }
});

/* ---- menu ---- */
function buildMenu() {
  const send = (channel) => () => { if (win) win.webContents.send(channel); };
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Open Folder…', accelerator: 'CmdOrCtrl+O', click: send('menu:open') },
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
  // optional: open a folder passed on the command line
  const arg = process.argv.slice(2).find((a) => a && a.charAt(0) !== '-');
  if (arg) { try { if (fs.statSync(arg).isDirectory()) workspace = path.resolve(arg); } catch (e) {} }
  buildMenu();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
