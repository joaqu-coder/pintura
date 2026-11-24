import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Bus } from '../../js/core/bus.js';
import { MemoriaRepositorio } from '../../js/almacenamiento/repositorio.js';
import { EVENTO_CAMBIO, ESTADOS, RegistroService } from '../../js/servicios/registro.js';
import { obtenerContextoUbicacion, MOTIVOS_TEXTO } from '../../js/servicios/ubicacion.js';
import { filtrarHistorial, filtrarPorPeriodo, ordenarRecientesPrimero, resumir } from '../../js/servicios/consultas.js';
import { aCSV, nombreArchivoCSV, COLUMNAS_CSV } from '../../js/servicios/csv.js';
import { ErrorValidacion } from '../../js/core/errores.js';

// ───────── RegistroService ─────────

function crearServicio({ contexto, reloj, ventana = 2000, repo = new MemoriaRepositorio() } = {}) {
  let ahora = reloj ?? 1_000_000;
  const bus = new Bus();
  const cambios = [];
  bus.on(EVENTO_CAMBIO, (d) => cambios.push(d));
  const servicio = new RegistroService({
    repositorio: repo,
    bus,
    obtenerContexto: contexto ?? (async () => ({ ubicacion: { lat: 1, lon: 2 }, motivo: null })),
    reloj: () => ahora,
    ventanaDuplicadoMs: ventana,
  });
  return {
    servicio,
    repo,
    cambios,
    avanzar(ms) {
      ahora += ms;
    },
  };
}

test('registrar guarda el evento con ubicación y hora del toque', async () => {
  const { servicio, repo, cambios } = crearServicio();
  const r = await servicio.registrar('corazon');

  assert.equal(r.estado, ESTADOS.GUARDADO);
  assert.equal(r.evento.tipo, 'corazon');
  assert.equal('temperatura' in r.evento, false);
  assert.deepEqual(r.evento.ubicacion, { lat: 1, lon: 2 });
  assert.equal((await repo.listar()).length, 1);
  assert.equal(cambios.length, 1);
  assert.equal(cambios[0].accion, 'alta');
});

test('la hora del evento es la del toque aunque la ubicación tarde', async () => {
  const toque = 1_000_000;
  let finalizar;
  const lenta = () => new Promise((res) => (finalizar = res));
  const { servicio } = crearServicio({ contexto: lenta, reloj: toque });

  const pendiente = servicio.registrar('gasolinera');
  await new Promise((r) => setTimeout(r, 0));
  finalizar({ ubicacion: null, motivo: null });
  const r = await pendiente;
  assert.equal(r.evento.creadoEn, new Date(toque).toISOString());
});

test('toques repetidos mientras se guarda se ignoran (estado ocupado)', async () => {
  let finalizar;
  const lenta = () => new Promise((res) => (finalizar = res));
  const { servicio, repo } = crearServicio({ contexto: lenta });

  const primero = servicio.registrar('cuento');
  const segundo = await servicio.registrar('cuento');
  assert.equal(segundo.estado, ESTADOS.OCUPADO);

  finalizar({ ubicacion: null, motivo: null });
  await primero;
  assert.equal((await repo.listar()).length, 1);
});

test('después de guardar, el mismo pin no registra durante la ventana anti-duplicados', async () => {
  const { servicio, repo, avanzar } = crearServicio({ ventana: 2000 });

  assert.equal((await servicio.registrar('corazon')).estado, ESTADOS.GUARDADO);
  avanzar(500);
  assert.equal((await servicio.registrar('corazon')).estado, ESTADOS.DUPLICADO);
  assert.equal((await repo.listar()).length, 1);

  avanzar(2000);
  assert.equal((await servicio.registrar('corazon')).estado, ESTADOS.GUARDADO);
  assert.equal((await repo.listar()).length, 2);
});

test('la ventana anti-duplicados es por pin: otro tipo sí registra', async () => {
  const { servicio, repo } = crearServicio();
  await servicio.registrar('corazon');
  assert.equal((await servicio.registrar('gasolinera')).estado, ESTADOS.GUARDADO);
  assert.equal((await repo.listar()).length, 2);
});

