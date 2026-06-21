// src/renderer/voice/tts.js
export class TextToSpeech {
    constructor() {
        this.apiKey = null; 
        this.voiceId = "jw1XYij1FCiI9FENSxIf"; // El ID no es sensible, puede ir directo
        this.currentAudio = null; 
    }

    async init() {
        // Pedimos la API Key a través del bridge de Electron
        this.apiKey = await window.electronAPI.getElevenLabsKey();
        
        if (!this.apiKey) {
            console.warn("Advertencia: No se recibió la API Key de ElevenLabs desde el main process.");
        }
        console.log(`Motor TTS ElevenLabs inicializado. Voice ID: ${this.voiceId}`);
    }

    async speak(text) {
        return new Promise(async (resolve, reject) => {
            if (this.currentAudio && !this.currentAudio.paused && !this.currentAudio.ended) {
                reject('TTS ocupado');
                return;
            }

            try {
                // Agregamos /stream y el parámetro optimize_streaming_latency=3
                const apiUrl = `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}/stream?optimize_streaming_latency=3`;
                
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Accept': 'audio/mpeg',
                        'xi-api-key': this.apiKey,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        text: text,
                        model_id: "eleven_multilingual_v2", 
                        voice_settings: {
                            stability: 0.5,
                            similarity_boost: 0.75,
                            use_speaker_boost: true
                        }
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(`Error de ElevenLabs: ${errorData.detail?.message || response.statusText}`);
                }

                const audioBlob = await response.blob();
                const audioUrl = URL.createObjectURL(audioBlob);
                
                this.currentAudio = new Audio(audioUrl);

                this.currentAudio.onended = () => {
                    URL.revokeObjectURL(audioUrl); 
                    resolve(); 
                };

                this.currentAudio.onerror = (error) => {
                    URL.revokeObjectURL(audioUrl);
                    reject(error);
                };

                await this.currentAudio.play();

            } catch (error) {
                console.error("Error en TTS ElevenLabs:", error);
                reject(error);
            }
        });
    }
}