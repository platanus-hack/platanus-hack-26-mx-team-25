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
    let panZoomInstance = null; // Rastreador global de la cámara

    // --- CONFIGURACIÓN DE MERMAID (DIAGRAMAS) ---
    mermaid.initialize({ 
        startOnLoad: false, 
        theme: 'dark',
        securityLevel: 'loose',
        flowchart: { htmlLabels: true } // 🚨 ESTO ES VITAL PARA QUE NO FALLE CON <br/>
    });

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
            window.speechSynthesis.cancel();
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
    async function procesarContratoInterfaz(data) {
    console.log("Contrato recibido:", data);

    const canvas = document.getElementById('pizarraCanvas');
    const mermaidContainer = document.getElementById('mermaidContainer');
    const codeContainer = document.getElementById('codeContainer'); // NUEVO
    const codeBlock = document.getElementById('codeBlock');         // NUEVO

    // 1. Manejo del estado emocional del Avatar
    if (data.avatar_estado) {
        avatarBox.textContent = emojisAvatar[data.avatar_estado] || emojisAvatar.reposo;
    }

    // 2. CONMUTACIÓN DINÁMICA DE PIZARRAS (Prioridad Mermaid)
    if (data.bloque_codigo) {
        // 🚀 MODO EDITOR DE CÓDIGO
        canvas.style.display = 'none';
        mermaidContainer.style.display = 'none';
        codeContainer.style.display = 'block';

        // Actualizamos la clase para el lenguaje (ej: language-python)
        codeBlock.className = `language-${data.bloque_codigo.lenguaje}`;
        // Insertamos el código
        codeBlock.textContent = data.bloque_codigo.codigo;
        
        // Le pedimos a Prism que aplique los colores mágicos
        window.Prism.highlightElement(codeBlock);

    } else if (data.codigo_mermaid && data.codigo_mermaid.trim() !== "") {
        // 📊 MODO MERMAID
        canvas.style.display = 'none';
        codeContainer.style.display = 'none';
        mermaidContainer.style.display = 'block';

        // 🚨 1. Destruimos la cámara vieja para liberar memoria y evitar colapsos
        if (panZoomInstance) {
            panZoomInstance.destroy();
            panZoomInstance = null;
        }

        // 🚨 2. Filtro sanitario definitivo
        let codigoLimpio = data.codigo_mermaid
            .replace(/```mermaid\n?/gi, '') 
            .replace(/```\n?/g, '')         
            .replace(/\\n/g, '\n')          
            .replace(/\\"/g, '"')           // Limpiamos comillas doble-escapadas
            .replace(/[">]+$/, '')
            .trim();

        const uniqueId = 'mermaid-' + Date.now();
        mermaidContainer.innerHTML = `<div class="mermaid" id="${uniqueId}" style="width: 100%; height: 100%;">${codigoLimpio}</div>`;

        try {
            await mermaid.run({ nodes: [document.getElementById(uniqueId)] });

            const svgElement = document.querySelector(`#${uniqueId} svg`);
            if (svgElement) {
                svgElement.removeAttribute('style');
                svgElement.setAttribute('width', '100%');
                svgElement.setAttribute('height', '100%');

                // 🚨 3. Asignamos la nueva cámara a la variable global
                panZoomInstance = svgPanZoom(svgElement, {
                    zoomEnabled: true,
                    controlIconsEnabled: true,
                    fit: false,
                    center: true,
                    minZoom: 0.5, 
                    maxZoom: 10,
                });
                
                panZoomInstance.zoom(0.85); 

                // (Tu código del setTimeout con la Cámara Inteligente se queda igual, 
                // solo asegúrate de usar 'panZoomInstance' en lugar de 'panZoom')
                setTimeout(() => {
                    const nodoActivo = svgElement.querySelector('.highlight');
                    if (nodoActivo) {
                        panZoomInstance.zoom(1.2);
                        // ... resto del cálculo de coordenadas ...
                    }
                }, 50);
            }
        } catch (err) {
            console.error("Error al renderizar sintaxis Mermaid:", err);
            mermaidContainer.innerHTML = `<p style="color: #ef4444; padding: 20px;">⚠️ Error de sintaxis en el diagrama del Tutor.</p>`;
        }

    } else if (data.pasos_dibujo && Array.isArray(data.pasos_dibujo)) {
        // Intercambiamos visibilidad en el DOM regresando al Canvas 2D
        mermaidContainer.style.display = 'none';
        canvas.style.display = 'block';
        codeContainer.style.display = 'none';

        // Tu motor clásico de trazo por coordenadas se ejecuta de forma segura
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

    // 3. Manejo de la salida de audio (TTS Nativo)
    if (data.texto_a_hablar) {
        statusEl.textContent = data.texto_a_hablar;
        window.speechSynthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance(data.texto_a_hablar);
        utterance.lang = 'es-MX';
        utterance.rate = 1.05; 
        
        utterance.onstart = () => { avatarBox.textContent = emojisAvatar.hablando; };
        utterance.onend = () => { avatarBox.textContent = emojisAvatar.reposo; };
        utterance.onerror = () => { avatarBox.textContent = emojisAvatar.reposo; };
        
        window.speechSynthesis.speak(utterance);
    }
}
});