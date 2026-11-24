// Pantalla Dashboard: indicadores y distribución, con filtro por período.
// Se repinta sola cuando cambian los datos (EVENTO_CAMBIO en el bus).

import { CLAVES_TIPO, TIPOS } from '../modelo/eventos.js';
import { PERIODOS, fechaLocal, formatearFecha, formatearHoraCorta } from '../core/fecha.js';
import { filtrarPorPeriodo, resumir } from '../servicios/consultas.js';
import { EVENTO_CAMBIO } from '../servicios/registro.js';
import { h } from '../ui/dom.js';
import { donut } from '../ui/graficos.js';

const formatoTemp = (v) => v.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function vistaDashboard({ servicio, bus }) {
  let periodo = 'todo';
  let eventos = [];
  let cargaVigente = 0;
  const raiz = h('section', { class: 'pagina pagina-dashboard' });

  async function cargar() {
    const turno = ++cargaVigente;
    try {
      const lista = await servicio.listar();
      if (turno !== cargaVigente) return; // llegó una carga más nueva
      eventos = lista;
      pintar();
    } catch (error) {
      console.error('[dashboard] no se pudieron leer los registros', error);
      raiz.replaceChildren(h('p', { class: 'vacio' }, 'No se pudieron cargar los indicadores.'));
    }
  }

  function pintar() {
    const visibles = filtrarPorPeriodo(eventos, periodo, fechaLocal(new Date()));
    const r = resumir(visibles);

    raiz.replaceChildren(
      h(
        'div',
        { class: 'segmentos', role: 'group', 'aria-label': 'Período' },
        Object.entries(PERIODOS).map(([clave, etiqueta]) =>
          h(
            'button',
            {
              type: 'button',
              class: 'seg',
              'aria-pressed': String(clave === periodo),
              onclick: () => {
                periodo = clave;
                pintar();
              },
            },
            etiqueta,
          ),
        ),
      ),

      h(
        'div',
        { class: 'tarjeta tarjeta-total' },
        h('p', { class: 'etiqueta' }, 'Total de registros'),
        h('p', { class: 'total-numero' }, String(r.total)),
        h('p', { class: 'nota' }, periodo === 'todo' ? 'Todo el período' : `Período: ${PERIODOS[periodo].toLowerCase()}`),
      ),

      h(
        'div',
        { class: 'grid-2' },
        h(
          'div',
          { class: 'tarjeta' },
          h('p', { class: 'etiqueta' }, 'Último evento'),
          r.ultimo
            ? h(
                'div',
                { class: 'ultimo' },
                h('span', { class: 'ultimo-icono', 'aria-hidden': 'true' }, TIPOS[r.ultimo.tipo].icono),
                h('p', { class: 'valor-principal' }, TIPOS[r.ultimo.tipo].nombre),
                h('p', { class: 'nota' }, `${formatearFecha(r.ultimo.fecha)}`),
                h('p', { class: 'nota' }, `${formatearHoraCorta(r.ultimo.hora)} h`),
              )
            : h('p', { class: 'nota' }, 'Sin registros en este período'),
        ),
        h(
          'div',
          { class: 'tarjeta' },
          h('p', { class: 'etiqueta' }, 'Temperatura promedio'),
          r.temperaturaPromedio !== null
            ? h(
                'div',
                {},
                h('p', { class: 'valor-principal' }, `${formatoTemp(r.temperaturaPromedio)} °C`),
                h('p', { class: 'nota' }, `De ${r.conTemperatura} ${r.conTemperatura === 1 ? 'registro' : 'registros'} con temperatura`),
              )
            : h('p', { class: 'nota' }, r.total > 0 ? 'Sin temperaturas registradas' : 'Sin datos todavía'),
        ),
      ),

      h(
        'div',
        { class: 'tarjeta' },
        h('p', { class: 'etiqueta' }, 'Distribución por categoría'),
        r.total > 0
          ? h(
              'div',
              { class: 'distribucion' },
              donut({
                segmentos: CLAVES_TIPO.map((c) => ({ valor: r.porTipo[c], color: TIPOS[c].color, etiqueta: TIPOS[c].nombre })),
                centro: String(r.total),
                subtitulo: 'total',
              }),
              h(
                'ul',
                { class: 'leyenda' },
                CLAVES_TIPO.map((clave) => {
                  const tipo = TIPOS[clave];
                  const cantidad = r.porTipo[clave];
                  const porcentaje = r.total > 0 ? Math.round((cantidad / r.total) * 100) : 0;
                  return h(
                    'li',
                    { class: 'leyenda-item', style: { '--c': tipo.color } },
                    h('div', { class: 'leyenda-cabecera' },
                      h('span', { class: 'leyenda-nombre' }, `${tipo.icono} ${tipo.nombre}`),
                      h('span', { class: 'leyenda-cifra' }, `${cantidad} · ${porcentaje}%`),
                    ),
                    h('div', { class: 'barra-fondo' }, h('div', { class: 'barra-valor', style: { width: `${porcentaje}%` } })),
                  );
                }),
              ),
            )
          : h('p', { class: 'vacio' }, 'Todavía no hay registros. Tocá un pin en Registro para empezar.'),
      ),
    );
  }

  const quitarSuscripcion = bus.on(EVENTO_CAMBIO, () => cargar());
  cargar();

  return {
    el: raiz,
    destruir() {
      quitarSuscripcion();
    },
  };
}
