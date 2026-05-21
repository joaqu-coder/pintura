/**
 * ═══════════════════════════════════════════════════════════════
 *  app.js — Punto de entrada y orquestador definitivo
 *  Antigravity Presupuestos · Etapa 6 (FINAL)
 * ═══════════════════════════════════════════════════════════════
 *
 *  Estado: app.legacy.js ya no es necesario.
 *  Todas las funcionalidades del monolito están migradas.
 *
 *  Inicializa:
 *    - IndexedDB + migraciones
 *    - Service Worker (PWA offline)
 *    - Pages: presupuestos, jornales, historial, configuracion
 *    - Expone funciones al HTML (onclick handlers globales)
 * ═══════════════════════════════════════════════════════════════
 */

import { runMigrations, storageInfo }                     from './storage.js';
import { goHome, goScreen, entrarModulo, entrarSubmodulo } from './router.js';
import { initPresupuestos, cargarPresupuesto,
         guardarActual, getResultado, getPresupuesto,
         selectObra as _selectObra }                      from './pages/presupuestos.js';
import { initJornales, cargarJornales,
         pjGUChange, pjMargenChange, pjSetIva,
         pjGuardar, getResultadoPJ }                      from './pages/jornales.js';
import { initHistorial, refreshHistorial }                from './pages/historial.js';
import { initConfiguracion }                             from './pages/configuracion.js';
import { abrirPdf, cerrarPdf }                           from './services/PdfService.js';
import { enviarWhatsApp }                                from './services/WhatsappService.js';
import { histGetById }                                   from './storage.js';

const DEBUG = false;

// ── BOOTSTRAP ────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {

  // 1. IndexedDB + migraciones
  await runMigrations();

  if (DEBUG) {
    const info = await storageInfo();
    console.info('[app] Storage:', info);
    const { runTests } = await import('./services/CalculoService.test.js');
    runTests();
  }

  // 2. Registrar Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js')
      .then(reg => { if (DEBUG) console.info('[SW] registrado:', reg.scope); })
      .catch(err => console.warn('[SW] registro fallido:', err));
  }

  // 3. Inicializar pages
  initPresupuestos();
  initJornales();

  initHistorial({
    onGuardar: () => guardarActual(),
    onCargar:  async (result) => {
      const tipo = result.tipo;
      if (tipo === 'jornales-ppto') {
        cargarJornales(result.modelo);
        entrarSubmodulo('jornales-ppto');
      } else {
        cargarPresupuesto(result.modelo);
        entrarModulo('pintura');
      }
    },
  });

  initConfiguracion(() => {
    // Config cambiada: el recálculo se dispara la próxima vez que
    // el usuario interactúe (lazy). No hace falta forzar aquí.
  });

  // 4. Exponer globals al HTML
  _exposeGlobals();

  // 5. Escuchar cambios de ruta
  document.addEventListener('router:change', async (e) => {
    const { screen } = e.detail;
    if (screen === 's-home') {
      refreshHistorial({ onCargar: async (r) => {
        if (r.tipo === 'jornales-ppto') { cargarJornales(r.modelo); entrarSubmodulo('jornales-ppto'); }
        else { cargarPresupuesto(r.modelo); entrarModulo('pintura'); }
      }});
    }
    if (DEBUG) console.debug('[router:change]', e.detail);
  });

});

// ── GLOBALS AL HTML ───────────────────────────────────────────────

function _exposeGlobals() {
  // Router
  window.goHome          = goHome;
  window.goScreen        = goScreen;
  window.entrarModulo    = entrarModulo;
  window.entrarSubmodulo = entrarSubmodulo;
  window.selectObra      = _selectObra;

  // Historial overlay
  window.openHist  = () => {
    refreshHistorial({ onCargar: async (r) => {
      document.getElementById('hist-overlay')?.classList.remove('open');
      if (r.tipo === 'jornales-ppto') { cargarJornales(r.modelo); entrarSubmodulo('jornales-ppto'); }
      else { cargarPresupuesto(r.modelo); entrarModulo('pintura'); }
    }});
    document.getElementById('hist-overlay')?.classList.add('open');
  };
  window.closeHist = () => document.getElementById('hist-overlay')?.classList.remove('open');

  // PDF
  window.closePdf        = cerrarPdf;
  window.openPdfFromHist = async (id) => { const item = await histGetById(id); if (item) abrirPdf(item); };

  // WhatsApp
  window.enviarWhatsApp  = async (id) => { const item = await histGetById(id); if (item) enviarWhatsApp(item); };

  // Guardar presupuesto
  window.guardarActual   = (nombre) => guardarActual(nombre);
  window.pjGuardar       = pjGuardar;

  // PJ controles
  window.pjGUChange      = pjGUChange;
  window.pjMargenChange  = pjMargenChange;
  window.pjSetIva        = pjSetIva;

  // Modal cotización (pintura)
  window.openModal = () => {
    const d = getResultado();
    const p = getPresupuesto();
    if (!d) return;
    // El modal usa datos del resultado para renderizar
    // La función _renderModalBody está en el HTML legacy hasta migración completa
    if (typeof _renderModalConDatos === 'function') _renderModalConDatos(d, p);
    document.getElementById('modal-overlay')?.classList.add('open');
  };
  window.closeModal    = () => document.getElementById('modal-overlay')?.classList.remove('open');
  window.closeModalOut = (e) => { if (e.target === document.getElementById('modal-overlay')) window.closeModal(); };

  // Edit overlay (historial)
  window.closeEdit    = () => { document.getElementById('edit-overlay')?.classList.remove('open'); };
  window.closeEditOut = (e) => { if (e.target === document.getElementById('edit-overlay')) window.closeEdit(); };
}

export { goHome, goScreen, entrarModulo, entrarSubmodulo };
