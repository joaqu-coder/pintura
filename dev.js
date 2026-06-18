/**
 * dev.js — Servidor de desarrollo con auto-refresh para mobile
 *
 * Uso: node dev.js
 *
 * Hace dos cosas en paralelo:
 *  1. Levanta `npx serve` en el puerto 3000
 *  2. Vigila cambios en HTML/JS/CSS y bumpa el número de caché en sw.js
 *
 * Cada vez que sw.js cambia, el cel detecta un Service Worker nuevo,
 * lo instala, limpia el caché viejo y sirve los archivos actualizados.
 * Así cualquier cambio de código se ve en el cel con un solo reload.
 */

const { spawn } = require('child_process');
const fs   = require('fs');
const path = require('path');

const ROOT  = __dirname;
const SW    = path.join(ROOT, 'sw.js');
const PORT  = process.env.PORT || 3000;

// Archivos que, al cambiar, disparan el bump del SW
const WATCH_FILES = [
  'index.html',
  'app.legacy.js',
  'app.js',
  'styles.css',
  'manifest.json',
];

// Directorios a vigilar recursivamente
const WATCH_DIRS = ['data'];

function bumpSW() {
  try {
    let content = fs.readFileSync(SW, 'utf8');
    const prev  = content.match(/antigravity-v([\d]+)/)?.[1] || '0';
    const next  = Date.now();
    content = content.replace(
      /const CACHE = 'antigravity-v[\w]+';/,
      `const CACHE = 'antigravity-v${next}';`
    );
    fs.writeFileSync(SW, content, 'utf8');
    console.log(`[dev] sw.js bumped v${prev} → v${next} (cel recibirá nueva versión)`);
  } catch (e) {
    console.error('[dev] Error al bumpar sw.js:', e.message);
  }
}

// ── Watcher de archivos ──
let debounceTimer = null;
function schedBump(filename) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    console.log(`[dev] Cambio detectado: ${filename}`);
    bumpSW();
  }, 300); // espera 300ms para que el editor termine de escribir
}

WATCH_FILES.forEach(file => {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) return;
  fs.watch(full, () => schedBump(file));
});

WATCH_DIRS.forEach(dir => {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return;
  fs.watch(full, { recursive: true }, (_, filename) => schedBump(`${dir}/${filename}`));
});

// ── Servidor ──
console.log(`[dev] Iniciando servidor en http://localhost:${PORT}`);
console.log(`[dev] Vigilando: ${WATCH_FILES.join(', ')} + carpeta data/`);
console.log(`[dev] Cualquier cambio de código → sw.js se bumpa → cel se actualiza sólo\n`);

const server = spawn(
  'npx',
  ['serve', '-l', String(PORT), '--no-clipboard'],
  { stdio: 'inherit', shell: true, cwd: ROOT }
);

server.on('error', err => console.error('[dev] Error al iniciar serve:', err.message));
server.on('exit',  code => console.log(`[dev] Servidor terminado (código ${code})`));
