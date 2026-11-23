const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  pickFile: () => ipcRenderer.invoke('pick-file'),
  readFile: (path) => ipcRenderer.invoke('read-file', path),
  onOpenFile: (cb) => {
    ipcRenderer.removeAllListeners('open-file');
    ipcRenderer.on('open-file', (evt, payload) => cb(payload));
  },
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  }
});
