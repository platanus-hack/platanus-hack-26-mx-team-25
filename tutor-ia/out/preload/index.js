"use strict";
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("electronAPI", {
  inicializarTutor: () => ipcRenderer.invoke("inicializar-tutor"),
  enviarMensajeAlAgente: (prompt) => ipcRenderer.invoke("chat-with-agent", prompt),
  getGroqKey: () => ipcRenderer.invoke("get-groq-key"),
  getElevenLabsKey: () => ipcRenderer.invoke("get-elevenlabs-key"),
  // Wake word: muestra/enfoca la ventana (estaba oculta en segundo plano).
  mostrarApp: () => ipcRenderer.invoke("mostrar-app"),
  // Respaldo: el proceso principal pide arrancar la sesión (atajo global).
  onActivarSesion: (callback) => ipcRenderer.on("activar-sesion", () => callback())
});
