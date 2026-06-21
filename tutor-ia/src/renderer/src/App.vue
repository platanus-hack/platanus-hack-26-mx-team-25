<script setup>
import { ref, onMounted } from 'vue'
import { useAvatarAnimation } from './composables/useAvatarAnimation'
import { useTutorSession} from './composables/useTutorSession'

const pizarraContainer = ref(null)
const canvas = ref(null)

const { avatarSrc, avatarPos, cargarManifest, setAvatarEstado, iniciarFlotacion } = useAvatarAnimation()
const { status, micActive, micEmoji, bootstrap } = useTutorSession({ canvasRef: canvas, setAvatarEstado })

onMounted(async () => {
  await cargarManifest()
  setAvatarEstado('hablando')
  iniciarFlotacion(pizarraContainer)
  await bootstrap()
})
</script>

<template>
  <header class="app-header">
    <h1 class="app-title">ZenZen</h1>
    <p class="app-status">{{ status }}</p>
    <div class="mic-container" :class="{ 'mic-active': micActive }">
      <span class="mic-icon">{{ micEmoji }}</span>
    </div>
  </header>

  <main class="board-wrapper">
    <div ref="pizarraContainer" id="pizarra-container">
      <canvas ref="canvas" width="1400" height="800"></canvas>
      <img
          class="avatar-float"
          :src="avatarSrc"
          :style="{ top: avatarPos.top + 'px', left: avatarPos.left + 'px' }"
          alt="ZenZen"
      />
    </div>
  </main>
</template>