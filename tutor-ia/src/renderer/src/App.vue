<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import { useAvatarAnimation } from "./composables/useAvatarAnimation";
import { useTutorSession } from "./composables/useTutorSession";

const pizarraContainer = ref(null);
const canvasRef = ref(null);
const mermaidContainerRef = ref(null);
const codeBlockRef = ref(null);
const debugCanvasRef = ref(null);
const mostrarVision = ref(false);

const {
  avatarSrc,
  avatarPos,
  cargarManifest,
  setAvatarEstado,
  iniciarFlotacion,
} = useAvatarAnimation();

const {
  status,
  micActive,
  micEmoji,
  activeMode,
  codeLanguage,
  codeContent,
  bootstrap,
  modoRatonActivo,
} = useTutorSession({
  canvasRef,
  mermaidContainerRef,
  codeBlockRef,
  debugCanvasRef,
  setAvatarEstado,
});

// Función que escucha el teclado
function manejarAtajoVision(e) {
  // Si presionas la 'v' o 'V', se alterna la ventana
  if (e.key.toLowerCase() === "v") {
    mostrarVision.value = !mostrarVision.value;
  }
}

onMounted(async () => {
  window.addEventListener("keydown", manejarAtajoVision); // 👉 Activamos el atajo
  await cargarManifest();
  setAvatarEstado("hablando");
  iniciarFlotacion(pizarraContainer);
  await bootstrap();
});

onUnmounted(() => {
  window.removeEventListener("keydown", manejarAtajoVision); // 👉 Limpiamos memoria
});
</script>

<template>
  <div id="app-root">
    
    <header class="app-header">
      <h1 class="app-title">ZenZen</h1>
      <p class="app-status">{{ status }}</p>
      <div class="mic-container" :class="{ 'mic-active': micActive }">
        <span class="mic-icon">{{ micEmoji }}</span>
      </div>
    </header>

    <main class="board-wrapper">
      <div ref="pizarraContainer" id="pizarra-container" class="pizarra-root">
        
        <canvas 
          ref="canvasRef" 
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
        
      </div> </main>

  </div> </template>

<style scoped>
/* =========================================================
   ANIMACIONES DE MERMAID (Solo funcionan aquí en Vue)

/* Hacemos que las flechas se dibujen solas de inicio a fin */
:deep(.mermaid .edgePath .path) {
  stroke-dasharray: 1000;
  stroke-dashoffset: 1000;
  animation: drawLine 2s ease-in-out forwards;
}

/* Hacemos que las cajas y textos aparezcan suavemente */
:deep(.mermaid .node), 
:deep(.mermaid .edgeLabel) {
  opacity: 0;
  animation: fadeIn 1s ease-in forwards;
  animation-delay: 0.5s;
}

@keyframes drawLine {
  to { stroke-dashoffset: 0; }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
