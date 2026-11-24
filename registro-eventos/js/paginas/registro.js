// Pantalla Registro: tres pines circulares. Un toque = un registro.

import { CLAVES_TIPO, TIPOS } from '../modelo/eventos.js';
import { ESTADOS } from '../servicios/registro.js';
import { MOTIVOS_TEXTO } from '../servicios/ubicacion.js';
import { formatearFecha, formatearHoraCorta, fechaLocal } from '../core/fecha.js';
import { h } from '../ui/dom.js';
import { mostrarAviso } from '../ui/avisos.js';

const vibrar = (ms) => {
  try {
    globalThis.navigator?.vibrate?.(ms);
  } catch {
    // Algunos navegadores no permiten vibrar; no es un error de la app.
  }
};

export function vistaRegistro({ servicio }) {
  const pines = new Map();

  async function tocar(clave) {
    const pin = pines.get(clave);
    const tipo = TIPOS[clave];

    // Toque accidental o repetido: se ignora sin tapar la confirmación visible.
    if (!servicio.puedeRegistrar(clave)) {
      sacudir(pin);
      return;
    }

    vibrar(18);
    pin.classList.add('pulsando');
    pin.setAttribute('aria-busy', 'true');
    mostrarAviso({ titulo: `Guardando ${tipo.nombre.toLowerCase()}…`, detalle: 'Obteniendo ubicación', tipo: 'progreso', duracion: 0 });

    let resultado;
    try {
      resultado = await servicio.registrar(clave);
    } catch (error) {
      resultado = { estado: 'error', error };
    } finally {
      pin.classList.remove('pulsando');
      pin.removeAttribute('aria-busy');
    }

    switch (resultado.estado) {
      case ESTADOS.GUARDADO:
        confirmarVisualmente(pin);
        mostrarConfirmacion(resultado.evento, resultado.motivo);
        break;
      case ESTADOS.DUPLICADO:
      case ESTADOS.OCUPADO:
        sacudir(pin);
        break;
      default:
        console.error('[registro] no se pudo guardar', resultado.error);
        mostrarAviso({
          titulo: 'No se pudo guardar',
          detalle: resultado.error?.message ?? 'Intentá de nuevo.',
          tipo: 'error',
          duracion: 5000,
        });
    }
  }

  const botones = CLAVES_TIPO.map((clave) => {
    const tipo = TIPOS[clave];
    const pin = h(
      'button',
      {
        type: 'button',
        class: `pin pin-${clave}`,
        style: { '--c': tipo.color },
        'aria-label': `Registrar ${tipo.nombre.toLowerCase()}`,
        onclick: () => tocar(clave),
      },
      h(
        'span',
        { class: 'pin-disco', 'aria-hidden': 'true' },
        h('span', { class: 'pin-icono' }, tipo.icono),
      ),
      h('span', { class: 'pin-etiqueta', 'aria-hidden': 'true' }, tipo.etiqueta),
    );
    pines.set(clave, pin);
    return pin;
  });

  const hoy = new Date();
  const el = h(
    'section',
    { class: 'pagina pagina-registro' },
    h('p', { class: 'registro-fecha' }, formatearFecha(fechaLocal(hoy))),
    h('h2', { class: 'titulo-pagina' }, 'Tocá un pin para registrar'),
    h('div', { class: 'pines' }, botones),
    h(
      'p',
      { class: 'ayuda' },
      'Se guarda al instante con fecha y hora. La ubicación se pide solo al registrar.',
    ),
  );

  return { el, destruir() {} };
}

function sacudir(pin) {
  pin.classList.remove('ignorado');
  void pin.offsetWidth;
  pin.classList.add('ignorado');
  setTimeout(() => pin.classList.remove('ignorado'), 400);
}

function confirmarVisualmente(pin) {
  pin.classList.remove('confirmado');
  // Forzar reflow para reiniciar la animación si se toca varias veces seguidas.
  void pin.offsetWidth;
  pin.classList.add('confirmado');
  setTimeout(() => pin.classList.remove('confirmado'), 900);
}

function mostrarConfirmacion(evento, motivo) {
  const tipo = TIPOS[evento.tipo];
  const ubicacion =
    evento.ubicacion === null
      ? `No disponible${motivo ? ` · ${MOTIVOS_TEXTO[motivo] ?? 'sin datos'}` : ''}`
      : 'Guardada';

  mostrarAviso({
    titulo: `${tipo.nombre} registrado`,
    tipo: 'ok',
    duracion: 4000,
    filas: [
      ['Fecha', formatearFecha(evento.fecha)],
      ['Hora', formatearHoraCorta(evento.hora)],
      ['Ubicación', ubicacion],
    ],
  });
}
