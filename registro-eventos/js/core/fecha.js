// Utilidades de fecha y hora en la zona horaria LOCAL del dispositivo.
//
// Un registro guarda:
//   fecha -> "YYYY-MM-DD"  (día local del evento)
//   hora  -> "HH:MM:SS"    (hora local exacta del toque)
//   creadoEn -> ISO 8601 en UTC (timestamp absoluto, para ordenar)
//
// Guardar el día local como texto evita que un registro "cambie de día"
// al leerlo desde otra zona horaria, y permite filtrar por rangos con
// comparaciones de texto simples.

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const RE_HORA = /^\d{2}:\d{2}:\d{2}$/;

const dosDigitos = (n) => String(n).padStart(2, '0');

/** Devuelve la fecha local de un Date como "YYYY-MM-DD". */
export function fechaLocal(fecha) {
  return `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}`;
}

/** Devuelve la hora local de un Date como "HH:MM:SS". */
export function horaLocal(fecha) {
  return `${dosDigitos(fecha.getHours())}:${dosDigitos(fecha.getMinutes())}:${dosDigitos(fecha.getSeconds())}`;
}

export function esFechaValida(texto) {
  if (typeof texto !== 'string' || !RE_FECHA.test(texto)) return false;
  const [anio, mes, dia] = texto.split('-').map(Number);
  const f = new Date(Date.UTC(anio, mes - 1, dia));
  return f.getUTCFullYear() === anio && f.getUTCMonth() === mes - 1 && f.getUTCDate() === dia;
}

export function esHoraValida(texto) {
  if (typeof texto !== 'string' || !RE_HORA.test(texto)) return false;
  const [h, m, s] = texto.split(':').map(Number);
  return h < 24 && m < 60 && s < 60;
}

/** Suma días a una fecha "YYYY-MM-DD" sin depender de la zona horaria. */
export function sumarDias(fecha, dias) {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const f = new Date(Date.UTC(anio, mes - 1, dia + dias));
  return `${f.getUTCFullYear()}-${dosDigitos(f.getUTCMonth() + 1)}-${dosDigitos(f.getUTCDate())}`;
}

/** "2026-11-24" -> "mar 24 nov 2026" (texto para mostrar al usuario). */
export function formatearFecha(fecha) {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia)).toLocaleDateString('es-AR', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** "14:32:05" -> "14:32" */
export function formatearHoraCorta(hora) {
  return hora.slice(0, 5);
}

export const PERIODOS = Object.freeze({
  hoy: 'Hoy',
  '7d': '7 días',
  '30d': '30 días',
  todo: 'Todo',
});

/**
 * Rango inclusivo de días para un período. "Últimos 7 días" = hoy y los 6 anteriores.
 * Devuelve null para "todo" (sin límites).
 */
export function limitesPeriodo(periodo, hoy) {
  switch (periodo) {
    case 'hoy':
      return { desde: hoy, hasta: hoy };
    case '7d':
      return { desde: sumarDias(hoy, -6), hasta: hoy };
    case '30d':
      return { desde: sumarDias(hoy, -29), hasta: hoy };
    default:
      return null;
  }
}
