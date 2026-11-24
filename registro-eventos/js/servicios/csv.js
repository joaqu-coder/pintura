// Exportación de registros a CSV (RFC 4180: separador coma, comillas dobles escapadas).

export const COLUMNAS_CSV = Object.freeze([
  'id',
  'tipo',
  'fecha',
  'hora',
  'temperatura_c',
  'latitud',
  'longitud',
  'creado_en',
]);

function celda(valor) {
  if (valor === null || valor === undefined) return '';
  const texto = String(valor);
  return /[",\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/** Convierte una lista de eventos en texto CSV. Los valores vacíos quedan en blanco. */
export function aCSV(eventos) {
  const filas = eventos.map((e) =>
    [e.id, e.tipo, e.fecha, e.hora, e.temperatura, e.ubicacion?.lat, e.ubicacion?.lon, e.creadoEn]
      .map(celda)
      .join(','),
  );
  return [COLUMNAS_CSV.join(','), ...filas].join('\r\n') + '\r\n';
}

/** Nombre del archivo exportado, con la fecha local del día. */
export function nombreArchivoCSV(fechaHoy) {
  return `registro-eventos-${fechaHoy}.csv`;
}
