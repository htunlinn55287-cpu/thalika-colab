const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("thalikaDesktop", {
  platform: process.platform,
  isElectron: true,
  openStorageFolder: (folderId) => ipcRenderer.invoke("thalika:open-storage-folder", folderId),
});
