// Pantalla Historial: lista de registros con filtros, búsqueda por fecha,
// eliminación con confirmación y exportación a CSV.

import { CLAVES_TIPO, TIPOS } from '../modelo/eventos.js';
import { fechaLocal } from '../core/fecha.js';
import { descargarTexto } from '../core/descarga.js';
import { filtrarHistorial, ordenarRecientesPrimero } from '../servicios/consultas.js';
import { aCSV, nombreArchivoCSV } from '../servicios/csv.js';
import { EVENTO_CAMBIO } from '../servicios/registro.js';
import { h } from '../ui/dom.js';
import { ICONOS } from '../ui/iconos.js';
import { mostrarAviso } from '../ui/avisos.js';
import { confirmar } from '../ui/dialogo.js';
import { tarjetaEvento } from '../ui/tarjetaEvento.js';

// Los filtros se conservan mientras la app está abierta, aunque se cambie de pantalla.
const estadoFiltros = { tipo: 'todos', fecha: '' };

export function vistaHistorial({ servicio, bus }) {
  let eventos = [];
  let cargaVigente = 0;
  const raiz = h('section', { class: 'pagina pagina-historial' });

  async function cargar() {
    const turno = ++cargaVigente;
    try {
      const lista = await servicio.listar();
      if (turno !== cargaVigente) return;
      eventos = ordenarRecientesPrimero(lista);
      pintar();
    } catch (error) {
      console.error('[historial] no se pudieron leer los registros', error);
      raiz.replaceChildren(h('p', { class: 'vacio' }, 'No se pudo cargar el historial.'));
    }
  }

  function visibles() {
    return filtrarHistorial(eventos, estadoFiltros);
  }

  async function eliminar(evento) {
    const tipo = TIPOS[evento.tipo];
    const aceptado = await confirmar({
      titulo: '¿Eliminar registro?',
      mensaje: `Se borrará ${tipo.nombre.toLowerCase()} del ${evento.fecha} a las ${evento.hora.slice(0, 5)}. No se puede deshacer.`,
      textoAceptar: 'Eliminar',
      peligroso: true,
    });
    if (!aceptado) return;

    try {
      const ok = await servicio.eliminar(evento.id);
      mostrarAviso({
        titulo: ok ? 'Registro eliminado' : 'El registro ya no existía',
        tipo: ok ? 'ok' : 'info',
        duracion: 2500,
      });
    } catch (error) {
      console.error('[historial] error al eliminar', error);
      mostrarAviso({ titulo: 'No se pudo eliminar', detalle: error.message, tipo: 'error', duracion: 5000 });
    }
  }

  function exportar() {
    const lista = visibles();
    if (lista.length === 0) {
      mostrarAviso({ titulo: 'No hay registros para exportar', tipo: 'info', duracion: 2500 });
      return;
    }
    descargarTexto(nombreArchivoCSV(fechaLocal(new Date())), aCSV(lista));
    mostrarAviso({ titulo: 'CSV generado', detalle: `${lista.length} registros exportados`, tipo: 'ok', duracion: 2500 });
  }

  function pintar() {
    const lista = visibles();

    const chips = h(
      'div',
      { class: 'chips', role: 'group', 'aria-label': 'Filtrar por categoría' },
      ['todos', ...CLAVES_TIPO].map((clave) => {
        const etiqueta = clave === 'todos' ? 'Todos' : `${TIPOS[clave].icono} ${TIPOS[clave].nombre}`;
        return h(
          'button',
          {
            type: 'button',
            class: 'chip',
            'aria-pressed': String(estadoFiltros.tipo === clave),
            onclick: () => {
              estadoFiltros.tipo = clave;
              pintar();
            },
          },
          etiqueta,
        );
      }),
    );

    const barraFecha = h(
      'div',
      { class: 'barra-fecha' },
      h(
        'label',
        { class: 'campo-fecha' },
        h('span', { class: 'sr-only' }, 'Buscar por fecha'),
        h('span', { class: 'campo-fecha-icono', html: ICONOS.calendario }),
        h('input', {
          type: 'date',
          value: estadoFiltros.fecha || null,
          onchange: (e) => {
            estadoFiltros.fecha = e.target.value;
            pintar();
          },
        }),
      ),
      estadoFiltros.fecha
        ? h(
            'button',
            {
              type: 'button',
              class: 'btn btn-secundario btn-chico',
              onclick: () => {
                estadoFiltros.fecha = '';
                pintar();
              },
            },
            'Ver todas las fechas',
          )
        : null,
    );

    const cabecera = h(
      'div',
      { class: 'historial-cabecera' },
      h('p', { class: 'nota' }, `${lista.length} ${lista.length === 1 ? 'registro' : 'registros'}`),
      h(
        'button',
        { type: 'button', class: 'btn btn-secundario btn-chico', onclick: exportar, disabled: lista.length === 0 },
        h('span', { html: ICONOS.descargar }),
        ' Exportar CSV',
      ),
    );

    const contenido =
      eventos.length === 0
        ? h('p', { class: 'vacio' }, 'Todavía no hay registros.')
        : lista.length === 0
          ? h('p', { class: 'vacio' }, 'No hay registros con esos filtros.')
          : h('div', { class: 'lista' }, lista.map((e) => tarjetaEvento(e, { onEliminar: eliminar })));

    raiz.replaceChildren(chips, barraFecha, cabecera, contenido);
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
