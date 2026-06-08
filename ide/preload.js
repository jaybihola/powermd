'use strict';

// Secure bridge between the renderer and the main process. The renderer never
// touches Node/fs directly — it calls window.pmd.* which forwards over IPC.
const { contextBridge, ipcRenderer } = require('electron');

const MENU_CHANNELS = ['menu:open', 'menu:new', 'menu:save', 'menu:view'];

contextBridge.exposeInMainWorld('pmd', {
  platform: process.platform,
  getWorkspace: () => ipcRenderer.invoke('ws:get'),
  attachFolder: () => ipcRenderer.invoke('ws:attach'),
  detachFolder: (root) => ipcRenderer.invoke('ws:detach', root),
  tree: () => ipcRenderer.invoke('fs:tree'),
  read: (p) => ipcRenderer.invoke('fs:read', p),
  save: (p, content) => ipcRenderer.invoke('fs:save', { path: p, content }),
  mkdir: (p) => ipcRenderer.invoke('fs:mkdir', p),
  rename: (from, to) => ipcRenderer.invoke('fs:rename', { from, to }),
  del: (p) => ipcRenderer.invoke('fs:delete', p),
  reveal: (p) => ipcRenderer.invoke('shell:reveal', p),
  on: (channel, cb) => {
    if (MENU_CHANNELS.indexOf(channel) === -1) return;
    ipcRenderer.on(channel, (e, ...args) => cb(...args));
  }
});
