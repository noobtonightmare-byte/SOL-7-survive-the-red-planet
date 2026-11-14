const { contextBridge, ipcRenderer } = require('electron');
/* SAVE SYSTEM: tiny bridge so the game can read / write its save file in the user's app-data folder */
contextBridge.exposeInMainWorld('solSaveIO', {
  read:  () => ipcRenderer.sendSync('sol-save-read'),
  write: s  => ipcRenderer.sendSync('sol-save-write', s),
  clear: () => ipcRenderer.sendSync('sol-save-clear')
});
