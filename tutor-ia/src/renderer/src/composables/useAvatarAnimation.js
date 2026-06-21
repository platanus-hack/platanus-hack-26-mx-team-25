import { reactive, ref, onUnmounted } from 'vue'

// Ruta RELATIVA (sin "/" inicial). Bajo file:// (Electron empaquetado) una ruta
// absoluta se interpreta como la raíz del disco, no la raíz de la app — por eso
// usamos "./assets/animation" en vez de "/assets/animation".
const ANIMATION_BASE_PATH = './assets/animation'

// ⚠️ TEMPORAL: mientras solo tengas frames de "happy", todos los estados
// apuntan ahí para que el avatar se vea mientras generas el resto.
// Cuando tengas IDLE/thinking/angry listos, revierte a los mapeos reales.
const ESTADO_A_CARPETA = {
    reposo: 'happy',
    hablando: 'happy',
    pensando: 'happy',
    confundido: 'happy',
    escuchando: 'happy',
}

export function useAvatarAnimation() {
    const avatarSrc = ref('')
    const avatarPos = reactive({ top: 20, left: 20 })

    let manifest = {}
    let animationTimeoutId = null
    let currentEstado = null
    let currentFrameIndex = 0
    let flotarIntervalId = null

    async function cargarManifest() {
        try {
            const res = await fetch(`${ANIMATION_BASE_PATH}/manifest.json`)
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            manifest = await res.json()
            console.log('Manifest de animaciones cargado:', Object.keys(manifest))
        } catch (err) {
            console.error('No se pudo cargar manifest.json de animaciones.', err)
        }
    }

    function detenerAnimacion() {
        if (animationTimeoutId) {
            clearTimeout(animationTimeoutId)
            animationTimeoutId = null
        }
    }

    function setAvatarEstado(estado, { onComplete } = {}) {
        const carpeta = ESTADO_A_CARPETA[estado]
        const def = carpeta ? manifest[carpeta] : null

        if (!def || !def.files || def.files.length === 0) {
            console.warn(`⚠️ Sin frames para el estado "${estado}" (carpeta "${carpeta}").`)
            return
        }

        detenerAnimacion()
        currentEstado = estado
        currentFrameIndex = 0

        const frameDurationMs = 1000 / (def.fps || 12)

        function mostrarFrame() {
            if (currentEstado !== estado) return

            avatarSrc.value = `${ANIMATION_BASE_PATH}/${carpeta}/${def.files[currentFrameIndex]}`
            currentFrameIndex++

            if (currentFrameIndex >= def.files.length) {
                if (def.loop) {
                    currentFrameIndex = 0
                    animationTimeoutId = setTimeout(mostrarFrame, frameDurationMs)
                } else {
                    onComplete?.()
                }
            } else {
                animationTimeoutId = setTimeout(mostrarFrame, frameDurationMs)
            }
        }

        mostrarFrame()
    }

    function flotarAleatoriamente(contenedorEl) {
        if (!contenedorEl) return
        const margen = 24
        const anchoAvatar = 110
        const altoAvatar = 110

        const maxLeft = Math.max(contenedorEl.clientWidth - anchoAvatar - margen, margen)
        const maxTop = Math.max(contenedorEl.clientHeight - altoAvatar - margen, margen)

        avatarPos.left = margen + Math.random() * (maxLeft - margen)
        avatarPos.top = margen + Math.random() * (maxTop - margen)
    }

    function iniciarFlotacion(contenedorRef, intervaloMs = 6000) {
        detenerFlotacion()
        flotarAleatoriamente(contenedorRef.value)
        flotarIntervalId = setInterval(() => flotarAleatoriamente(contenedorRef.value), intervaloMs)
    }

    function detenerFlotacion() {
        if (flotarIntervalId) {
            clearInterval(flotarIntervalId)
            flotarIntervalId = null
        }
    }

    onUnmounted(() => {
        detenerAnimacion()
        detenerFlotacion()
    })

    return { avatarSrc, avatarPos, cargarManifest, setAvatarEstado, iniciarFlotacion, detenerFlotacion }
}