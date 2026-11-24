// Punto de entrada: arma las dependencias y conecta navegación, servicios y pantallas.

import { Bus } from './core/bus.js';
import { CLAVE_STORAGE, crearRepositorio } from './almacenamiento/repositorio.js';
import { obtenerContextoUbicacion } from './servicios/ubicacion.js';
import { EVENTO_CAMBIO, RegistroService } from './servicios/registro.js';
import { iniciarRouter } from './router.js';
import { vistaRegistro } from './paginas/registro.js';
import { vistaDashboard } from './paginas/dashboard.js';
import { vistaHistorial } from './paginas/historial.js';
import { mostrarAviso } from './ui/avisos.js';

const RUTAS = {
  registro: { titulo: 'Registro', crear: (deps) => vistaRegistro(deps) },
  dashboard: { titulo: 'Dashboard', crear: (deps) => vistaDashboard(deps) },
  historial: { titulo: 'Historial', crear: (deps) => vistaHistorial(deps) },
};

function iniciar() {
  const bus = new Bus();
  const { repositorio, persistente } = crearRepositorio();
  const servicio = new RegistroService({
    repositorio,
    bus,
    obtenerContexto: () => obtenerContextoUbicacion(),
  });
  const deps = { servicio, bus };

  // Avisar si los datos no se podrán conservar al cerrar la app.
  if (!persistente) {
    document.getElementById('aviso-persistencia')?.removeAttribute('hidden');
  }

  // Sincronizar entre pestañas: si otra pestaña guarda o borra, repintar aquí.
  globalThis.addEventListener('storage', (evento) => {
    if (evento.key === CLAVE_STORAGE || evento.key === null) {
      bus.emit(EVENTO_CAMBIO, { accion: 'externo' });
    }
  });

  const enlaces = [...document.querySelectorAll('.barra a[data-ruta]')];
  const titulo = document.getElementById('titulo');

  iniciarRouter({
    contenedor: document.getElementById('vista'),
    rutas: Object.fromEntries(
      Object.entries(RUTAS).map(([nombre, ruta]) => [nombre, { crear: () => ruta.crear(deps) }]),
    ),
    rutaPorDefecto: 'registro',
    alCambiar(nombre) {
      titulo.textContent = RUTAS[nombre].titulo;
      document.title = `${RUTAS[nombre].titulo} · Registro de eventos`;
      for (const enlace of enlaces) {
        if (enlace.dataset.ruta === nombre) enlace.setAttribute('aria-current', 'page');
        else enlace.removeAttribute('aria-current');
      }
    },
  });

  registrarServiceWorker();
}

function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').catch((error) => {
    // La app funciona igual sin service worker; solo pierde la instalación offline.
    console.warn('[sw] no se pudo registrar', error);
  });
}

try {
  iniciar();
} catch (error) {
  console.error('[app] error al iniciar', error);
  document.getElementById('vista')?.replaceChildren();
  mostrarAviso({ titulo: 'No se pudo iniciar la app', detalle: error.message, tipo: 'error', duracion: 0 });
}
