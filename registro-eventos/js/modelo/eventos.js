// Modelo de dominio: tipos de evento, creación y validación de registros.
//
// Estructura de un registro:
// {
//   id:          string UUID,
//   tipo:        "corazon" | "gasolinera" | "cuento",
//   fecha:       "YYYY-MM-DD" (día local),
//   hora:        "HH:MM:SS"   (hora local exacta),
//   temperatura: número en °C | null,
//   ubicacion:   { lat, lon } | null,
//   creadoEn:    ISO 8601 (UTC)
// }

import { esFechaValida, esHoraValida, fechaLocal, horaLocal } from '../core/fecha.js';
import { generarId } from '../core/ids.js';
import { ErrorValidacion } from '../core/errores.js';

export const TIPOS = Object.freeze({
  corazon: Object.freeze({ clave: 'corazon', nombre: 'Corazón', etiqueta: 'CORAZÓN', icono: '❤️', color: '#f43f5e' }),
  gasolinera: Object.freeze({ clave: 'gasolinera', nombre: 'Gasolinera', etiqueta: 'GASOLINERA', icono: '⛽', color: '#f59e0b' }),
  cuento: Object.freeze({ clave: 'cuento', nombre: 'Cuento', etiqueta: 'CUENTO', icono: '🪙', color: '#38bdf8' }),
});

export const CLAVES_TIPO = Object.freeze(Object.keys(TIPOS));

// Rango físico razonable para una temperatura ambiente (°C).
export const TEMPERATURA_MIN = -90;
export const TEMPERATURA_MAX = 60;

export function esTipoValido(tipo) {
  return CLAVES_TIPO.includes(tipo);
}

/** Devuelve la lista de problemas encontrados (vacía si el registro es válido). */
export function validarEvento(evento) {
  if (!evento || typeof evento !== 'object') {
    return ['El registro no es un objeto válido.'];
  }

  const problemas = [];

  if (typeof evento.id !== 'string' || evento.id.trim() === '') {
    problemas.push('id inválido');
  }
  if (!esTipoValido(evento.tipo)) {
    problemas.push('tipo inválido');
  }
  if (!esFechaValida(evento.fecha)) {
    problemas.push('fecha inválida');
  }
  if (!esHoraValida(evento.hora)) {
    problemas.push('hora inválida');
  }

  const temperatura = evento.temperatura;
  const temperaturaOk =
    temperatura === null ||
    (typeof temperatura === 'number' &&
      Number.isFinite(temperatura) &&
      temperatura >= TEMPERATURA_MIN &&
      temperatura <= TEMPERATURA_MAX);
  if (!temperaturaOk) {
    problemas.push('temperatura inválida');
  }

  const ubicacion = evento.ubicacion ?? null;
  if (ubicacion !== null) {
    const latOk = Number.isFinite(ubicacion.lat) && ubicacion.lat >= -90 && ubicacion.lat <= 90;
    const lonOk = Number.isFinite(ubicacion.lon) && ubicacion.lon >= -180 && ubicacion.lon <= 180;
    if (typeof ubicacion !== 'object' || !latOk || !lonOk) {
      problemas.push('ubicación inválida');
    }
  }

  if (typeof evento.creadoEn !== 'string' || Number.isNaN(Date.parse(evento.creadoEn))) {
    problemas.push('creadoEn inválido');
  }

  return problemas;
}

/**
 * Crea un registro nuevo a partir del tipo y del contexto capturado.
 * Lanza ErrorValidacion si el resultado no es válido.
 */
export function crearEvento({
  tipo,
  ahora = new Date(),
  temperatura = null,
  ubicacion = null,
  id = generarId(),
}) {
  if (Number.isNaN(ahora.getTime())) {
    throw new ErrorValidacion('La fecha del registro no es válida.');
  }

  const evento = {
    id,
    tipo,
    fecha: fechaLocal(ahora),
    hora: horaLocal(ahora),
    temperatura,
    ubicacion,
    creadoEn: ahora.toISOString(),
  };

  const problemas = validarEvento(evento);
  if (problemas.length > 0) {
    throw new ErrorValidacion(`Registro inválido: ${problemas.join(', ')}.`);
  }
  return evento;
}
