import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Bus } from '../../js/core/bus.js';
import { MemoriaRepositorio } from '../../js/almacenamiento/repositorio.js';
import { EVENTO_CAMBIO, ESTADOS, RegistroService } from '../../js/servicios/registro.js';
import { obtenerContextoClima, MOTIVOS_TEXTO } from '../../js/servicios/clima.js';
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
    obtenerContexto: contexto ?? (async () => ({ temperatura: 22.5, ubicacion: { lat: 1, lon: 2 }, motivo: null })),
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

test('registrar guarda el evento con temperatura, ubicación y hora del toque', async () => {
  const { servicio, repo, cambios } = crearServicio();
  const r = await servicio.registrar('corazon');

  assert.equal(r.estado, ESTADOS.GUARDADO);
  assert.equal(r.evento.tipo, 'corazon');
  assert.equal(r.evento.temperatura, 22.5);
  assert.deepEqual(r.evento.ubicacion, { lat: 1, lon: 2 });
  assert.equal((await repo.listar()).length, 1);
  assert.equal(cambios.length, 1);
  assert.equal(cambios[0].accion, 'alta');
});

test('la hora del evento es la del toque aunque la temperatura tarde', async () => {
  const toque = 1_000_000;
  let finalizar;
  const lenta = () => new Promise((res) => (finalizar = res));
  const { servicio } = crearServicio({ contexto: lenta, reloj: toque });

  const pendiente = servicio.registrar('gasolinera');
  // Simulamos que pasaron 5 s hasta que llegó el clima.
  await new Promise((r) => setTimeout(r, 0));
  finalizar({ temperatura: 10, ubicacion: null, motivo: null });
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

  finalizar({ temperatura: 5, ubicacion: null, motivo: null });
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

test('si el contexto falla, se guarda igual con temperatura null y el motivo', async () => {
  const { servicio, repo } = crearServicio({
    contexto: async () => ({ temperatura: null, ubicacion: null, motivo: 'sin_permiso' }),
  });
  const r = await servicio.registrar('cuento');
  assert.equal(r.estado, ESTADOS.GUARDADO);
  assert.equal(r.motivo, 'sin_permiso');
  assert.equal((await repo.listar())[0].temperatura, null);
});

test('si el capturador lanza una excepción, igual se guarda sin datos de contexto', async () => {
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

// ───────── obtenerContextoClima ─────────

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
const fetchJson = (body, { status = 200 } = {}) => async () => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

test('clima: devuelve temperatura real redondeada a 1 decimal y ubicación con 4 decimales', async () => {
  const r = await obtenerContextoClima({
    geolocalizacion: geoOk(),
    fetchFn: fetchJson({ current: { temperature_2m: 21.456 } }),
  });
  assert.equal(r.temperatura, 21.5);
  assert.deepEqual(r.ubicacion, { lat: -31.4123, lon: -64.1877 });
  assert.equal(r.motivo, null);
});

test('clima: consulta el endpoint con latitud, longitud y temperature_2m', async () => {
  let url;
  await obtenerContextoClima({
    geolocalizacion: geoOk(-31.5, -64.25),
    fetchFn: async (u) => {
      url = u;
      return { ok: true, json: async () => ({ current: { temperature_2m: 3 } }) };
    },
    endpoint: 'https://example.test/forecast',
  });
  assert.match(url, /^https:\/\/example\.test\/forecast\?latitude=-31\.5&longitude=-64\.25&current=temperature_2m$/);
});

test('clima: permiso denegado -> sin temperatura y motivo sin_permiso (sin pedir clima)', async () => {
  let llamado = false;
  const r = await obtenerContextoClima({
    geolocalizacion: geoError(1),
    fetchFn: async () => {
      llamado = true;
      return { ok: true, json: async () => ({}) };
    },
  });
  assert.deepEqual(r, { temperatura: null, ubicacion: null, motivo: 'sin_permiso' });
  assert.equal(llamado, false);
});

test('clima: sin soporte de geolocalización', async () => {
  const r = await obtenerContextoClima({ geolocalizacion: undefined, fetchFn: fetchJson({}) });
  assert.equal(r.motivo, 'sin_soporte_ubicacion');
});

test('clima: código 2 y 3 de geolocalización se diferencian', async () => {
  assert.equal((await obtenerContextoClima({ geolocalizacion: geoError(2) })).motivo, 'sin_ubicacion');
  assert.equal((await obtenerContextoClima({ geolocalizacion: geoError(3) })).motivo, 'timeout_ubicacion');
});

test('clima: ubicación ok pero el servicio responde 500 -> guarda ubicación sin temperatura', async () => {
  const r = await obtenerContextoClima({
    geolocalizacion: geoOk(),
    fetchFn: fetchJson({}, { status: 500 }),
  });
  assert.equal(r.temperatura, null);
  assert.ok(r.ubicacion);
  assert.equal(r.motivo, 'error_servicio');
});

test('clima: respuesta sin temperature_2m numérico no se inventa un valor', async () => {
  const r = await obtenerContextoClima({
    geolocalizacion: geoOk(),
    fetchFn: fetchJson({ current: { temperature_2m: 'alta' } }),
  });
  assert.equal(r.temperatura, null);
  assert.equal(r.motivo, 'respuesta_invalida');
});

test('clima: error de red -> sin_conexion', async () => {
  const r = await obtenerContextoClima({
    geolocalizacion: geoOk(),
    fetchFn: async () => {
      throw new TypeError('Failed to fetch');
    },
  });
  assert.equal(r.motivo, 'sin_conexion');
  assert.equal(r.temperatura, null);
});

test('clima: el servicio que no responde a tiempo se corta con timeout_clima', async () => {
  const r = await obtenerContextoClima({
    geolocalizacion: geoOk(),
    timeoutClimaMs: 20,
    fetchFn: (_url, { signal }) =>
      new Promise((_res, rej) => {
        signal.addEventListener('abort', () => {
          const e = new Error('aborted');
          e.name = 'AbortError';
          rej(e);
        });
      }),
  });
  assert.equal(r.motivo, 'timeout_clima');
});

test('clima: cada motivo tiene un texto para mostrar', () => {
  for (const motivo of ['sin_permiso', 'sin_conexion', 'timeout_clima', 'error_servicio']) {
    assert.ok(MOTIVOS_TEXTO[motivo], motivo);
  }
});

// ───────── consultas ─────────

const ev = (id, tipo, fecha, hora, temperatura, creadoEn = `${fecha}T${hora}.000Z`) => ({
  id,
  tipo,
  fecha,
  hora,
  temperatura,
  ubicacion: null,
  creadoEn,
});

const DATOS = [
  ev('1', 'corazon', '2026-11-24', '09:00:00', 20),
  ev('2', 'gasolinera', '2026-11-22', '18:10:00', null),
  ev('3', 'cuento', '2026-11-18', '07:00:00', 14),
  ev('4', 'corazon', '2026-11-10', '12:00:00', 30),
  ev('5', 'corazon', '2026-10-26', '08:00:00', 10),
  ev('6', 'cuento', '2026-09-01', '08:00:00', 5),
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

test('resumir: totales, por tipo, último evento y promedio ignorando temperaturas nulas', () => {
  const r = resumir(DATOS);
  assert.equal(r.total, 6);
  assert.deepEqual(r.porTipo, { corazon: 3, gasolinera: 1, cuento: 2 });
  assert.equal(r.ultimo.id, '1');
  assert.equal(r.conTemperatura, 5);
  // (20 + 14 + 30 + 10 + 5) / 5 = 15.8
  assert.equal(r.temperaturaPromedio, 15.8);
});

test('resumir sin registros o sin temperaturas devuelve promedio null', () => {
  assert.deepEqual(resumir([]), {
    total: 0,
    porTipo: { corazon: 0, gasolinera: 0, cuento: 0 },
    ultimo: null,
    conTemperatura: 0,
    temperaturaPromedio: null,
  });
  assert.equal(resumir([ev('x', 'cuento', '2026-01-01', '00:00:00', null)]).temperaturaPromedio, null);
});

// ───────── CSV ─────────

test('aCSV genera encabezado RFC 4180 y filas con valores vacíos para null', () => {
  const eventos = [
    { id: 'a', tipo: 'corazon', fecha: '2026-11-24', hora: '09:00:00', temperatura: 20.5, ubicacion: { lat: -31.4, lon: -64.2 }, creadoEn: '2026-11-24T12:00:00.000Z' },
    { id: 'b', tipo: 'cuento', fecha: '2026-11-24', hora: '09:01:00', temperatura: null, ubicacion: null, creadoEn: '2026-11-24T12:01:00.000Z' },
  ];
  const texto = aCSV(eventos);
  const lineas = texto.trimEnd().split('\r\n');
  assert.equal(lineas[0], COLUMNAS_CSV.join(','));
  assert.equal(lineas[1], 'a,corazon,2026-11-24,09:00:00,20.5,-31.4,-64.2,2026-11-24T12:00:00.000Z');
  assert.equal(lineas[2], 'b,cuento,2026-11-24,09:01:00,,,,2026-11-24T12:01:00.000Z');
});

test('aCSV entrecomilla y escapa campos con comas o comillas', () => {
  const e = { id: 'a"b,c', tipo: 'cuento', fecha: '2026-11-24', hora: '09:00:00', temperatura: null, ubicacion: null, creadoEn: 'x' };
  const fila = aCSV([e]).split('\r\n')[1];
  assert.equal(fila.startsWith('"a""b,c",cuento'), true);
});

test('aCSV con lista vacía solo devuelve el encabezado', () => {
  assert.equal(aCSV([]), `${COLUMNAS_CSV.join(',')}\r\n`);
});

test('nombreArchivoCSV incluye la fecha local', () => {
  assert.equal(nombreArchivoCSV('2026-11-24'), 'registro-eventos-2026-11-24.csv');
});
