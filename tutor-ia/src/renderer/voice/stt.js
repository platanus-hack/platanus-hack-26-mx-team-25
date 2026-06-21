// src/render/voice/stt.js

export class SpeechToText {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.stream = null;
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
            if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
                this.mediaRecorder.stop();
            }
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
            }

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.stream = stream;
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
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                const audioFile = new File([audioBlob], "instruccion.webm", { type: 'audio/webm' });

                console.log("Audio capturado, enviando a Groq (Whisper)...");

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
                        return;
                    }

                    if (this.stream) {
                        this.stream.getTracks().forEach(track => track.stop());
                        this.stream = null;
                    }
                    this.mediaRecorder = null;
                    this.audioChunks = [];
                    
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