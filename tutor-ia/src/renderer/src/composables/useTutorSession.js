import { ref, onUnmounted, nextTick } from 'vue'
import { SpeechToText } from '../voice/stt.js'
import { TextToSpeech } from '../voice/tts.js'
import { HandTracker } from '../vision/HandTracker.js' 
import mermaid from 'mermaid'
import svgPanZoom from 'svg-pan-zoom'

/**
 * @param {Object} deps
 * @param {import('vue').Ref<HTMLCanvasElement|null>} deps.canvasRef
 * @param {import('vue').Ref<HTMLCanvasElement|null>} deps.debugCanvasRef
 * @param {import('vue').Ref<HTMLElement|null>} deps.mermaidContainerRef
 * @param {import('vue').Ref<HTMLElement|null>} deps.codeBlockRef
 * @param {import('vue').Ref<string>} deps.activeMode
 * @param {import('vue').Ref<string>} deps.codeLanguage
 * @param {import('vue').Ref<string>} deps.codeContent
 * @param {import('vue').Ref<string>} deps.mermaidContent
 * @param {(estado: string) => void} deps.setAvatarEstado
 */
export function useTutorSession({ 
    canvasRef, 
    debugCanvasRef, 
    mermaidContainerRef, 
    codeBlockRef,
    activeMode,
    codeLanguage,
    codeContent,
    mermaidContent,
    setAvatarEstado 
}) {
    const status = ref('Iniciando sistema...')
    const micActive = ref(false)
    const micEmoji = ref('🎤')
    const modoRatonActivo = ref(false) 
    
    const grabadora = new SpeechToText()
    const tts = new TextToSpeech() 
    let handTracker = null; 
    
    let isRecording = false
    let secuenciaActual = []
    let pasoActualIndex = 0
    let animFrameId = null
    let ctx = null
    let mermaidInitialized = false
    let panZoomInstance = null 

    function getCtx() {
        if (!ctx && canvasRef.value) {
            ctx = canvasRef.value.getContext('2d')
        }
        return ctx
    }

    function ocultarPanelesVisuales() {
        // Buscamos de forma segura por la referencia reactiva o por ID como fallback
        const mermaidContainer = mermaidContainerRef?.value || document.getElementById('mermaidContainer')
        const codeContainer = document.getElementById('codeContainer')

        if (mermaidContainer) mermaidContainer.style.display = 'none'
        if (codeContainer) codeContainer.style.display = 'none'
    }

    function mostrarModoCanvas() {
        activeMode.value = 'canvas'
        ocultarPanelesVisuales()
        if (canvasRef.value) canvasRef.value.style.display = 'block'
    }

    async function asegurarMermaid() {
        if (!mermaidInitialized) {
            mermaid.initialize({
                startOnLoad: false,
                theme: 'base',
                themeVariables: {
                    primaryColor: '#334155',        
                    primaryTextColor: '#f8fafc',    
                    primaryBorderColor: '#1e293b',  
                    lineColor: '#94a3b8',           
                    secondaryColor: '#3730a3',      
                    tertiaryColor: '#0f172a'        
                },
                securityLevel: 'loose'
            })
            mermaidInitialized = true
        }
    }

    async function renderMermaid(codigo) {
        await asegurarMermaid()

        const container = mermaidContainerRef?.value || document.getElementById('mermaidContainer')
        if (!container) return

        const codigoLimpio = codigo
            .replace(/```mermaid\n?/gi, '')
            .replace(/```\n?/g, '')
            .replace(/\\n/g, '\n')
            .replace(/\\"/g, '"')
            .trim()

        activeMode.value = 'mermaid'
        if (canvasRef.value) canvasRef.value.style.display = 'none'
        await nextTick()
        container.style.display = 'block'
        
        if (panZoomInstance) {
            panZoomInstance.destroy()
            panZoomInstance = null
        }
        
        container.innerHTML = ''
        const uniqueId = `mermaid-${Date.now()}`
        container.innerHTML = `<div class="mermaid" id="${uniqueId}" style="width: 100%; height: 100%;">${codigoLimpio}</div>`

        await nextTick()

        try {
            await mermaid.run({ nodes: [document.getElementById(uniqueId)] })

            const svgElement = document.querySelector(`#${uniqueId} svg`)
            if (svgElement) {
                svgElement.removeAttribute('style')
                svgElement.setAttribute('width', '100%')
                svgElement.setAttribute('height', '100%')

                panZoomInstance = svgPanZoom(svgElement, {
                    zoomEnabled: true,
                    controlIconsEnabled: false, 
                    fit: false,
                    center: true, 
                    minZoom: 0.3, 
                    maxZoom: 10,
                })
                
                panZoomInstance.resize()
                panZoomInstance.center()
                panZoomInstance.zoom(0.85)

                setTimeout(() => {
                    const nodoActivo = svgElement.querySelector('.highlight')
                    if (nodoActivo && panZoomInstance) {
                        panZoomInstance.zoom(1.2)
                        
                        const containerRect = container.getBoundingClientRect()
                        const nodeRect = nodoActivo.getBoundingClientRect()
                        
                        const screenCenterX = containerRect.left + (containerRect.width / 2)
                        const screenCenterY = containerRect.top + (containerRect.height / 2)
                        const nodeCenterX = nodeRect.left + (nodeRect.width / 2)
                        const nodeCenterY = nodeRect.top + (nodeRect.height / 2)

                        panZoomInstance.panBy({
                            x: screenCenterX - nodeCenterX,
                            y: screenCenterY - nodeCenterY
                        })
                    }
                }, 50)
            }

        } catch (error) {
            console.error('Error al renderizar Mermaid:', error)
            container.innerHTML = '<p style="color: #ef4444; padding: 20px;">⚠️ Error de sintaxis en el diagrama del Tutor.</p>'
        }
    }

    function renderCodeBlock(payload) {
        const codeContainer = document.getElementById('codeContainer')
        if (!codeContainer || !codeBlockRef.value) return

        const lenguaje = payload.lenguaje || 'txt'
        const codigo = payload.codigo || ''

        activeMode.value = 'code'
        codeLanguage.value = lenguaje
        codeContent.value = codigo
        codeBlockRef.value.className = `language-${lenguaje}`
        codeBlockRef.value.textContent = codigo
        codeContainer.style.display = 'block'
        if (canvasRef.value) canvasRef.value.style.display = 'none'
        if (mermaidContainerRef?.value) mermaidContainerRef.value.style.display = 'none'
    }

    // ---------------------------------------------------------------------
    // MOTOR GRÁFICO DEL CANVAS
    // ---------------------------------------------------------------------
    function animarDibujo(dibujo, duracionMs, onComplete) {
        const context = getCtx()
        if (!context) {
            onComplete?.()
            return
        }

        const inicio = performance.now()
        context.strokeStyle = dibujo.color || '#4f46e5'
        context.fillStyle = dibujo.color || '#4f46e5'
        context.lineWidth = 4
        context.lineCap = 'round'

        function frame(ahora) {
            const progreso = Math.min((ahora - inicio) / duracionMs, 1)
            dibujarPasoConProgreso(dibujo, progreso)

            if (progreso < 1) {
                animFrameId = requestAnimationFrame(frame)
            } else {
                onComplete?.()
            }
        }
        animFrameId = requestAnimationFrame(frame)
    }

    function dibujarPasoConProgreso(paso, progreso) {
        const context = getCtx()
        if (!context || !canvasRef.value) return
        const canvasEl = canvasRef.value

        switch (paso.comando) {
            case 'limpiar':
                context.clearRect(0, 0, canvasEl.width, canvasEl.height)
                break
            case 'linea': {
                const xActual = paso.x + (paso.x2 - paso.x) * progreso
                const yActual = paso.y + (paso.y2 - paso.y) * progreso
                context.beginPath()
                context.moveTo(paso.x, paso.y)
                context.lineTo(xActual, yActual)
                context.stroke()
                break
            }
            case 'circulo': {
                const anguloActual = (2 * Math.PI) * progreso
                context.beginPath()
                context.arc(paso.x, paso.y, paso.radio, 0, anguloActual)
                context.stroke()
                break
            }
            case 'rectangulo': {
                context.beginPath()
                if (progreso < 0.25) {
                    context.moveTo(paso.x, paso.y)
                    context.lineTo(paso.x + (paso.w * (progreso * 4)), paso.y)
                } else if (progreso < 0.5) {
                    context.moveTo(paso.x, paso.y)
                    context.lineTo(paso.x + paso.w, paso.y)
                    context.lineTo(paso.x + paso.w, paso.y + (paso.h * ((progreso - 0.25) * 4)))
                } else if (progreso < 0.75) {
                    context.moveTo(paso.x, paso.y)
                    context.lineTo(paso.x + paso.w, paso.y)
                    context.lineTo(paso.x + paso.w, paso.y + paso.h)
                    context.lineTo(paso.x + paso.w - (paso.w * ((progreso - 0.5) * 4)), paso.y + paso.h)
                } else {
                    context.moveTo(paso.x, paso.y)
                    context.lineTo(paso.x + paso.w, paso.y)
                    context.lineTo(paso.x + paso.w, paso.y + paso.h)
                    context.lineTo(paso.x, paso.y + paso.h)
                    context.lineTo(paso.x, paso.y + paso.h - (paso.h * ((progreso - 0.75) * 4)))
                }
                context.stroke()
                break
            }
            case 'texto': {
                if (paso.contenido) {
                    const caracteresMostrar = Math.floor(paso.contenido.length * progreso)
                    const textoParcial = paso.contenido.substring(0, caracteresMostrar)
                    context.clearRect(paso.x, paso.y - 24, canvasEl.width - paso.x, 30)
                    context.font = "bold 24px 'Hanken Grotesk', sans-serif"
                    context.fillStyle = '#f1f1f1'
                    context.fillText(textoParcial, paso.x, paso.y)
                }
                break
            }
        }
    }

    async function procesarContratoInterfaz(data) {
        console.log('Contrato recibido:', data)

        if (data.avatar_estado) {
            setAvatarEstado(data.avatar_estado)
        }

        if (animFrameId) cancelAnimationFrame(animFrameId)

        if (data.bloque_codigo) {
            renderCodeBlock(data.bloque_codigo)
            if (data.texto_a_hablar) {
                status.value = data.texto_a_hablar
                await tts.speak(data.texto_a_hablar)
            }
            return
        }

        if (data.codigo_mermaid && data.codigo_mermaid.trim() !== '') {
            mermaidContent.value = data.codigo_mermaid
            await renderMermaid(data.codigo_mermaid)
            if (data.texto_a_hablar) {
                status.value = data.texto_a_hablar
                await tts.speak(data.texto_a_hablar)
            }
            return
        }

        if (data.secuencia && Array.isArray(data.secuencia)) {
            secuenciaActual = data.secuencia
            pasoActualIndex = 0
            mostrarModoCanvas()
            ejecutarSiguientePaso()
            return
        }

        if (data.texto_a_hablar || data.pasos_dibujo) {
            console.warn('⚠️ El agente sigue enviando el formato viejo.')
            if (data.texto_a_hablar) {
                let textoLimpio = data.texto_a_hablar
                    .split('","')[0]
                    .split('", "')[0]
                    .split('codigo_mermaid')[0]
                    .replace(/["{}\\]/g, '');

                status.value = textoLimpio
                await tts.speak(textoLimpio);
            }

            if (data.pasos_dibujo && Array.isArray(data.pasos_dibujo)) {
                mostrarModoCanvas()
                let i = 0
                const dibujarSiguiente = () => {
                    if (i >= data.pasos_dibujo.length) return
                    dibujarPasoConProgreso(data.pasos_dibujo[i], 1)
                    i++
                    setTimeout(dibujarSiguiente, 400)
                }
                dibujarSiguiente()
            }
        }
    }

    async function ejecutarSiguientePaso() {
        if (pasoActualIndex >= secuenciaActual.length) {
            setAvatarEstado('reposo')
            status.value = ''
            return
        }

        const paso = secuenciaActual[pasoActualIndex]
        setAvatarEstado(paso.avatar_estado || 'hablando')

        if (paso.texto) {
            status.value = paso.texto
            const palabras = paso.texto.split(/\s+/).length
            const duracionEstimadaMs = (palabras / 2.5) * 1000

            if (paso.dibujo) animarDibujo(paso.dibujo, duracionEstimadaMs)

            try {
                await tts.speak(paso.texto)
            } catch (error) {
                console.error("Error TTS:", error)
            }

            if (paso.dibujo) {
                if (animFrameId) cancelAnimationFrame(animFrameId)
                dibujarPasoConProgreso(paso.dibujo, 1)
            }
            
            setAvatarEstado('reposo')
            pasoActualIndex++
            ejecutarSiguientePaso()

        } else if (paso.dibujo) {
            animarDibujo(paso.dibujo, 600, () => {
                pasoActualIndex++
                ejecutarSiguientePaso()
            })
        } else {
            pasoActualIndex++
            ejecutarSiguientePaso()
        }
    }

    // ---------------------------------------------------------------------
    // VISIÓN Y VOZ (INTERACCIÓN)
    // ---------------------------------------------------------------------
    function moverCursorVirtual(x, y) {
        if (!modoRatonActivo.value) return;
        
        const pixelX = x * window.innerWidth;
        const pixelY = y * window.innerHeight;
        
        const cursor = document.getElementById('cursor-virtual');
        if (cursor) {
            cursor.style.transform = `translate(${pixelX - 12}px, ${pixelY - 12}px)`;
        }
    }

    async function iniciarEscuchaPorMano() {
        if (!isRecording) {
            isRecording = true
            status.value = 'Mano levantada. Te escucho...'
            setAvatarEstado('escuchando')
            micActive.value = true
            micEmoji.value = '✋🎙️' 

            try {
                await grabadora.startRecording()
            } catch (error) {
                console.error(error)
                status.value = 'Error al iniciar micrófono.'
                isRecording = false
                micActive.value = false
            }
        }
    }

    async function detenerEscuchaPorMano() {
        if (isRecording) {
            isRecording = false
            micActive.value = false
            micEmoji.value = '🎤'
            status.value = 'Transcribiendo...'
            setAvatarEstado('pensando')

            try {
                const textoTranscrito = await grabadora.stopRecordingAndTranscribe()
                const textoMin = textoTranscrito.toLowerCase();
                status.value = `Tú: "${textoTranscrito}"\n\nAnalizando...`

                if (textoMin.includes('activar ratón') || textoMin.includes('activar raton') || textoMin.includes('usar pizarra')) {
                    modoRatonActivo.value = true;
                    status.value = '¡Modo ratón activado! Mueve tu dedo índice.';
                    await tts.speak("Modo ratón activado. Usa tu dedo índice para apuntar.");
                    setAvatarEstado('reposo')
                    return; 
                }

                if (textoMin.includes('desactivar ratón') || textoMin.includes('desactivar raton')) {
                    modoRatonActivo.value = false;
                    await tts.speak("Modo ratón desactivado.");
                    setAvatarEstado('reposo')
                    return;
                }

                const respuesta = await window.electronAPI.enviarMensajeAlAgente(textoTranscrito)
                if (respuesta.success) {
                    await procesarContratoInterfaz(respuesta.data)
                } else {
                    throw new Error(respuesta.error)
                }
            } catch (error) {
                status.value = 'Error en la conexión. Intenta de nuevo.'
                setAvatarEstado('confundido')
                console.error(error)
            }
        }
    }

    // ---------------------------------------------------------------------
    // ARRANQUE
    // ---------------------------------------------------------------------
    async function bootstrap() {
        try {
            await tts.init()
            
            const videoEl = document.createElement('video');
            videoEl.style.display = 'none';
            document.body.appendChild(videoEl);

            handTracker = new HandTracker(videoEl, debugCanvasRef.value, {
                onHandRaised: iniciarEscuchaPorMano,
                onHandLowered: detenerEscuchaPorMano,
                onFingerMove: moverCursorVirtual
            });
            await handTracker.init();

            grabadora.apiKey = await window.electronAPI.getGroqKey()
            
            const inicial = await window.electronAPI.inicializarTutor()
            if (inicial.success) {
                await procesarContratoInterfaz(inicial.data)
            } else {
                status.value = 'Error al iniciar: ' + inicial.error
            }
        } catch (e) {
            console.error('Fallo crítico en inicialización:', e)
        }
    }
    
    onUnmounted(() => {
        if (animFrameId) cancelAnimationFrame(animFrameId)
        if (tts.currentAudio) tts.currentAudio.pause();
    })

    return { status, micActive, micEmoji, bootstrap, modoRatonActivo }
}