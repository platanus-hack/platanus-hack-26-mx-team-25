// src/renderer/app.js
import { SpeechToText } from './voice/stt.js';

document.addEventListener('DOMContentLoaded', async () => {
    // --- ELEMENTOS DEL DOM ---
    const statusEl = document.getElementById('status');
    const avatarBox = document.getElementById('avatar-box');
    const micContainer = document.getElementById('mic-container');
    const micIcon = document.getElementById('mic-icon');
    
    const canvas = document.getElementById('pizarraCanvas');
    const ctx = canvas.getContext('2d');

    const emojisAvatar = { reposo: "😐", hablando: "🐸", pensando: "🤔", confundido: "🧐", escuchando: "👂" };

    // --- ESTADO GLOBAL ---
    const grabadora = new SpeechToText();
    let isRecording = false;

    // --- 1. ARRANQUE DEL SISTEMA ---
    try {
        // Obtenemos clave de Groq
        grabadora.apiKey = await window.electronAPI.getGroqKey();
        if(!grabadora.apiKey) console.warn("Falta clave de Groq en .env");

        // Inicializamos a Claude y la UI de bienvenida
        const inicial = await window.electronAPI.inicializarTutor();
        if (inicial.success) {
            procesarContratoInterfaz(inicial.data);
        } else {
            statusEl.textContent = "Error al iniciar: " + inicial.error;
        }
    } catch (e) {
        console.error("Fallo crítico en inicialización:", e);
    }

    // --- 2. CICLO DE CAPTURA DE VOZ (WALKIE-TALKIE) ---
    document.addEventListener('keydown', async (event) => {
        if (event.code === 'Space' && !isRecording) {
            isRecording = true;
            statusEl.textContent = "Te escucho...";
            avatarBox.textContent = emojisAvatar.escuchando;
            
            // Efectos visuales de grabación
            micContainer.style.background = "#4f46e5";
            micIcon.textContent = "🎙️";
            
            try {
                await grabadora.startRecording();
            } catch (error) {
                console.error(error);
                statusEl.textContent = "Error al iniciar micrófono.";
                isRecording = false;
            }
        }
    });

    document.addEventListener('keyup', async (event) => {
        if (event.code === 'Space' && isRecording) {
            isRecording = false;
            
            // Revertimos efectos visuales
            micContainer.style.background = "#2d2d2d";
            micIcon.textContent = "🎤";
            
            statusEl.textContent = "Transcribiendo...";
            avatarBox.textContent = emojisAvatar.pensando;
            
            try {
                // 1. OÍDO: Groq transcribe el audio
                const textoTranscrito = await grabadora.stopRecordingAndTranscribe();
                statusEl.textContent = `Tú: "${textoTranscrito}"\n\nAnalizando...`;
                
                // 2. CEREBRO: Enviamos el texto directamente al agente (Claude)
                const respuesta = await window.electronAPI.enviarMensajeAlAgente(textoTranscrito);
                
                // 3. RESPUESTA: Actualizamos UI y Pizarra
                if (respuesta.success) {
                    procesarContratoInterfaz(respuesta.data);
                } else {
                    throw new Error(respuesta.error);
                }
                
            } catch (error) {
                statusEl.textContent = "Error en la conexión. Intenta de nuevo.";
                avatarBox.textContent = emojisAvatar.confundido;
                console.error(error);
            }
        }
    });

    // --- 3. MOTOR DE RENDERIZADO VISUAL Y AUDITIVO ---
    function procesarContratoInterfaz(data) {
        console.log("Contrato recibido:", data);

        // Actualizar emoción de la rana
        if (data.avatar_estado) {
            avatarBox.textContent = emojisAvatar[data.avatar_estado] || emojisAvatar.reposo;
        }

        // Pintar en el Canvas 2D
        if (data.pasos_dibujo && Array.isArray(data.pasos_dibujo)) {
            data.pasos_dibujo.forEach(paso => {
                ctx.strokeStyle = paso.color || "#4f46e5";
                ctx.fillStyle = paso.color || "#4f46e5";
                ctx.lineWidth = 4;

                switch (paso.comando) {
                    case "limpiar":
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                        break;
                    case "linea":
                        if (paso.x == null || paso.y == null || paso.x2 == null || paso.y2 == null) break;
                        ctx.beginPath();
                        ctx.moveTo(paso.x, paso.y);
                        ctx.lineTo(paso.x2, paso.y2);
                        ctx.stroke();
                        break;
                    case "rectangulo":
                        if (paso.x == null || paso.y == null || paso.w == null || paso.h == null) break;
                        ctx.strokeRect(paso.x, paso.y, paso.w, paso.h);
                        break;
                    case "circulo":
                        if (paso.x == null || paso.y == null || paso.radio == null) break;
                        ctx.beginPath();
                        ctx.arc(paso.x, paso.y, paso.radio, 0, 2 * Math.PI);
                        ctx.stroke();
                        break;
                    case "texto":
                        if (paso.x == null || paso.y == null || !paso.contenido) break;
                        ctx.font = "bold 24px 'Segoe UI', sans-serif";
                        ctx.fillText(paso.contenido, paso.x, paso.y);
                        break;
                }
            });
        }

        // BOCA: Motor de voz Nativo (Integrado al HTML)
        if (data.texto_a_hablar) {
            statusEl.textContent = data.texto_a_hablar;
            
            window.speechSynthesis.cancel(); // Detener si estaba hablando antes
            
            const utterance = new SpeechSynthesisUtterance(data.texto_a_hablar);
            utterance.lang = 'es-MX';
            utterance.rate = 1.05; 
            
            // Sincronización del Avatar
            utterance.onstart = () => { avatarBox.textContent = emojisAvatar.hablando; };
            utterance.onend = () => { avatarBox.textContent = emojisAvatar.reposo; };
            utterance.onerror = () => { avatarBox.textContent = emojisAvatar.reposo; };
            
            window.speechSynthesis.speak(utterance);
        }
    }
});