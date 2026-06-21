const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  inicializarTutor: () => ipcRenderer.invoke('inicializar-tutor'),
  enviarMensajeAlAgente: (prompt) => ipcRenderer.invoke('chat-with-agent', prompt),
  getGroqKey: () => ipcRenderer.invoke('get-groq-key'),
});