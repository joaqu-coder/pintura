# Antigravity Presupuestos — Guía para Claude Code

## Regla crítica: siempre bumpar sw.js al hacer push

Cada vez que se modifica cualquier archivo de la app (app.legacy.js, index.html, styles.css,
app.js, manifest.json) se DEBE actualizar la versión del caché en sw.js ANTES de hacer commit.

Si no se hace, el Service Worker del navegador/PWA sirve la versión anterior y los cambios
no se ven aunque el código esté correcto en el repositorio.

### Cómo bumpar sw.js

Ejecutar este comando antes de `git commit`:

```bash
node -e "
const fs = require('fs');
const sw = fs.readFileSync('sw.js', 'utf8');
const updated = sw.replace(
  /const CACHE = 'antigravity-v[\w]+';/,
  \`const CACHE = 'antigravity-v\${Date.now()}';\`
);
fs.writeFileSync('sw.js', updated, 'utf8');
console.log('sw.js bumped OK');
"
```

O simplemente incluir `sw.js` en el `git add` del commit que toca código.

### Archivos que requieren bump de sw.js

- app.legacy.js
- app.js
- index.html
- styles.css
- manifest.json
- Cualquier archivo nuevo incluido en ASSETS de sw.js

### Archivos que NO requieren bump

- sw.js en sí mismo (si solo se bumpa el CACHE)
- CLAUDE.md
- dev.js
- package.json
- Archivos en data/ (los datos del scraper no afectan el runtime)

## Arquitectura

- **Servidor de desarrollo local**: `node dev.js` (bumpa sw.js automáticamente al detectar cambios)
- **Puerto**: 3000
- **Service Worker**: estrategia network-first — siempre sirve la versión más nueva cuando hay conexión
- **Persistencia**: todo en `localStorage` bajo la clave `antigravity_historial`

## Módulos principales

- `app.legacy.js` — monolito con toda la lógica (3300+ líneas)
- `index.html` — UI única (SPA)
- `styles.css` — estilos
- `sw.js` — Service Worker PWA

## Estado del proyecto (2025-06)

Módulo Proyecto completamente auditado y corregido. Ver commits recientes para el detalle.
