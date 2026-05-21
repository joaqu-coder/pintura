# Antigravity — Presupuestos
## Cómo trabajar en la PC

---

### Primera vez (solo una vez)

Abrí el símbolo del sistema o PowerShell **en la carpeta del proyecto** y ejecutá:

```
npm start
```

Si dice que `npx` no está instalado, primero instalá Node.js desde https://nodejs.org  
(versión LTS, el instalador incluye npm automáticamente).

---

### Todos los días

1. Abrí **VS Code** en la carpeta del proyecto
2. Abrí la terminal integrada: `Ctrl + Ñ` o menú Terminal → Nueva terminal
3. Escribí:

```
npm start
```

4. Abrí el navegador en: **http://localhost:3000**
5. Listo. La app funciona completa.

---

### Estructura de archivos

```
/
├── index.html                  ← HTML principal (no tocar)
├── package.json                ← Configuración del proyecto
├── service-worker.js           ← PWA offline
├── manifest.json               ← Instalable en celular
│
└── assets/
    ├── css/
    │   └── styles.css          ← Todos los estilos
    │
    └── js/
        ├── app.js              ← Punto de entrada (ES6)
        ├── app.legacy.js       ← Lógica original (no tocar)
        ├── ui.js               ← Helpers de DOM
        ├── storage.js          ← Guardado (IndexedDB)
        ├── router.js           ← Navegación entre pantallas
        │
        ├── models/
        │   ├── Item.js
        │   ├── Presupuesto.js
        │   ├── PresupuestoJornales.js
        │   └── Empresa.js
        │
        ├── services/
        │   ├── CalculoService.js       ← Motor de cálculo
        │   ├── PresupuestoService.js   ← Historial
        │   ├── WhatsappService.js      ← Mensajes WA
        │   └── PdfService.js          ← Vista PDF
        │
        ├── components/
        │   ├── AmbienteCard.js         ← Tarjetas de ambiente
        │   ├── CarpinteriaPanel.js     ← Carpintería + materiales
        │   └── CostosPanel.js         ← Costos extra
        │
        └── pages/
            ├── presupuestos.js         ← Módulo Pintura
            ├── jornales.js            ← Módulo Jornales
            ├── historial.js           ← Historial
            └── configuracion.js       ← Config global
```

---

### Dónde modificar cada cosa

| Quiero cambiar...              | Archivo                              |
|-------------------------------|--------------------------------------|
| Colores, tipografía, layout   | `assets/css/styles.css`              |
| Cálculo de impuestos          | `assets/js/services/CalculoService.js` |
| Texto del mensaje de WhatsApp | `assets/js/services/WhatsappService.js` |
| Diseño del PDF                | `assets/js/services/PdfService.js`   |
| Configuración (jornales, ART) | `assets/js/pages/configuracion.js`   |
| Formulario de Jornales PJ     | `assets/js/pages/jornales.js`        |
| Guardado / historial          | `assets/js/storage.js`               |
| Navegación entre pantallas    | `assets/js/router.js`                |
| HTML de las pantallas         | `index.html`                         |

---

### Regla clave

`app.legacy.js` **no se toca**. Contiene las funciones que el HTML
todavía necesita (render de costos, modal de cotización, etc.).
Cuando una función se migre a un módulo nuevo, se elimina del legacy.
