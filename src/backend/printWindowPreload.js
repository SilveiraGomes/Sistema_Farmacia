'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('printApi', {
  listPrinters: () => ipcRenderer.invoke('print:window:listPrinters'),
  print: (opts) => ipcRenderer.invoke('print:window:print', opts),
  exportPdf: (opts) => ipcRenderer.invoke('print:window:exportPdf', opts),
  close: () => ipcRenderer.invoke('print:window:close'),
});