test('si la ubicación falla, se guarda igual con ubicación null y el motivo', async () => {
  const { servicio, repo } = crearServicio({
    contexto: async () => ({ ubicacion: null, motivo: 'sin_permiso' }),
  });
  const r = await servicio.registrar('cuento');
  assert.equal(r.estado, ESTADOS.GUARDADO);
  assert.equal(r.motivo, 'sin_permiso');
  assert.equal((await repo.listar())[0].ubicacion, null);
});

test('si el capturador lanza una excepción, igual se guarda sin ubicación', async () => {
  const { servicio, repo } = crearServicio({
    contexto: async () => {
      throw new Error('boom');
    },
  });
  const r = await servicio.registrar('corazon');
  assert.equal(r.estado, ESTADOS.GUARDADO);
  assert.equal(r.motivo, 'error_inesperado');
  assert.equal((await repo.listar())[0].ubicacion, null);
});

test('si el guardado falla, el error llega a la UI, no se emite cambio y el pin se libera', async () => {
  const repo = new MemoriaRepositorio();
  repo.guardar = async () => {
    throw new Error('disco lleno');
  };
  const { servicio, cambios } = crearServicio({ repo });

  await assert.rejects(() => servicio.registrar('corazon'), /disco lleno/);
  assert.equal(cambios.length, 0);

  repo.guardar = MemoriaRepositorio.prototype.guardar;
  assert.equal((await servicio.registrar('corazon')).estado, ESTADOS.GUARDADO);
});

test('tipo desconocido se rechaza con ErrorValidacion', async () => {
  const { servicio } = crearServicio();
  await assert.rejects(() => servicio.registrar('otro'), ErrorValidacion);
});

test('eliminar emite cambio solo si el registro existía', async () => {
  const { servicio, cambios } = crearServicio();
  const r = await servicio.registrar('cuento');
  assert.equal(await servicio.eliminar(r.evento.id), true);
  assert.equal(await servicio.eliminar(r.evento.id), false);
  assert.equal(cambios.filter((c) => c.accion === 'baja').length, 1);
});

// ───────── obtenerContextoUbicacion ─────────

const geoOk = (lat = -31.41234, lon = -64.18768) => ({
  getCurrentPosition(ok) {
    ok({ coords: { latitude: lat, longitude: lon } });
  },
});
const geoError = (code) => ({
  getCurrentPosition(_ok, fail) {
    fail({ code, message: 'x' });
  },
});

test('ubicación: devuelve lat y lon con 4 decimales', async () => {
  const r = await obtenerContextoUbicacion({ geolocalizacion: geoOk() });
  assert.deepEqual(r.ubicacion, { lat: -31.4123, lon: -64.1877 });
  assert.equal(r.motivo, null);
});

test('ubicación: permiso denegado -> ubicación null y motivo sin_permiso', async () => {
  const r = await obtenerContextoUbicacion({ geolocalizacion: geoError(1) });
  assert.deepEqual(r, { ubicacion: null, motivo: 'sin_permiso' });
});

test('ubicación: sin soporte de geolocalización', async () => {
  const r = await obtenerContextoUbicacion({ geolocalizacion: undefined });
  assert.equal(r.motivo, 'sin_soporte_ubicacion');
});

test('ubicación: código 2 y 3 de geolocalización se diferencian', async () => {
  assert.equal((await obtenerContextoUbicacion({ geolocalizacion: geoError(2) })).motivo, 'sin_ubicacion');
  assert.equal((await obtenerContextoUbicacion({ geolocalizacion: geoError(3) })).motivo, 'timeout_ubicacion');
});

test('ubicación: si el navegador no responde a tiempo, se corta con timeout_ubicacion', async () => {
  const colgado = { getCurrentPosition() {} };
  const r = await obtenerContextoUbicacion({ geolocalizacion: colgado, timeoutUbicacionMs: 20 });
  assert.equal(r.motivo, 'timeout_ubicacion');
});

test('ubicación: cada motivo tiene un texto para mostrar', () => {
  for (const motivo of ['sin_permiso', 'sin_ubicacion', 'timeout_ubicacion', 'sin_soporte_ubicacion']) {
    assert.ok(MOTIVOS_TEXTO[motivo], motivo);
  }
});

// ───────── consultas ─────────

const ev = (id, tipo, fecha, hora, creadoEn = `${fecha}T${hora}.000Z`) => ({
  id,
  tipo,
  fecha,
  hora,
  ubicacion: null,
  creadoEn,
});

