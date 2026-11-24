// Tarjeta visual de un registro (usada en el Historial).

import { TIPOS } from '../modelo/eventos.js';
import { formatearFecha, formatearHoraCorta } from '../core/fecha.js';
import { h } from './dom.js';
import { ICONOS } from './iconos.js';

export function tarjetaEvento(evento, { onEliminar }) {
  const tipo = TIPOS[evento.tipo];

  return h(
    'article',
    { class: 'evento', style: { '--c': tipo.color }, 'data-id': evento.id },
    h('div', { class: 'evento-icono', 'aria-hidden': 'true' }, tipo.icono),
    h(
      'div',
      { class: 'evento-cuerpo' },
      h('p', { class: 'evento-nombre' }, tipo.nombre),
      h('p', { class: 'evento-meta' }, `${formatearFecha(evento.fecha)} · ${formatearHoraCorta(evento.hora)}`),
    ),
    h(
      'button',
      {
        type: 'button',
        class: 'evento-borrar',
        'aria-label': `Eliminar registro de ${tipo.nombre.toLowerCase()} del ${formatearFecha(evento.fecha)}`,
        onclick: () => onEliminar(evento),
      },
      h('span', { html: ICONOS.papelera }),
    ),
  );
}
