// src/render/voice/wakeword.js

export class WakeWordDetector {
    constructor(onWakeWordDetected) {
        this.onWakeWordDetected = onWakeWordDetected;
        this.recognition = null;
        this.isListening = false;
        this.init();
    }

    init() {
        // Soporte para navegadores basados en Chromium (Electron usa esto)
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.error("Tu navegador no soporta Speech Recognition");
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'es-ES'; // Ajusta según el acento

        this.recognition.onresult = (event) => {
            let transcript = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                transcript += event.results[i][0].transcript;
            }
            
            const textoLimpio = transcript.toLowerCase().trim();
            console.log("Escuchando (pasivo):", textoLimpio);

            // La palabra mágica
            if (textoLimpio.includes("hola zenzen")) {
                console.log("¡WAKE WORD DETECTADO!");
                this.stop(); // Detenemos la escucha pasiva para liberar el micrófono
                this.onWakeWordDetected(); // Avisamos a la app que empiece a grabar en serio
            }
        };

        this.recognition.onerror = (event) => {
            console.error("Error en WakeWord:", event.error);
        };

        // Si se detiene por accidente, lo volvemos a iniciar
        this.recognition.onend = () => {
            if (this.isListening) {
                this.recognition.start();
            }
        };
    }

    start() {
        this.isListening = true;
        this.recognition.start();
        console.log("Wake Word Detector activado...");
    }

    stop() {
        this.isListening = false;
        this.recognition.stop();
    }
}