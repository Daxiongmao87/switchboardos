const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to
// communicate with the main process without exposing node or Electron
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getPath: (id) => ipcRenderer.invoke('app:get-path', id),

  // Window management
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),

  // Renderer callbacks for main → renderer communication
  on: (channel, callback) => {
    const validChannels = [
      'window:focus',
      'window:blur',
      'window:fullscreen-change',
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => callback(...args));
    }
  },
});
