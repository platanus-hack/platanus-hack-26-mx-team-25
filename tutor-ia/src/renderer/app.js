// src/renderer/app.js
import { SpeechToText } from './voice/stt.js';

document.addEventListener('DOMContentLoaded', async () => {
    // --- ELEMENTOS DEL DOM ---
    const statusEl = document.getElementById('status');
    const avatarImg = document.getElementById('avatar-img');
    const micContainer = document.getElementById('mic-container');
    const micIcon = document.getElementById('mic-icon');
    const pizarraContainer = document.getElementById('pizarra-container');

    const canvas = document.getElementById('pizarraCanvas');
    const ctx = canvas ? canvas.getContext('2d') : null;

    const ANIMATION_BASE_PATH = './assets/animation';

    // Mapeo: estado del agente (español) -> carpeta real de animación en disco.
    // Ajusta aquí si quieres cambiar qué animación representa cada estado.
    const ESTADO_A_CARPETA = {
        reposo: 'IDLE',
        hablando: 'happy',
        pensando: 'thinking',
        confundido: 'angry',
        escuchando: 'IDLE',
    };

    // --- VALIDACIÓN DEFENSIVA DEL DOM ---
    const elementosRequeridos = {
        'status': statusEl,
        'avatar-img': avatarImg,
        'mic-container': micContainer,
        'mic-icon': micIcon,
        'pizarra-container': pizarraContainer,
        'pizarraCanvas': canvas,
    };
    for (const [id, el] of Object.entries(elementosRequeridos)) {
        if (!el) console.error(`⚠️ No se encontró el elemento con id="${id}" en el HTML. Revisa que exista.`);
    }

    // Helper seguro para setear texto sin romper si el elemento no existe
    function setText(el, text) {
        if (el) el.textContent = text;
    }

    // --- MANIFEST DE ANIMACIONES (generado por scripts/generate-zenzen-manifest.js) ---
    let zenzenManifest = {};
    try {
        const res = await fetch(`${ANIMATION_BASE_PATH}/manifest.json`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        zenzenManifest = await res.json();
        console.log('✅ Manifest de animaciones cargado:', Object.keys(zenzenManifest));
    } catch (err) {
        console.error('⚠️ No se pudo cargar manifest.json de animaciones. ¿Corriste "npm run build:manifest"?', err);
    }

    // --- REPRODUCTOR DE FRAMES PARA EL AVATAR ---
    let animationTimeoutId = null;
    let currentEstado = null;
    let currentFrameIndex = 0;

    function detenerAnimacionAvatar() {
        if (animationTimeoutId) {
            clearTimeout(animationTimeoutId);
            animationTimeoutId = null;
        }
    }

    function setAvatarEstado(estado, { onComplete } = {}) {
        if (!avatarImg) return;

        const carpeta = ESTADO_A_CARPETA[estado];
        const def = carpeta ? zenzenManifest[carpeta] : null;

        if (!def || !def.files || def.files.length === 0) {
            console.warn(`⚠️ Sin frames para el estado "${estado}" (carpeta "${carpeta}"). Verifica el manifest.`);
            return;
        }

        detenerAnimacionAvatar();
        currentEstado = estado;
        currentFrameIndex = 0;

        const frameDurationMs = 1000 / (def.fps || 12);

        function mostrarFrame() {
            if (currentEstado !== estado) return; // otra animación tomó el control mientras tanto

            const archivo = def.files[currentFrameIndex];
            avatarImg.src = `${ANIMATION_BASE_PATH}/${carpeta}/${archivo}`;

            currentFrameIndex++;

            if (currentFrameIndex >= def.files.length) {
                if (def.loop) {
                    currentFrameIndex = 0;
                    animationTimeoutId = setTimeout(mostrarFrame, frameDurationMs);
                } else {
                    onComplete?.();
                }
            } else {
                animationTimeoutId = setTimeout(mostrarFrame, frameDurationMs);
            }
        }

        mostrarFrame();
    }

    // --- ESTADO GLOBAL ---
    const grabadora = new SpeechToText();
    let isRecording = false;

    // Estado de la secuencia (texto + dibujo sincronizados, "paso a paso" como un maestro)
    let secuenciaActual = [];
    let pasoActualIndex = 0;
    let animFrameId = null;

    // --- AVATAR FLOTANTE ---
    // ZenZen cambia de posición periódicamente dentro del área de la pizarra.
    let flotarIntervalId = null;

    function flotarAvatarAleatoriamente() {
        if (!avatarImg || !pizarraContainer) return;

        const margen = 24;
        const anchoAvatar = avatarImg.offsetWidth || 110;
        const altoAvatar = avatarImg.offsetHeight || 110;

        const maxLeft = Math.max(pizarraContainer.clientWidth - anchoAvatar - margen, margen);
        const maxTop = Math.max(pizarraContainer.clientHeight - altoAvatar - margen, margen);

        const nuevoLeft = margen + Math.random() * (maxLeft - margen);
        const nuevoTop = margen + Math.random() * (maxTop - margen);

        avatarImg.style.left = `${nuevoLeft}px`;
        avatarImg.style.top = `${nuevoTop}px`;
    }

    function iniciarFlotacion(intervaloMs = 6000) {
        detenerFlotacion();
        flotarAvatarAleatoriamente();
        flotarIntervalId = setInterval(flotarAvatarAleatoriamente, intervaloMs);
    }

    function detenerFlotacion() {
        if (flotarIntervalId) {
            clearInterval(flotarIntervalId);
            flotarIntervalId = null;
        }
    }

    // --- 1. ARRANQUE DEL SISTEMA ---
    setAvatarEstado('reposo'); // primer frame visible apenas carga, antes de cualquier respuesta del agente

    try {
        grabadora.apiKey = await window.electronAPI.getGroqKey();
        if (!grabadora.apiKey) console.warn("Falta clave de Groq en .env");

        const inicial = await window.electronAPI.inicializarTutor();
        if (inicial.success) {
            procesarContratoInterfaz(inicial.data);
        } else {
            setText(statusEl, "Error al iniciar: " + inicial.error);
        }
    } catch (e) {
        console.error("Fallo crítico en inicialización:", e);
    }

    iniciarFlotacion();

    // --- 2. CICLO DE CAPTURA DE VOZ (WALKIE-TALKIE) ---
    document.addEventListener('keydown', async (event) => {
        if (event.code === 'Space' && !isRecording) {
            isRecording = true;
            setText(statusEl, "Te escucho...");
            setAvatarEstado('escuchando');

            if (micContainer) micContainer.style.background = "#4f46e5";
            setText(micIcon, "🎙️");

            try {
                await grabadora.startRecording();
            } catch (error) {
                console.error(error);
                setText(statusEl, "Error al iniciar micrófono.");
                isRecording = false;
            }
        }
    });

    document.addEventListener('keyup', async (event) => {
        if (event.code === 'Space' && isRecording) {
            isRecording = false;

            if (micContainer) micContainer.style.background = "#2a2a2a";
            setText(micIcon, "🎤");

            setText(statusEl, "Transcribiendo...");
            setAvatarEstado('pensando');

            try {
                const textoTranscrito = await grabadora.stopRecordingAndTranscribe();
                setText(statusEl, `Tú: "${textoTranscrito}"\n\nAnalizando...`);

                const respuesta = await window.electronAPI.enviarMensajeAlAgente(textoTranscrito);

                if (respuesta.success) {
                    procesarContratoInterfaz(respuesta.data);
                } else {
                    throw new Error(respuesta.error);
                }

            } catch (error) {
                setText(statusEl, "Error en la conexión. Intenta de nuevo.");
                setAvatarEstado('confundido');
                console.error(error);
            }
        }
    });

    // --- 3. ORQUESTACIÓN: habla y dibujo del mismo paso, sincronizados ---
    function procesarContratoInterfaz(data) {
        console.log("Contrato recibido:", data);

        if (data.avatar_estado) {
            setAvatarEstado(data.avatar_estado);
        }

        window.speechSynthesis.cancel();
        if (animFrameId) cancelAnimationFrame(animFrameId);

        // Formato nuevo: { secuencia: [{ texto, avatar_estado?, dibujo }] }
        if (data.secuencia && Array.isArray(data.secuencia)) {
            secuenciaActual = data.secuencia;
            pasoActualIndex = 0;
            ejecutarSiguientePaso();
            return;
        }

        // Compatibilidad con el formato viejo: { texto_a_hablar, pasos_dibujo }
        // mientras se actualiza el prompt del agente al nuevo formato "secuencia".
        if (data.texto_a_hablar || data.pasos_dibujo) {
            console.warn('⚠️ El agente está enviando el formato viejo (texto_a_hablar/pasos_dibujo). El dibujo y la voz NO estarán sincronizados frase por frase hasta migrar el prompt al formato "secuencia".');

            if (data.texto_a_hablar) {
                setText(statusEl, data.texto_a_hablar);
                const utterance = new SpeechSynthesisUtterance(data.texto_a_hablar);
                utterance.lang = 'es-MX';
                utterance.rate = 1.05;
                utterance.onstart = () => setAvatarEstado('hablando');
                utterance.onend = () => setAvatarEstado('reposo');
                window.speechSynthesis.speak(utterance);
            }

            if (data.pasos_dibujo && Array.isArray(data.pasos_dibujo) && ctx) {
                let i = 0;
                const dibujarSiguiente = () => {
                    if (i >= data.pasos_dibujo.length) return;
                    dibujarPasoConProgreso(data.pasos_dibujo[i], 1);
                    i++;
                    setTimeout(dibujarSiguiente, 400);
                };
                dibujarSiguiente();
            }
        }
    }

    function ejecutarSiguientePaso() {
        if (pasoActualIndex >= secuenciaActual.length) {
            setAvatarEstado('reposo');
            setText(statusEl, "");
            return;
        }

        const paso = secuenciaActual[pasoActualIndex];
        setAvatarEstado(paso.avatar_estado || 'hablando');

        if (paso.texto) {
            setText(statusEl, paso.texto);

            const utterance = new SpeechSynthesisUtterance(paso.texto);
            utterance.lang = 'es-MX';
            utterance.rate = 1.05;

            const palabras = paso.texto.split(/\s+/).length;
            const duracionEstimadaMs = (palabras / 2.5) * 1000;

            utterance.onstart = () => {
                if (paso.dibujo) animarDibujo(paso.dibujo, duracionEstimadaMs);
            };

            utterance.onend = () => {
                if (paso.dibujo) {
                    if (animFrameId) cancelAnimationFrame(animFrameId);
                    dibujarPasoConProgreso(paso.dibujo, 1);
                }
                setAvatarEstado('reposo');
                pasoActualIndex++;
                ejecutarSiguientePaso();
            };

            utterance.onerror = () => {
                setAvatarEstado('reposo');
                pasoActualIndex++;
                ejecutarSiguientePaso();
            };

            window.speechSynthesis.speak(utterance);

        } else if (paso.dibujo) {
            animarDibujo(paso.dibujo, 600, () => {
                pasoActualIndex++;
                ejecutarSiguientePaso();
            });
        } else {
            pasoActualIndex++;
            ejecutarSiguientePaso();
        }
    }

    function animarDibujo(dibujo, duracionMs, onComplete) {
        if (!ctx) {
            console.error('⚠️ No se puede dibujar: el canvas "pizarraCanvas" no existe en el HTML.');
            onComplete?.();
            return;
        }

        const inicio = performance.now();
        ctx.strokeStyle = dibujo.color || "#4f46e5";
        ctx.fillStyle = dibujo.color || "#4f46e5";
        ctx.lineWidth = 4;
        ctx.lineCap = "round";

        function frame(ahora) {
            const progreso = Math.min((ahora - inicio) / duracionMs, 1);
            dibujarPasoConProgreso(dibujo, progreso);

            if (progreso < 1) {
                animFrameId = requestAnimationFrame(frame);
            } else {
                onComplete?.();
            }
        }
        animFrameId = requestAnimationFrame(frame);
    }

    function dibujarPasoConProgreso(paso, progreso) {
        if (!ctx) return;

        switch (paso.comando) {
            case "limpiar":
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                break;

            case "linea": {
                const xActual = paso.x + (paso.x2 - paso.x) * progreso;
                const yActual = paso.y + (paso.y2 - paso.y) * progreso;
                ctx.beginPath();
                ctx.moveTo(paso.x, paso.y);
                ctx.lineTo(xActual, yActual);
                ctx.stroke();
                break;
            }

            case "circulo": {
                const anguloActual = (2 * Math.PI) * progreso;
                ctx.beginPath();
                ctx.arc(paso.x, paso.y, paso.radio, 0, anguloActual);
                ctx.stroke();
                break;
            }

            case "rectangulo": {
                ctx.beginPath();
                if (progreso < 0.25) {
                    ctx.moveTo(paso.x, paso.y);
                    ctx.lineTo(paso.x + (paso.w * (progreso * 4)), paso.y);
                } else if (progreso < 0.5) {
                    ctx.moveTo(paso.x, paso.y);
                    ctx.lineTo(paso.x + paso.w, paso.y);
                    ctx.lineTo(paso.x + paso.w, paso.y + (paso.h * ((progreso - 0.25) * 4)));
                } else if (progreso < 0.75) {
                    ctx.moveTo(paso.x, paso.y);
                    ctx.lineTo(paso.x + paso.w, paso.y);
                    ctx.lineTo(paso.x + paso.w, paso.y + paso.h);
                    ctx.lineTo(paso.x + paso.w - (paso.w * ((progreso - 0.5) * 4)), paso.y + paso.h);
                } else {
                    ctx.moveTo(paso.x, paso.y);
                    ctx.lineTo(paso.x + paso.w, paso.y);
                    ctx.lineTo(paso.x + paso.w, paso.y + paso.h);
                    ctx.lineTo(paso.x, paso.y + paso.h);
                    ctx.lineTo(paso.x, paso.y + paso.h - (paso.h * ((progreso - 0.75) * 4)));
                }
                ctx.stroke();
                break;
            }

            case "texto": {
                if (paso.contenido) {
                    const caracteresMostrar = Math.floor(paso.contenido.length * progreso);
                    const textoParcial = paso.contenido.substring(0, caracteresMostrar);
                    ctx.clearRect(paso.x, paso.y - 24, canvas.width - paso.x, 30);
                    ctx.font = "bold 24px 'Hanken Grotesk', sans-serif";
                    ctx.fillStyle = "#f1f1f1";
                    ctx.fillText(textoParcial, paso.x, paso.y);
                }
                break;
            }
        }
    }
});