const DATOS = [
  ev('1', 'corazon', '2026-11-24', '09:00:00'),
  ev('2', 'gasolinera', '2026-11-22', '18:10:00'),
  ev('3', 'cuento', '2026-11-18', '07:00:00'),
  ev('4', 'corazon', '2026-11-10', '12:00:00'),
  ev('5', 'corazon', '2026-10-26', '08:00:00'),
  ev('6', 'cuento', '2026-09-01', '08:00:00'),
];

test('filtrarPorPeriodo: hoy, 7 días, 30 días y todo (límites inclusivos)', () => {
  const hoy = '2026-11-24';
  const ids = (lista) => lista.map((e) => e.id).sort();
  assert.deepEqual(ids(filtrarPorPeriodo(DATOS, 'hoy', hoy)), ['1']);
  assert.deepEqual(ids(filtrarPorPeriodo(DATOS, '7d', hoy)), ['1', '2', '3']);
  assert.deepEqual(ids(filtrarPorPeriodo(DATOS, '30d', hoy)), ['1', '2', '3', '4', '5']);
  assert.equal(filtrarPorPeriodo(DATOS, 'todo', hoy).length, DATOS.length);
});

test('ordenarRecientesPrimero pone el registro más nuevo primero sin mutar la entrada', () => {
  const copia = DATOS.slice();
  const orden = ordenarRecientesPrimero(DATOS).map((e) => e.id);
  assert.deepEqual(orden, ['1', '2', '3', '4', '5', '6']);
  assert.deepEqual(DATOS, copia);
});

test('filtrarHistorial combina categoría y fecha exacta', () => {
  assert.equal(filtrarHistorial(DATOS, { tipo: 'corazon' }).length, 3);
  assert.deepEqual(filtrarHistorial(DATOS, { tipo: 'todos', fecha: '2026-11-22' }).map((e) => e.id), ['2']);
  assert.deepEqual(filtrarHistorial(DATOS, { tipo: 'cuento', fecha: '2026-11-22' }), []);
  assert.equal(filtrarHistorial(DATOS, {}).length, DATOS.length);
});

test('resumir: totales, por tipo y último evento', () => {
  const r = resumir(DATOS);
  assert.equal(r.total, 6);
  assert.deepEqual(r.porTipo, { corazon: 3, gasolinera: 1, cuento: 2 });
  assert.equal(r.ultimo.id, '1');
});

test('resumir sin registros devuelve ceros y último null', () => {
  assert.deepEqual(resumir([]), {
    total: 0,
    porTipo: { corazon: 0, gasolinera: 0, cuento: 0 },
    ultimo: null,
  });
});

// ───────── CSV ─────────

test('aCSV genera encabezado RFC 4180 y filas con valores vacíos para null', () => {
  const eventos = [
    { id: 'a', tipo: 'corazon', fecha: '2026-11-24', hora: '09:00:00', ubicacion: { lat: -31.4, lon: -64.2 }, creadoEn: '2026-11-24T12:00:00.000Z' },
    { id: 'b', tipo: 'cuento', fecha: '2026-11-24', hora: '09:01:00', ubicacion: null, creadoEn: '2026-11-24T12:01:00.000Z' },
  ];
  const texto = aCSV(eventos);
  const lineas = texto.trimEnd().split('\r\n');
  assert.equal(lineas[0], COLUMNAS_CSV.join(','));
  assert.equal(lineas[0].includes('temperatura'), false);
  assert.equal(lineas[1], 'a,corazon,2026-11-24,09:00:00,-31.4,-64.2,2026-11-24T12:00:00.000Z');
  assert.equal(lineas[2], 'b,cuento,2026-11-24,09:01:00,,,2026-11-24T12:01:00.000Z');
});

test('aCSV entrecomilla y escapa campos con comas o comillas', () => {
  const e = { id: 'a"b,c', tipo: 'cuento', fecha: '2026-11-24', hora: '09:00:00', ubicacion: null, creadoEn: 'x' };
  const fila = aCSV([e]).split('\r\n')[1];
  assert.equal(fila.startsWith('"a""b,c",cuento'), true);
});

test('aCSV con lista vacía solo devuelve el encabezado', () => {
  assert.equal(aCSV([]), `${COLUMNAS_CSV.join(',')}\r\n`);
});

test('nombreArchivoCSV incluye la fecha local', () => {
  assert.equal(nombreArchivoCSV('2026-11-24'), 'registro-eventos-2026-11-24.csv');
});
