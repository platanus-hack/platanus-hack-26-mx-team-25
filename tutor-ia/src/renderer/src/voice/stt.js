// src/render/voice/stt.js

export class SpeechToText {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.apiKey = null; // Empezamos sin clave
    }

    async init() {
        // Pedimos la clave segura al backend usando la API que expusimos en preload.js
        try {
            this.apiKey = await window.electronAPI.getGroqKey();
            if (!this.apiKey) {
                console.error("No se encontró la API Key de Groq en el backend.");
            }
        } catch (error) {
            console.error("Error al cargar la API Key:", error);
        }
    }

    async startRecording() {
        // Asegurarnos de tener la clave antes de grabar
        if (!this.apiKey) {
            await this.init(); 
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(stream);
            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.start();
            console.log("Grabando instrucción de alta calidad...");
        } catch (error) {
            console.error("Error al acceder al micrófono:", error);
        }
    }

    async stopRecordingAndTranscribe() {
        return new Promise((resolve, reject) => {
            if (!this.mediaRecorder || this.mediaRecorder.state === "inactive") {
                reject("No hay grabación activa");
                return;
            }

            this.mediaRecorder.onstop = async () => {
                // Liberamos el micrófono cuanto antes.
                this.mediaRecorder.stream.getTracks().forEach(track => track.stop());

                // Empaquetar el audio. IMPORTANTE: en Electron, subir directamente
                // un Blob de MediaRecorder por fetch/FormData falla con
                // net::ERR_FAILED (-2) porque Chromium no puede leer su tamaño.
                // Lo materializamos en memoria (ArrayBuffer) para evitarlo.
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });

                if (audioBlob.size === 0) {
                    reject("No se capturó audio. Intenta de nuevo.");
                    return;
                }

                const buffer = await audioBlob.arrayBuffer();
                const audioFile = new File([buffer], "instruccion.webm", { type: 'audio/webm' });

                console.log(`Audio capturado (${audioFile.size} bytes), enviando a Groq (Whisper)...`);

                try {
                    const formData = new FormData();
                    formData.append("file", audioFile);
                    formData.append("model", "whisper-large-v3-turbo");
                    formData.append("language", "es");

                    console.log("Enviando a Groq...");

                    const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
                        method: "POST",
                        headers: {
                            "Authorization": `Bearer ${this.apiKey}`
                        },
                        body: formData
                    });

                    const data = await response.json();
                    
                    if (!response.ok) {
                        console.error("Respuesta fallida de Groq:", data);
                        reject(`Error API Groq: ${data.error?.message || response.status}`);
                        return; // Rompemos la ejecución aquí
                    }

                    resolve(data.text);
                } catch (error) {
                    console.error("Error crítico de red o de código:", error);
                    reject(error);
                }
            };

            this.mediaRecorder.stop();
        });
    }
}