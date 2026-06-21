import { ref, onMounted, onUnmounted } from 'vue'
// Ajusta esta ruta según dónde quede stt.js en tu nueva estructura Vue
import { SpeechToText } from '../voice/stt.js'

/**
 * @param {Object} deps
 * @param {import('vue').Ref<HTMLCanvasElement|null>} deps.canvasRef
 * @param {(estado: string, opts?: { onComplete?: () => void }) => void} deps.setAvatarEstado
 *        Viene de useAvatarAnimation() — se inyecta para no duplicar esa lógica aquí.
 */
export function useTutorSession({ canvasRef, setAvatarEstado }) {
    const status = ref('Iniciando sistema...')
    const micActive = ref(false)
    const micEmoji = ref('🎤')

    const grabadora = new SpeechToText()
    let isRecording = false

    let secuenciaActual = []
    let pasoActualIndex = 0
    let animFrameId = null
    let ctx = null

    function getCtx() {
        if (!ctx && canvasRef.value) {
            ctx = canvasRef.value.getContext('2d')
        }
        return ctx
    }

    // ---------------------------------------------------------------------
    // DIBUJO EN CANVAS
    // ---------------------------------------------------------------------
    function animarDibujo(dibujo, duracionMs, onComplete) {
        const context = getCtx()
        if (!context) {
            console.error('⚠️ No se puede dibujar: el canvas todavía no está montado.')
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

    // ---------------------------------------------------------------------
    // ORQUESTACIÓN: texto + dibujo sincronizados, paso a paso
    // ---------------------------------------------------------------------
    function procesarContratoInterfaz(data) {
        console.log('Contrato recibido:', data)

        if (data.avatar_estado) {
            setAvatarEstado(data.avatar_estado)
        }

        window.speechSynthesis.cancel()
        if (animFrameId) cancelAnimationFrame(animFrameId)

        // Formato nuevo: { secuencia: [{ texto, avatar_estado?, dibujo }] }
        if (data.secuencia && Array.isArray(data.secuencia)) {
            secuenciaActual = data.secuencia
            pasoActualIndex = 0
            ejecutarSiguientePaso()
            return
        }

        // Compatibilidad con el formato viejo: { texto_a_hablar, pasos_dibujo }
        if (data.texto_a_hablar || data.pasos_dibujo) {
            console.warn('⚠️ El agente sigue enviando el formato viejo (texto_a_hablar/pasos_dibujo). Sin sincronización fina hasta migrar el prompt al formato "secuencia".')

            if (data.texto_a_hablar) {
                status.value = data.texto_a_hablar
                const utterance = new SpeechSynthesisUtterance(data.texto_a_hablar)
                utterance.lang = 'es-MX'
                utterance.rate = 1.05
                utterance.onstart = () => setAvatarEstado('hablando')
                utterance.onend = () => setAvatarEstado('reposo')
                window.speechSynthesis.speak(utterance)
            }

            if (data.pasos_dibujo && Array.isArray(data.pasos_dibujo)) {
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

    function ejecutarSiguientePaso() {
        if (pasoActualIndex >= secuenciaActual.length) {
            setAvatarEstado('reposo')
            status.value = ''
            return
        }

        const paso = secuenciaActual[pasoActualIndex]
        setAvatarEstado(paso.avatar_estado || 'hablando')

        if (paso.texto) {
            status.value = paso.texto

            const utterance = new SpeechSynthesisUtterance(paso.texto)
            utterance.lang = 'es-MX'
            utterance.rate = 1.05

            const palabras = paso.texto.split(/\s+/).length
            const duracionEstimadaMs = (palabras / 2.5) * 1000

            utterance.onstart = () => {
                if (paso.dibujo) animarDibujo(paso.dibujo, duracionEstimadaMs)
            }

            utterance.onend = () => {
                if (paso.dibujo) {
                    if (animFrameId) cancelAnimationFrame(animFrameId)
                    dibujarPasoConProgreso(paso.dibujo, 1)
                }
                setAvatarEstado('reposo')
                pasoActualIndex++
                ejecutarSiguientePaso()
            }

            utterance.onerror = () => {
                setAvatarEstado('reposo')
                pasoActualIndex++
                ejecutarSiguientePaso()
            }

            window.speechSynthesis.speak(utterance)

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
    // VOZ (WALKIE-TALKIE: mantener barra espaciadora)
    // ---------------------------------------------------------------------
    async function manejarKeydown(event) {
        if (event.code === 'Space' && !isRecording) {
            isRecording = true
            status.value = 'Te escucho...'
            setAvatarEstado('escuchando')
            micActive.value = true
            micEmoji.value = '🎙️'

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

    async function manejarKeyup(event) {
        if (event.code === 'Space' && isRecording) {
            isRecording = false
            micActive.value = false
            micEmoji.value = '🎤'

            status.value = 'Transcribiendo...'
            setAvatarEstado('pensando')

            try {
                const textoTranscrito = await grabadora.stopRecordingAndTranscribe()
                status.value = `Tú: "${textoTranscrito}"\n\nAnalizando...`

                const respuesta = await window.electronAPI.enviarMensajeAlAgente(textoTranscrito)

                if (respuesta.success) {
                    procesarContratoInterfaz(respuesta.data)
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
            grabadora.apiKey = await window.electronAPI.getGroqKey()
            if (!grabadora.apiKey) console.warn('Falta clave de Groq en .env')

            const inicial = await window.electronAPI.inicializarTutor()
            if (inicial.success) {
                procesarContratoInterfaz(inicial.data)
            } else {
                status.value = 'Error al iniciar: ' + inicial.error
            }
        } catch (e) {
            console.error('Fallo crítico en inicialización:', e)
        }
    }
    
    onMounted(() => {
        window.addEventListener('keydown', manejarKeydown)
        window.addEventListener('keyup', manejarKeyup)
    })

    onUnmounted(() => {
        window.removeEventListener('keydown', manejarKeydown)
        window.removeEventListener('keyup', manejarKeyup)
        if (animFrameId) cancelAnimationFrame(animFrameId)
        window.speechSynthesis.cancel()
    })

    return { status, micActive, micEmoji, bootstrap }
}