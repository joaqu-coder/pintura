# Registro de eventos

PWA mobile first para registrar eventos con un solo toque. Cada registro guarda
tipo, fecha, hora exacta, temperatura ambiente (°C), ubicación (opcional) y un
identificador único.

- **Registro:** tres pines (❤️ Corazón, ⛽ Gasolinera, 🪙 Cuento).
- **Dashboard:** total, conteo por categoría, último evento, temperatura promedio,
  distribución en gráfico y filtro por Hoy / 7 días / 30 días / Todo.
- **Historial:** lista del más reciente al más antiguo, filtro por categoría,
  búsqueda por fecha, eliminación con confirmación y exportación a CSV.

Vive en `/registro-eventos/` del mismo sitio que la app de presupuestos, sin
depender de ella y sin tocar sus archivos. No tiene build ni dependencias de
runtime: son módulos ES nativos.

## Cómo abrirla

Necesita servirse por HTTP(S) (no con `file://`) porque usa módulos ES,
service worker y geolocalización. Desde la raíz del repo:

```
npm start          # o: npx serve . --listen 3000
```

Y abrir `http://localhost:3000/registro-eventos/`.

En el celular, al abrirla desde HTTPS, usar **Agregar a pantalla de inicio**
(Android / iOS) para instalarla.

## Permisos y temperatura

- La ubicación **se pide solo al tocar un pin**, no al abrir la app.
- La temperatura viene de [Open-Meteo](https://open-meteo.com/) (gratuito, sin
  API key) usando `current=temperature_2m` para la ubicación del dispositivo.
- Si no hay permiso, conexión o respuesta válida, el registro se guarda igual con
  `temperatura: null` y la confirmación indica el motivo. **Nunca se inventan valores.**

## Pruebas

```
node --test registro-eventos/tests/unit/*.test.mjs          # lógica pura (sin navegador)
node --test --test-timeout=60000 registro-eventos/tests/e2e/flujo.test.mjs   # Chromium con Playwright
```

Las pruebas de navegador levantan un servidor local y simulan la API del clima,
así que no necesitan internet. Para guardar capturas de cada pantalla:
`CAPTURAS_DIR=/ruta node --test registro-eventos/tests/e2e/flujo.test.mjs`.

## Arquitectura

```
index.html                 Estructura, barra de navegación inferior
css/app.css                Estilos (tokens de color, modo oscuro, animaciones)
sw.js                      Service worker (network-first, caché propio)
manifest.webmanifest       Instalación como PWA
icons/                     Íconos 192, 512 y maskable

js/
  main.js                  Punto de entrada: arma dependencias y rutas
  router.js                Navegación por hash (#/registro, #/dashboard, #/historial)
  core/                    Utilidades sin dependencias: fechas, ids, bus de eventos, errores, descarga
  modelo/eventos.js        Tipos, creación y validación de registros
  almacenamiento/          Contrato RepositorioEventos + localStorage + respaldo en memoria
  servicios/
    clima.js               Ubicación + temperatura (nunca lanza, devuelve motivo)
    registro.js            Orquesta captura, validación, guardado y anti-duplicados
    consultas.js           Filtros, orden y resúmenes (funciones puras)
    csv.js                 Exportación RFC 4180
  ui/                      Componentes reutilizables: DOM, avisos, diálogo, gráficos, tarjetas
  paginas/                 Registro, Dashboard, Historial (solo presentación)
```

Reglas de dependencia: las páginas usan servicios; los servicios usan el modelo y
el repositorio; nada de la lógica vive en el DOM.

### Formato de cada registro

```json
{
  "id": "3f0c…-uuid",
  "tipo": "corazon",
  "fecha": "2026-11-24",
  "hora": "14:32:05",
  "temperatura": 21.4,
  "ubicacion": { "lat": -31.4201, "lon": -64.1888 },
  "creadoEn": "2026-11-24T17:32:05.000Z"
}
```

- `fecha` y `hora` son la hora **local del dispositivo** en el momento del toque.
- `creadoEn` es un timestamp absoluto (UTC) para ordenar.
- `temperatura` y `ubicacion` pueden ser `null`.

### Persistencia y futura base en la nube

Hoy los datos están en `localStorage` bajo la clave `registro-eventos:v1`.
Si el navegador lo bloquea, la app sigue funcionando en memoria y muestra un aviso.

Todos los métodos del repositorio son **asíncronos** (`listar`, `guardar`,
`eliminar`). Para pasar a una base en la nube, basta con crear una clase nueva que
cumpla ese contrato (por ejemplo, una que llame a una API) e inyectarla en
`crearRepositorio()` de `js/almacenamiento/repositorio.js`. El resto de la app no cambia.

Si cambia el formato de los datos, subir el sufijo de la clave (`:v2`) y migrar
desde la versión anterior.

## Comportamientos a tener en cuenta

- **Toques duplicados:** mientras un pin guarda, sus toques se ignoran; después
  de guardar, el mismo pin no registra durante 2 segundos. El pin tiembla y no se
  tapa la confirmación visible.
- **Filtros de período:** "Últimos 7 días" = hoy y los 6 días anteriores (igual para 30).
- **Exportación CSV:** exporta los registros que están visibles con los filtros
  activos. Usa coma como separador y BOM UTF-8 para que Excel muestre bien tildes.
- **Sincronización entre pestañas:** si se registra o borra desde otra pestaña,
  Dashboard e Historial se actualizan solos.
