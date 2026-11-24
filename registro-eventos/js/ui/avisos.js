// Aviso flotante (confirmación de guardado, errores, progreso).
// Solo se muestra un aviso a la vez: uno nuevo reemplaza al anterior.

import { h } from './dom.js';
import { ICONOS } from './iconos.js';

const TIPOS_ICONO = { ok: ICONOS.check, error: ICONOS.alerta, info: ICONOS.info, progreso: ICONOS.info };

let temporizador = null;

const capa = () => document.getElementById('capa-avisos');

export function ocultarAviso() {
  clearTimeout(temporizador);
  temporizador = null;
  capa()?.replaceChildren();
}

/**
 * @param {object} opciones
 * @param {string} opciones.titulo
 * @param {Array<[string, string]>} [opciones.filas] pares etiqueta/valor (fecha, hora, ubicación...)
 * @param {'ok'|'error'|'info'|'progreso'} [opciones.tipo='ok']
 * @param {number} [opciones.duracion=3500] ms; 0 = queda visible hasta reemplazarlo
 * @param {string} [opciones.detalle]
 */
export function mostrarAviso({ titulo, detalle = '', filas = [], tipo = 'ok', duracion = 3500 }) {
  const contenedor = capa();
  if (!contenedor) return;

  const cerrar = () => ocultarAviso();
  const aviso = h(
    'div',
    { class: `aviso aviso-${tipo}`, role: tipo === 'error' ? 'alert' : 'status', onclick: cerrar },
    h('div', { class: 'aviso-icono', html: TIPOS_ICONO[tipo] ?? ICONOS.info }),
    h(
      'div',
      { class: 'aviso-cuerpo' },
      h('p', { class: 'aviso-titulo' }, titulo),
      detalle ? h('p', { class: 'aviso-detalle' }, detalle) : null,
      filas.length
        ? h(
            'dl',
            { class: 'aviso-filas' },
            filas.flatMap(([etiqueta, valor]) => [h('dt', {}, etiqueta), h('dd', {}, valor)]),
          )
        : null,
    ),
    h('button', { class: 'aviso-cerrar', type: 'button', 'aria-label': 'Cerrar', onclick: cerrar }, '×'),
  );

  contenedor.replaceChildren(aviso);
  clearTimeout(temporizador);
  temporizador = duracion > 0 ? setTimeout(cerrar, duracion) : null;
}
