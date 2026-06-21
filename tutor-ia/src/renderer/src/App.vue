<script setup>
import { ref, onMounted, onUnmounted, watch } from "vue";
import mermaid from "mermaid";
import { useAvatarAnimation } from "./composables/useAvatarAnimation";
import { useTutorSession } from "./composables/useTutorSession";

const pizarraContainer = ref(null);
const canvas = ref(null);
const debugCanvas = ref(null);
const mostrarVision = ref(false);

// Refs de las capas de contenido
const activeMode = ref("canvas"); 
const mermaidContainerRef = ref(null);
const codeBlockRef = ref(null);
const codeLanguage = ref("javascript");
const codeContent = ref("");
const mermaidContent = ref(""); 

// LÓGICA DE ZOOM ULTRA SUAVE
const zoomLevel = ref(1);

function manejarZoom(e) {
  // Solo hace zoom si mantienes presionado Ctrl o Command
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    const zoomDelta = e.deltaY * -0.001; // Invertimos la rueda para que se sienta natural
    // Limitamos el zoom (mínimo 50%, máximo 300%)
    zoomLevel.value = Math.min(Math.max(0.5, zoomLevel.value + zoomDelta), 3);
  }
}

const {
  avatarSrc,
  avatarPos,
  cargarManifest,
  setAvatarEstado,
  iniciarFlotacion,
} = useAvatarAnimation();

const { status, micActive, micEmoji, bootstrap, modoRatonActivo } = useTutorSession({
  canvasRef: canvas,
  debugCanvasRef: debugCanvas,
  mermaidContainerRef: mermaidContainerRef, 
  codeBlockRef: codeBlockRef,               
  activeMode: activeMode,
  codeLanguage: codeLanguage,
  codeContent: codeContent,
  mermaidContent: mermaidContent,
  setAvatarEstado,
});

function manejarAtajos(e) {
  if (e.key.toLowerCase() === "v") {
    mostrarVision.value = !mostrarVision.value;
  }
  // Atajo rápido: Presiona '0' para resetear el zoom a la normalidad
  if (e.key === "0") {
    zoomLevel.value = 1;
  }
}

// RENDERIZADO REACTIVO DE MERMAID
watch([activeMode, mermaidContent], async ([newMode, newContent]) => {
  if (newMode === 'mermaid' && newContent && mermaidContainerRef.value) {
    try {
      mermaidContainerRef.value.innerHTML = '';
      const { svg } = await mermaid.render('mermaid-svg', newContent);
      mermaidContainerRef.value.innerHTML = svg;
    } catch (error) {
      console.error("Error dibujando diagrama Mermaid:", error);
    }
  }
});

onMounted(async () => {
  // Inicializamos Mermaid con un tema oscuro/hacker
  mermaid.initialize({ startOnLoad: false, theme: 'dark' }); 
  
  window.addEventListener("keydown", manejarAtajos);
  window.addEventListener("wheel", manejarZoom, { passive: false }); // Escuchamos el scroll

  await cargarManifest();
  setAvatarEstado("hablando");
  iniciarFlotacion(pizarraContainer);
  await bootstrap();
});

onUnmounted(() => {
  window.removeEventListener("keydown", manejarAtajos);
  window.removeEventListener("wheel", manejarZoom);
});
</script>

<template>
  <header class="app-header">
    <h1 class="app-title">ZenZen</h1>
    <p class="app-status">{{ status }}</p>
    <div class="mic-container" :class="{ 'mic-active': micActive }">
      <span class="mic-icon">{{ micEmoji }}</span>
    </div>
  </header>

  <main class="board-wrapper" style="overflow: hidden; /* Evita barras de scroll al hacer zoom */">
    <div 
      ref="pizarraContainer" 
      id="pizarra-container" 
      class="pizarra-root"
      :style="{ 
        transform: `scale(${zoomLevel})`, 
        transformOrigin: 'center center',
        transition: 'transform 0.05s linear' 
      }"
    >
      
      <canvas 
        ref="canvas" 
        width="1400" 
        height="800" 
        v-show="activeMode === 'canvas'"
        class="board-layer"
      ></canvas>

      <div 
        ref="mermaidContainerRef" 
        id="mermaidContainer" 
        v-show="activeMode === 'mermaid'"
        class="board-layer mermaid-layer"
      ></div>

      <div 
        id="codeContainer" 
        v-show="activeMode === 'code'"
        class="board-layer code-layer"
      >
        <pre><code ref="codeBlockRef" :class="'language-' + codeLanguage">{{ codeContent }}</code></pre>
      </div>

      <img
          class="avatar-float"
          :src="avatarSrc"
          :style="{ top: avatarPos.top + 'px', left: avatarPos.left + 'px' }"
          alt="ZenZen"
      />
    </div>
  </main>

  <div 
    id="cursor-virtual" 
    v-show="modoRatonActivo" 
    style="
      position: fixed; top: 0; left: 0; width: 24px; height: 24px; 
      background-color: rgba(239, 68, 68, 0.9); border: 3px solid white;
      border-radius: 50%; pointer-events: none; z-index: 9999; 
      transition: transform 0.03s linear; box-shadow: 0 4px 6px rgba(0,0,0,0.3);
    "
  ></div>

  <div 
    v-show="mostrarVision" 
    class="vision-debug-container" 
    style="
      position: fixed; bottom: 20px; right: 20px; border: 2px solid #4f46e5; 
      border-radius: 8px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.5); 
      z-index: 10000; background: #000;
    "
  >
    <div style="background: #4f46e5; color: white; padding: 4px 8px; font-size: 12px; font-weight: bold; font-family: sans-serif; display: flex; justify-content: space-between;">
      <span>👁️ Visión IA</span>
      <span style="color: #a5b4fc;">Live</span>
    </div>
    <canvas ref="debugCanvas" width="320" height="240" style="display: block;"></canvas>
  </div>
</template>

<style scoped>
/* Las animaciones fluidas de Mermaid se mantienen intactas */
:deep(.mermaid .edgePath .path) {
  stroke-dasharray: 1000;
  stroke-dashoffset: 1000;
  animation: drawLine 2s ease-in-out forwards;
}
:deep(.mermaid .node), 
:deep(.mermaid .edgeLabel) {
  opacity: 0;
  animation: fadeIn 1s ease-in forwards;
  animation-delay: 0.5s;
}
@keyframes drawLine { to { stroke-dashoffset: 0; } }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
</style>