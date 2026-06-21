import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
    main: {
        build: {
            rollupOptions: {
                input: resolve(__dirname, 'src/main/index.js')
            }
        }
    },
    preload: {
        build: {
            rollupOptions: {
                input: resolve(__dirname, 'src/preload/index.js')
            }
        }
    },
    renderer: {
        plugins: [vue()]
    }
})