// scripts/generate-zenzen-manifest.js
// Escanea src/renderer/assets/animation/<estado>/*.png y genera un manifest.json
// con la lista REAL de archivos por estado, ordenados por el número que contengan
// en el nombre (sirve tanto para "1.png" como para "imagen1.png").

const fs = require('fs');
const path = require('path');

const ANIM_DIR = path.join(__dirname, '..', 'src', 'renderer', 'public', 'assets', 'animation');
const OUTPUT = path.join(ANIM_DIR, 'manifest.json');

function numeroDeFrame(filename) {
    const match = filename.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
}

function buildManifest() {
    if (!fs.existsSync(ANIM_DIR)) {
        console.error(`❌ No existe la carpeta: ${ANIM_DIR}`);
        process.exit(1);
    }

    const estados = fs.readdirSync(ANIM_DIR).filter((name) => {
        return fs.statSync(path.join(ANIM_DIR, name)).isDirectory();
    });

    if (estados.length === 0) {
        console.error(`❌ No se encontraron subcarpetas de animación dentro de ${ANIM_DIR}`);
        process.exit(1);
    }

    const manifest = {};

    for (const estado of estados) {
        const carpeta = path.join(ANIM_DIR, estado);
        const archivos = fs.readdirSync(carpeta)
            .filter((f) => f.toLowerCase().endsWith('.png'))
            .sort((a, b) => numeroDeFrame(a) - numeroDeFrame(b));

        manifest[estado] = {
            files: archivos,
            fps: 12,
            loop: true,
        };
    }

    fs.writeFileSync(OUTPUT, JSON.stringify(manifest, null, 2));

    console.log(`✅ Manifest generado → ${OUTPUT}`);
    for (const [estado, def] of Object.entries(manifest)) {
        console.log(`   - ${estado}: ${def.files.length} frames`);
    }
}

buildManifest();