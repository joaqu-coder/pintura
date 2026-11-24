// Consultas puras sobre la lista de eventos: filtros, orden y resúmenes.
// No tocan el DOM ni el almacenamiento, así se prueban de forma aislada.

import { limitesPeriodo } from '../core/fecha.js';
import { CLAVES_TIPO } from '../modelo/eventos.js';

const marca = (evento) => Date.parse(evento.creadoEn);

/** Eventos del período indicado ('hoy' | '7d' | '30d' | 'todo'), según el día local `hoy`. */
export function filtrarPorPeriodo(eventos, periodo, hoy) {
  const limites = limitesPeriodo(periodo, hoy);
  if (!limites) return eventos.slice();
  return eventos.filter((e) => e.fecha >= limites.desde && e.fecha <= limites.hasta);
}

/** Copia ordenada con el registro más reciente primero. */
export function ordenarRecientesPrimero(eventos) {
  return eventos
    .slice()
    .sort((a, b) => marca(b) - marca(a) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}

/** Filtra por categoría ('todos' o clave de tipo) y por fecha exacta ('YYYY-MM-DD' o vacío). */
export function filtrarHistorial(eventos, { tipo = 'todos', fecha = '' } = {}) {
  return eventos.filter(
    (e) => (tipo === 'todos' || e.tipo === tipo) && (!fecha || e.fecha === fecha),
  );
}

/**
 * Indicadores del Dashboard.
 * La temperatura promedio solo considera registros que sí tienen temperatura.
 */
export function resumir(eventos) {
  const porTipo = Object.fromEntries(CLAVES_TIPO.map((clave) => [clave, 0]));
  let suma = 0;
  let conTemperatura = 0;
  let ultimo = null;

  for (const evento of eventos) {
    porTipo[evento.tipo] += 1;
    if (evento.temperatura !== null) {
      suma += evento.temperatura;
      conTemperatura += 1;
    }
    if (ultimo === null || marca(evento) > marca(ultimo)) {
      ultimo = evento;
    }
  }

  return {
    total: eventos.length,
    porTipo,
    ultimo,
    conTemperatura,
    temperaturaPromedio: conTemperatura > 0 ? Math.round((suma / conTemperatura) * 10) / 10 : null,
  };
}
