# La Chamba Verde — Pintura 🎨

Calculadora de presupuestos de pintura profesional. Funciona como **PWA** (se puede instalar en el celular como app).

## Archivos

```
la-chamba-verde/
├── index.html       ← app completa
├── manifest.json    ← config PWA
├── sw.js            ← service worker (offline)
├── icon-192.png     ← ícono app
└── icon-512.png     ← ícono splash
```

## Cómo subir a GitHub Pages (paso a paso)

### 1. Crear cuenta en GitHub
- Entrá a [github.com](https://github.com) → **Sign up**
- Elegí un nombre de usuario (ej: `lachambaverde`)

### 2. Crear repositorio
- Click en **New repository** (botón verde)
- Nombre: `pintura` (o el que quieras)
- Dejá en **Public**
- Tildá **Add a README file**
- Click **Create repository**

### 3. Subir los archivos
- Dentro del repositorio, click en **Add file → Upload files**
- Arrastrá estos 5 archivos: `index.html`, `manifest.json`, `sw.js`, `icon-192.png`, `icon-512.png`
- Click **Commit changes**

### 4. Activar GitHub Pages
- Ir a **Settings** (arriba a la derecha del repo)
- Menú izquierdo → **Pages**
- En *Source* elegí **Deploy from a branch**
- Branch: **main** / folder: **/ (root)**
- Click **Save**

### 5. ¡Listo!
En 1-2 minutos tu app va a estar en:
```
https://TU-USUARIO.github.io/pintura/
```

## Instalar como app en el celular
1. Abrí la URL en Chrome (Android) o Safari (iPhone)
2. Android: menú ⋮ → **Agregar a pantalla de inicio**
3. iPhone: compartir 📤 → **Agregar a pantalla de inicio**

La app funciona **sin internet** después de la primera visita.
