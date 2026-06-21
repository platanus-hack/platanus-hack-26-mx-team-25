// src/renderer/src/voice/wakeword.js
//
// WAKE WORD OFFLINE Y LOCAL con Vosk (WebAssembly).
// Reemplaza a webkitSpeechRecognition, que NO funciona en Electron
// (intenta transmitir audio a Google y falla con net::ERR_FAILED -2).
//
// Vosk corre 100% en local, sin internet y sin costo por uso. Escuchamos
// continuamente hasta oír la palabra de activación "Hola rana".

import { createModel } from "vosk-browser";

// El modelo se sirve desde public/models. Usamos URL ABSOLUTA porque el
// reconocedor corre dentro de un Web Worker (blob:) y una ruta relativa no
// resolvería contra la página.
const MODEL_URL = new URL(
  "models/vosk-model-small-es.tar.gz",
  window.location.href,
).href;

// Vosk trabaja a 16 kHz; acceptWaveform re-muestrea el audio del micro a esto.
const MODEL_SAMPLE_RATE = 16000;

// Palabra de activación: "Hola rana". Son palabras comunes del español que
// Vosk reconoce muy bien, así que casi no hay falsos positivos ni fallos.
// Aceptamos "hola rana" y también "rana" sola por si no capta el "hola".
// (Calibra esta lista con lo que veas en consola en "WakeWord escuchó:".)
const DISPARADORES = [
  /\b[ho]?ola\b.{0,6}\branas?\b/, // "hola rana" / "ola rana"
  /\branas?\b/, // "rana" sola
];

export class WakeWordDetector {
  /** @param {() => void} onWakeWordDetected */
  constructor(onWakeWordDetected) {
    this.onWakeWordDetected = onWakeWordDetected;
    this.onStatus = null; // callback opcional para mostrar estado en la UI

    this.model = null;
    this.recognizer = null;
    this.audioContext = null;
    this.recognizerNode = null;
    this.source = null;
    this.mediaStream = null;
    this.isListening = false;
    this.disparado = false;
  }

  _status(msg) {
    console.log("[WakeWord]", msg);
    this.onStatus?.(msg);
  }

  _evaluar(texto) {
    if (!texto) return;
    const t = texto.toLowerCase().trim();
    if (!t) return;
    console.log("[WakeWord] escuchó:", t);

    if (!this.disparado && DISPARADORES.some((re) => re.test(t))) {
      this.disparado = true;
      this._status('¡"Hola rana" detectado!');
      this.stop();
      this.onWakeWordDetected();
    }
  }

  async start() {
    if (this.isListening) return;
    try {
      this._status("Cargando modelo de voz offline (~39MB)...");
      this.model = await createModel(MODEL_URL);

      this.recognizer = new this.model.KaldiRecognizer(MODEL_SAMPLE_RATE);
      this.recognizer.setWords(false);
      this.recognizer.on("result", (m) => this._evaluar(m?.result?.text));
      this.recognizer.on("partialresult", (m) =>
        this._evaluar(m?.result?.partial),
      );

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
          sampleRate: MODEL_SAMPLE_RATE,
        },
      });

      this.audioContext = new AudioContext();
      // La ventana arranca oculta y sin gesto del usuario: forzamos el arranque
      // del contexto de audio (ver autoplay-policy en el proceso principal).
      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }

      this.recognizerNode = this.audioContext.createScriptProcessor(4096, 1, 1);
      this.recognizerNode.onaudioprocess = (event) => {
        try {
          this.recognizer.acceptWaveform(event.inputBuffer);
        } catch (e) {
          console.error("[WakeWord] acceptWaveform falló:", e);
        }
      };

      this.source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.source.connect(this.recognizerNode);
      // Conectamos a la salida para que onaudioprocess se dispare. No escribimos
      // el buffer de salida, así que no hay eco del micrófono.
      this.recognizerNode.connect(this.audioContext.destination);

      this.isListening = true;
      this._status('Escuchando "Hola rana"... (offline, local)');
    } catch (err) {
      console.error("[WakeWord] Error al iniciar Vosk:", err);
      this._status("Error al iniciar el wake word: " + (err?.message || err));
    }
  }

  stop() {
    this.isListening = false;
    try {
      if (this.recognizerNode) {
        this.recognizerNode.onaudioprocess = null;
        this.recognizerNode.disconnect();
      }
      if (this.source) this.source.disconnect();
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach((t) => t.stop());
      }
      if (this.audioContext && this.audioContext.state !== "closed") {
        this.audioContext.close();
      }
      if (this.recognizer) this.recognizer.remove();
      if (this.model) this.model.terminate();
    } catch (e) {
      console.error("[WakeWord] Error al detener:", e);
    }
    this.model = null;
    this.recognizer = null;
    this.audioContext = null;
    this.recognizerNode = null;
    this.source = null;
    this.mediaStream = null;
  }
}
