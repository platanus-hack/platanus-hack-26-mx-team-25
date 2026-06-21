// src/renderer/vision/HandTracker.js
import { Hands } from '@mediapipe/hands'
import { Camera } from '@mediapipe/camera_utils'

export class HandTracker {
    constructor(videoElement, debugCanvasElement, callbacks) {
        this.videoElement = videoElement;
        this.debugCanvas = debugCanvasElement; 
        this.debugCtx = this.debugCanvas ? this.debugCanvas.getContext('2d') : null;
        
        this.onHandRaised = callbacks.onHandRaised; 
        this.onHandLowered = callbacks.onHandLowered; 
        this.onFingerMove = callbacks.onFingerMove; 
        
        this.isHandRaised = false;
        
        this.hands = new Hands({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
            }
        });

        this.hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 1,
            minDetectionConfidence: 0.7,
            minTrackingConfidence: 0.7
        });

        this.hands.onResults(this.onResults.bind(this));
    }

    async init() {
        // Candado anti-colapsos (Evita el Promise Flooding)
        let isProcessingFrame = false;

        this.camera = new Camera(this.videoElement, {
            onFrame: async () => {
                if (isProcessingFrame) return; // Desechar fotograma si la IA sigue ocupada
                
                isProcessingFrame = true;
                try {
                    await this.hands.send({ image: this.videoElement });
                } catch (e) {
                    console.error("Error en el motor de visión:", e);
                } finally {
                    isProcessingFrame = false; 
                }
            },
            width: 640,
            height: 480
        });
        await this.camera.start();
        console.log("Motor de Visión Inicializado (Anti-lag activado)");
    }

    onResults(results) {
        // 1. DIBUJO SEGURO PARA EL MODO DEBUG (Sin librerías externas)
        if (this.debugCtx && this.debugCanvas) {
            this.debugCtx.save();
            this.debugCtx.clearRect(0, 0, this.debugCanvas.width, this.debugCanvas.height);

            // Efecto espejo
            this.debugCtx.translate(this.debugCanvas.width, 0);
            this.debugCtx.scale(-1, 1);
            
            // Dibujar la cámara
            this.debugCtx.drawImage(results.image, 0, 0, this.debugCanvas.width, this.debugCanvas.height);

            // Dibujar un punto verde brillante directo en el dedo índice
            if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
                const indexTip = results.multiHandLandmarks[0][8];
                const xPixel = indexTip.x * this.debugCanvas.width;
                const yPixel = indexTip.y * this.debugCanvas.height;

                this.debugCtx.fillStyle = '#10B981'; // Verde esmeralda
                this.debugCtx.beginPath();
                this.debugCtx.arc(xPixel, yPixel, 6, 0, 2 * Math.PI);
                this.debugCtx.fill();
                
                // Borde blanco para que resalte
                this.debugCtx.strokeStyle = '#FFFFFF';
                this.debugCtx.lineWidth = 2;
                this.debugCtx.stroke();
            }
            this.debugCtx.restore();
        }

        // 2. LÓGICA DE INTERACCIÓN (Palma abierta)
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const landmarks = results.multiHandLandmarks[0];
            
            // Extraemos las puntas y los nudillos (MCP) de los 4 dedos
            const indexTip = landmarks[8], indexMcp = landmarks[5];
            const middleTip = landmarks[12], middleMcp = landmarks[9];
            const ringTip = landmarks[16], ringMcp = landmarks[13];
            const pinkyTip = landmarks[20], pinkyMcp = landmarks[17];

            if (this.onFingerMove) {
                this.onFingerMove(1 - indexTip.x, indexTip.y); 
            }

            // En MediaPipe, "Y=0" es arriba. Si la punta tiene menor Y que el nudillo, el dedo está extendido.
            const palmaAbierta = 
                (indexTip.y < indexMcp.y) && 
                (middleTip.y < middleMcp.y) && 
                (ringTip.y < ringMcp.y) && 
                (pinkyTip.y < pinkyMcp.y);

            if (palmaAbierta && !this.isHandRaised) {
                this.isHandRaised = true;
                if (this.onHandRaised) this.onHandRaised();
            } else if (!palmaAbierta && this.isHandRaised) {
                this.isHandRaised = false;
                if (this.onHandLowered) this.onHandLowered();
            }
        } else {
            if (this.isHandRaised) {
                this.isHandRaised = false;
                if (this.onHandLowered) this.onHandLowered();
            }
        }
    }
}