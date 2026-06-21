// src/renderer/voice/tts.js
export class TextToSpeech {
    constructor() {
        this.synth = window.speechSynthesis;
    }

    async init() {
        // No necesitamos inicializar claves aquí, pero mantenemos la función para no romper app.js
        console.log("Motor TTS Nativo inicializado (Sin costo)");
    }

    async speak(text) {
        return new Promise((resolve, reject) => {
            if (this.synth.speaking) {
                console.error('El tutor ya está hablando.');
                reject('TTS ocupado');
                return;
            }

            const utterance = new SpeechSynthesisUtterance(text);
            
            // Buscar una voz en español si está disponible
            const voices = this.synth.getVoices();
            const spanishVoice = voices.find(voice => voice.lang.includes('es'));
            if (spanishVoice) {
                utterance.voice = spanishVoice;
            }

            utterance.rate = 1.0; // Velocidad normal
            utterance.pitch = 1.0; 

            utterance.onend = () => {
                resolve(); // Resolvemos la promesa cuando termina de hablar
            };

            utterance.onerror = (error) => {
                console.error("Error en TTS Nativo:", error);
                reject(error);
            };

            this.synth.speak(utterance);
        });
    }
}